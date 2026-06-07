import axios from 'axios';
import { createHash, randomUUID } from 'crypto';
import { ConceptTourRequest, FlexiblePassCitySummary, FlexiblePassOptionsResponse, FlexiblePassQuoteRequest, FlexiblePassQuoteResponse, FlexiblePassTourSummary, TourRequest, TourResponse } from '../types/api';
import { wikimediaService } from './wikimediaService';
import { ListToursOptions, TourRepository } from '../domain/repositories/TourRepository';
import { AudioAssetRepository } from '../domain/repositories/AudioAssetRepository';
import { Tour } from '../domain/entities/Tour';
import { Place, PlaceSourcePoiMetadata } from '../domain/entities/Place';
import { ConceptPoiRef } from '../domain/concepts/TourConcept';
import { PostgresTourRepository } from '../infrastructure/postgres/PostgresTourRepository';
import { prismaClient } from '../infrastructure/db/prismaClient';
import { PostgresAudioAssetRepository } from '../infrastructure/postgres/PostgresAudioAssetRepository';
import { LocalFileAudioStorage } from '../infrastructure/local-storage/LocalFileAudioStorage';
import { AudioStorage } from '../domain/storage/AudioStorage';
import { geocodeCity } from '../infrastructure/geocoder/NominatimGeocoder';
import { fetchPoisForTheme } from '../infrastructure/poi/OverpassPoiFetcher';
import { rankPois } from './poi/PoiRanker';
import { PostgresPoiCacheRepository } from '../infrastructure/postgres/PostgresPoiCacheRepository';
import { PostgresPoiEnrichmentCacheRepository } from '../infrastructure/postgres/PostgresPoiEnrichmentCacheRepository';
import {
  PostgresTourQualityReviewQueueRepository,
  TourQualityReviewQueueStatus,
} from '../infrastructure/postgres/PostgresTourQualityReviewQueueRepository';
import { EnrichedPoi } from '../domain/poi/EnrichedPoi';
import { RawPoi } from '../domain/poi/RawPoi';
import { Theme } from '../domain/poi/themeTags';
import { classifyPoiTags } from '../domain/poi/PoiClassification';
import { CityNotAvailableError } from '../domain/errors/CityNotAvailableError';
import { CityQualityNotAvailableError } from '../domain/errors/CityQualityNotAvailableError';
import { buildNarration } from './narrative/NarrativeBuilder';
import { composeWalkingRoute, estimateRouteMetrics, buildDiversePrefix, orderRouteCandidates, RouteDiagnostics, RouteSelectionResult } from './poi/RouteSelection';
import { getDurationPlan } from './poi/DurationPlanning';
import { fetchWikidataLandmarkMetadata, tierPoisByLandmarkFame } from './poi/LandmarkTiering';
import { enrichShortlistedPois } from './poi/PoiEnrichmentPipeline';
import { TourQualityStatus } from '../types/tourQuality';
import { getQualityStatusForRequest } from './tourQuality/VerifiedCities';
import { computeTourConfidence, ComputeTourConfidenceInput, getTourConfidenceGateMode } from './tourQuality/TourConfidenceGate';
import { attemptTourQualityRepair, getTourQualityRepairMode } from './tourQuality/TourQualityRepair';
import { evaluateTourContentReadiness } from './tourReadiness/contentReadiness';
import { getConceptDisplayCopy } from './cityIntelligence/conceptDisplayCopy';

interface StructuralTourPlace {
  poi: EnrichedPoi;
  name: string;
  nameInTourLanguage?: string;
  coordinates: { lat: number; lng: number };
  importance_score: number;
  fameScore?: number;
  landmarkTier?: string;
  category: string;
  estimatedDuration: number;
}

interface StructuralTourData {
  places: StructuralTourPlace[];
  routeCandidates: StructuralTourPlace[];
  routeDiagnostics: RouteDiagnostics;
  confidenceInput: ComputeTourConfidenceInput;
}

interface ExactTourMatch {
  tour: Tour;
  response: TourResponse;
  hasCompleteAudio: boolean;
}

interface StoredTourConcept {
  slug: string;
  title: string;
  routeType: string;
  estimatedStops: number;
  suggestedDurationMinutes: number;
  anchorPoiIds: unknown;
  supportingPoiIds: unknown;
}

interface StageTimer {
  end: () => number;
}

const FLEXIBLE_PASS_TOURS_REQUIRED = 3;
const FLEXIBLE_PASS_MIN_STOP_COUNT = 5;
const FLEXIBLE_PASS_PRICE_CENTS = 1499;
const FLEXIBLE_PASS_INDIVIDUAL_PRICE_CENTS = 699;
const FLEXIBLE_PASS_CURRENCY = 'USD';

/**
 * Service responsible for orchestrating interactions between the backend and all pods
 */
export class OrchestrationService {
  private llmServiceUrl: string;
  private descriptionServiceUrl: string;
  private voxcpmServiceUrl?: string;
  private kokoroServiceUrl: string;
  private readonly audioStorage: AudioStorage;
  private readonly audioSectionOrder = ['arrival', 'history', 'significance', 'transition'];

  constructor(
    private readonly tourRepository: TourRepository,
    private readonly audioAssetRepository: AudioAssetRepository,
    audioStorage: AudioStorage,
    private readonly tourQualityReviewQueueRepository: Pick<PostgresTourQualityReviewQueueRepository, 'enqueue'> = new PostgresTourQualityReviewQueueRepository(prismaClient)
  ) {
    this.audioStorage = audioStorage;
    // In production, use service names
    // In development with problematic networking, use appropriate fallbacks
    const env = process.env.NODE_ENV || 'development';
    const useServiceNames = process.env.USE_SERVICE_NAMES === 'true' || env === 'production';

    if (useServiceNames) {
      // Production mode: use service discovery via container names
      this.llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://llm-pod:3002';
      this.descriptionServiceUrl = process.env.DESCRIPTION_SERVICE_URL || 'http://description-pod:3004';
      this.voxcpmServiceUrl = process.env.TTS_POD_URL;
      this.kokoroServiceUrl = process.env.TTS_SERVICE_URL || 'http://tts-pod:3005';
    } else {
      // Development mode with network issues: use special DNS name for host
      const hostName = process.env.HOST_SYSTEM || 'host.containers.internal';
      this.llmServiceUrl = `http://${hostName}:3002`;
      this.descriptionServiceUrl = `http://${hostName}:3004`;
      this.voxcpmServiceUrl = process.env.TTS_POD_URL;
      this.kokoroServiceUrl = process.env.TTS_SERVICE_URL || `http://${hostName}:3005`;
    }

    console.log(`Running in ${env} mode with ${useServiceNames ? 'service names' : 'host access'}`);
    console.log('Using service URLs:');
    console.log(`LLM: ${this.llmServiceUrl}`);
    console.log(`Description: ${this.descriptionServiceUrl}`);
    console.log(`TTS primary (VoxCPM): ${this.voxcpmServiceUrl || 'not configured'}`);
    console.log(`TTS fallback (Kokoro): ${this.kokoroServiceUrl}`);
  }

  private buildTourQualityRequestFingerprint(request: TourRequest): string {
    return createHash('sha1')
      .update(JSON.stringify({
        city: request.city.trim().toLowerCase(),
        countryCode: request.countryCode || null,
        theme: request.theme,
        language: request.language || 'en',
        durationMinutes: request.durationMinutes || request.duration || 240,
      }))
      .digest('hex');
  }

  private async recordTourQualityDecision(params: {
    request: TourRequest;
    mode: 'shadow' | 'enforce';
    qualityStatus: TourQualityReviewQueueStatus;
    confidence: NonNullable<ReturnType<typeof computeTourConfidence>>;
    stopCount: number;
  }): Promise<void> {
    const { request, mode, qualityStatus, confidence, stopCount } = params;

    console.log('[tour_quality_gate]', JSON.stringify({
      city: request.city,
      countryCode: request.countryCode || null,
      theme: request.theme,
      qualityStatus,
      mode,
      stage: confidence.stage,
      score: confidence.score,
      reasons: confidence.reasons,
      signals: confidence.signals || null,
    }));

    try {
      await this.tourQualityReviewQueueRepository.enqueue({
        city: request.city,
        countryCode: request.countryCode,
        theme: request.theme,
        language: request.language || 'en',
        durationMinutes: request.durationMinutes || request.duration || 240,
        qualityStatus,
        confidence,
        stopCount,
        requestFingerprint: this.buildTourQualityRequestFingerprint(request),
      });
    } catch (error) {
      console.warn('[tour_quality_gate] review queue persistence failed', {
        city: request.city,
        countryCode: request.countryCode || null,
        theme: request.theme,
        qualityStatus,
        mode,
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  private logTourQualityRepair(params: {
    request: TourRequest;
    mode: 'shadow' | 'enforce';
    attempted: boolean;
    applied: boolean;
    strategy?: string;
    beforeScore: number;
    afterScore: number;
    beforeReasons: string[];
    afterReasons: string[];
  }): void {
    console.log('[tour_quality_repair]', JSON.stringify({
      city: params.request.city,
      countryCode: params.request.countryCode || null,
      theme: params.request.theme,
      mode: params.mode,
      attempted: params.attempted,
      applied: params.applied,
      strategy: params.strategy || null,
      beforeScore: params.beforeScore,
      afterScore: params.afterScore,
      beforeReasons: params.beforeReasons,
      afterReasons: params.afterReasons,
    }));
  }

  private startStageTimer(label: string): StageTimer {
    const startedAt = Date.now();
    console.log(`[Timing] ${label} started`);

    return {
      end: () => {
        const elapsedMs = Date.now() - startedAt;
        console.log(`[Timing] ${label} finished in ${elapsedMs}ms`);
        return elapsedMs;
      }
    };
  }

  private normalizeMatchValue(value: string | undefined | null): string {
    return (value || '').trim().toLowerCase();
  }

  private buildItineraryKey(request: TourRequest): string {
    return [
      this.normalizeMatchValue(request.city),
      this.normalizeMatchValue(request.countryCode),
      this.normalizeMatchValue(request.theme),
      String(request.durationMinutes || request.duration || 240),
    ].join('|');
  }

  private buildConceptItineraryKey(request: ConceptTourRequest, theme: string): string {
    return [
      this.normalizeMatchValue(request.city),
      this.normalizeMatchValue(request.countryCode),
      this.normalizeMatchValue(theme),
      this.normalizeMatchValue(request.conceptSlug),
      String(request.durationMinutes || 0),
    ].join('|');
  }

  private getThemeForConceptRouteType(routeType: string): string {
    switch (this.normalizeMatchValue(routeType)) {
      case 'architecture':
        return 'architecture';
      case 'art':
        return 'art';
      case 'markets':
        return 'food';
      case 'royal':
      case 'religious':
      case 'historical':
      case 'general':
      default:
        return 'history';
    }
  }

  private getRouteTypeForTour(tour: Tour): string {
    if (tour.metadata?.routeType) {
      return tour.metadata.routeType;
    }

    const conceptSlug = this.normalizeMatchValue(tour.metadata?.conceptSlug);
    if (conceptSlug.includes('art')) return 'art';
    if (conceptSlug.includes('religious')) return 'religious';
    if (conceptSlug.includes('market')) return 'markets';
    if (conceptSlug.includes('historical')) return 'historical';

    if (this.normalizeMatchValue(tour.theme) === 'food') return 'markets';
    if (this.normalizeMatchValue(tour.theme) === 'architecture') return 'architecture';
    return 'historical';
  }

  private buildTourDisplayCopy(tour: Tour): { title: string; subtitle: string; experienceLabel: string } {
    const copy = getConceptDisplayCopy({
      city: tour.city,
      routeType: this.getRouteTypeForTour(tour),
      slug: tour.metadata?.conceptSlug,
    });

    return {
      title: copy.title,
      subtitle: copy.subtitle,
      experienceLabel: copy.label,
    };
  }

  private parseConceptPoiRefs(value: unknown): ConceptPoiRef[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is ConceptPoiRef => (
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as ConceptPoiRef).osmType === 'string'
      && typeof (entry as ConceptPoiRef).osmId === 'number'
      && typeof (entry as ConceptPoiRef).name === 'string'
      && typeof (entry as ConceptPoiRef).lat === 'number'
      && typeof (entry as ConceptPoiRef).lng === 'number'
      && typeof (entry as ConceptPoiRef).category === 'string'
      && typeof (entry as ConceptPoiRef).landmarkTier === 'string'
      && typeof (entry as ConceptPoiRef).fameScore === 'number'
    ));
  }

  private async loadStoredConcept(request: ConceptTourRequest): Promise<StoredTourConcept | null> {
    const concept = await prismaClient.tourConcept.findFirst({
      where: {
        city: request.city,
        countryCode: request.countryCode,
        language: request.language || 'en',
        slug: request.conceptSlug,
      },
      select: {
        slug: true,
        title: true,
        routeType: true,
        estimatedStops: true,
        suggestedDurationMinutes: true,
        anchorPoiIds: true,
        supportingPoiIds: true,
      },
    });

    return concept;
  }

  private async findExactConceptTour(request: ConceptTourRequest, theme: string, requestedDuration: number): Promise<ExactTourMatch | null> {
    const candidates = await this.tourRepository.list({
      city: request.city,
      countryCode: request.countryCode,
      theme,
      language: request.language || 'en',
      durationMinutes: requestedDuration,
      limit: 20,
    });

    for (const candidate of candidates) {
      if (candidate.metadata?.conceptSlug !== request.conceptSlug) {
        continue;
      }

      const hydrated = await this.retrieveTour(candidate.id);
      const hasCompleteAudio = hydrated.places.length > 0 && hydrated.places.every((place) => Boolean(place.audioUrl));
      const contentReadiness = evaluateTourContentReadiness(hydrated.places);
      if (hydrated.places.length < FLEXIBLE_PASS_MIN_STOP_COUNT || !contentReadiness.ready) {
        console.log('[tour_reuse]', JSON.stringify({
          mode: 'skip-reuse-content-not-ready',
          city: request.city,
          countryCode: request.countryCode || null,
          theme,
          conceptSlug: request.conceptSlug,
          tourId: candidate.id,
          reasons: [
            ...(hydrated.places.length < FLEXIBLE_PASS_MIN_STOP_COUNT ? ['too_few_stops'] : []),
            ...contentReadiness.reasons,
          ],
        }));
        continue;
      }
      return { tour: candidate, response: hydrated, hasCompleteAudio };
    }

    return null;
  }

  private async loadConceptRawPoiPool(city: string, routeType: string): Promise<RawPoi[]> {
    const poiCache = new PostgresPoiCacheRepository(prismaClient);
    const geocoded = await geocodeCity(city);
    const themes: Theme[] = this.normalizeMatchValue(routeType) === 'art'
      ? ['art']
      : this.normalizeMatchValue(routeType) === 'architecture'
        ? ['architecture']
        : this.normalizeMatchValue(routeType) === 'markets'
          ? ['food', 'history']
          : ['history', 'architecture'];

    const merged = new Map<string, RawPoi>();
    for (const theme of themes) {
      let rawPois = await poiCache.get(city, theme);
      if (!rawPois) {
        rawPois = await fetchPoisForTheme(geocoded, theme);
        if (rawPois.length > 0) {
          await poiCache.set(city, theme, rawPois);
        }
      }

      for (const poi of rawPois) {
        const key = poi.tags.wikidata || `${poi.osmType}:${poi.osmId}`;
        if (!merged.has(key)) {
          merged.set(key, poi);
        }
      }
    }

    return [...merged.values()];
  }

  private async generateStructuralTourFromConcept(request: ConceptTourRequest, concept: StoredTourConcept): Promise<StructuralTourPlace[]> {
    const requestedDuration = request.durationMinutes || concept.suggestedDurationMinutes || 120;
    const rawPool = await this.loadConceptRawPoiPool(request.city, concept.routeType);
    const conceptRefs = [
      ...this.parseConceptPoiRefs(concept.anchorPoiIds),
      ...this.parseConceptPoiRefs(concept.supportingPoiIds),
    ];

    const rawByIdentity = new Map<string, RawPoi>();
    for (const poi of rawPool) {
      rawByIdentity.set(poi.tags.wikidata || `${poi.osmType}:${poi.osmId}`, poi);
    }

    const selectedRawPois = conceptRefs.flatMap((ref) => {
      const byWikidata = ref.wikidata ? rawByIdentity.get(ref.wikidata) : undefined;
      if (byWikidata) {
        return [byWikidata];
      }

      const byOsm = rawByIdentity.get(`${ref.osmType}:${ref.osmId}`);
      return byOsm ? [byOsm] : [];
    });

    if (selectedRawPois.length < 2) {
      throw new Error(`Concept ${concept.slug} does not have enough POIs to build a route`);
    }

    const enrichmentCache = new PostgresPoiEnrichmentCacheRepository(prismaClient);
    const enrichedPois = await enrichShortlistedPois(selectedRawPois, request.language || 'en', enrichmentCache, 4);
    const enrichedByIdentity = new Map<string, EnrichedPoi>();
    for (const poi of enrichedPois) {
      enrichedByIdentity.set(poi.tags.wikidata || `${poi.osmType}:${poi.osmId}`, poi);
    }

    const routeCandidates = conceptRefs.flatMap((ref) => {
      const identity = ref.wikidata || `${ref.osmType}:${ref.osmId}`;
      const poi = enrichedByIdentity.get(identity);
      if (!poi) {
        return [];
      }

      const isAnchor = this.parseConceptPoiRefs(concept.anchorPoiIds).some((anchor) => (
        (anchor.wikidata && anchor.wikidata === ref.wikidata) || (anchor.osmType === ref.osmType && anchor.osmId === ref.osmId)
      ));

      return [{
        poi,
        name: ref.name,
        nameInTourLanguage: poi.enriched.nameTranslations[request.language || 'en'] || undefined,
        coordinates: { lat: ref.lat, lng: ref.lng },
        importance_score: ref.fameScore + (isAnchor ? 6 : 0),
        fameScore: ref.fameScore,
        landmarkTier: ref.landmarkTier,
        category: ref.category,
        estimatedDuration: 20,
      } satisfies StructuralTourPlace];
    });

    const stopBounds = this.getStopBounds(requestedDuration);
    const routeSelection = composeWalkingRoute(routeCandidates, requestedDuration, this.getThemeForConceptRouteType(concept.routeType), stopBounds);
    return routeSelection.route;
  }

  private async findExactTour(request: TourRequest): Promise<ExactTourMatch | null> {
    const requestedDuration = request.durationMinutes || request.duration || 240;
    const candidates = await this.tourRepository.list({
      city: request.city,
      countryCode: request.countryCode,
      theme: request.theme,
      language: request.language || 'en',
      durationMinutes: requestedDuration,
      limit: 10,
    });

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    for (const candidate of candidates) {
      const matches = this.normalizeMatchValue(candidate.city) === this.normalizeMatchValue(request.city)
        && this.normalizeMatchValue(candidate.countryCode) === this.normalizeMatchValue(request.countryCode)
        && this.normalizeMatchValue(candidate.theme) === this.normalizeMatchValue(request.theme)
        && this.normalizeMatchValue(candidate.language) === this.normalizeMatchValue(request.language || 'en')
        && candidate.durationMinutes === requestedDuration;

      if (!matches) {
        continue;
      }

      const hydrated = await this.retrieveTour(candidate.id);
      const hasCompleteAudio = hydrated.places.length > 0 && hydrated.places.every((place) => Boolean(place.audioUrl));
      const contentReadiness = evaluateTourContentReadiness(hydrated.places);
      if (hydrated.places.length < FLEXIBLE_PASS_MIN_STOP_COUNT || !contentReadiness.ready) {
        console.log('[tour_reuse]', JSON.stringify({
          mode: 'skip-reuse-content-not-ready',
          city: request.city,
          countryCode: request.countryCode || null,
          theme: request.theme,
          language: request.language || 'en',
          durationMinutes: requestedDuration,
          tourId: candidate.id,
          reasons: [
            ...(hydrated.places.length < FLEXIBLE_PASS_MIN_STOP_COUNT ? ['too_few_stops'] : []),
            ...contentReadiness.reasons,
          ],
        }));
        continue;
      }
      if (hasCompleteAudio) {
        console.log('[tour_reuse]', JSON.stringify({
          mode: 'exact-reuse',
          city: request.city,
          countryCode: request.countryCode || null,
          theme: request.theme,
          language: request.language || 'en',
          durationMinutes: requestedDuration,
          tourId: candidate.id,
        }));
      }

      return { tour: candidate, response: hydrated, hasCompleteAudio };
    }

    return null;
  }

  private async repairExactTourAudio(request: TourRequest, existingTour: TourResponse): Promise<TourResponse> {
    console.log('[tour_reuse]', JSON.stringify({
      mode: 'audio-repair',
      city: request.city,
      countryCode: request.countryCode || null,
      theme: request.theme,
      language: request.language || 'en',
      durationMinutes: request.durationMinutes || request.duration || 240,
      tourId: existingTour.id,
      missingAudioPlaces: existingTour.places.filter((place) => !place.audioUrl).map((place) => place.id),
    }));

      const placesWithAudio = await this.generateAudio(existingTour.places, request.language || 'en', { skipExistingAudio: true });

    return {
      ...existingTour,
      places: placesWithAudio.map((place: any) => ({
        ...place,
        coordinates: place.coordinates || { lat: place.latitude, lng: place.longitude },
      })),
      route: placesWithAudio.map((place: any) => place.coordinates || { lat: place.latitude, lng: place.longitude }),
    };
  }

  private async findBaseItinerary(request: TourRequest): Promise<Tour | null> {
    const requestedDuration = request.durationMinutes || request.duration || 240;
    const candidates = await this.tourRepository.list({
      city: request.city,
      countryCode: request.countryCode,
      theme: request.theme,
      durationMinutes: requestedDuration,
      limit: 20,
    });

    const crossLanguageCandidates = candidates.filter((candidate) => (
      this.normalizeMatchValue(candidate.language) !== this.normalizeMatchValue(request.language || 'en')
    ));

    if (crossLanguageCandidates.length === 0) {
      return null;
    }

    const metadataRichCandidate = crossLanguageCandidates.find((candidate) => this.canLocalizeFromSourceMetadata(candidate));
    const selected = metadataRichCandidate || crossLanguageCandidates[0];

    console.log('[tour_reuse]', JSON.stringify({
      mode: 'base-itinerary-lookup',
      city: request.city,
      countryCode: request.countryCode || null,
      theme: request.theme,
      language: request.language || 'en',
      durationMinutes: requestedDuration,
      baseTourId: selected.id,
      baseLanguage: selected.language,
      metadataRich: Boolean(metadataRichCandidate),
    }));

    return selected;
  }

  private canLocalizeFromSourceMetadata(baseTour: Tour): boolean {
    return baseTour.places.length > 0 && baseTour.places.every((place) => {
      const sourcePoi = place.metadata?.sourcePoi;

      return Boolean(
        sourcePoi?.osmType
        && typeof sourcePoi.osmId === 'number'
        && this.getCoordinates(place)
        && place.name
      );
    });
  }

  private buildRawPoiFromMetadata(place: Place): RawPoi {
    const coordinates = this.getCoordinates(place);
    const sourcePoi = place.metadata?.sourcePoi as PlaceSourcePoiMetadata | undefined;

    if (!coordinates || !sourcePoi?.osmType || typeof sourcePoi.osmId !== 'number' || !place.name) {
      throw new Error(`Place ${place.id} is missing source POI metadata needed for localization`);
    }

    return {
      osmType: sourcePoi.osmType,
      osmId: sourcePoi.osmId,
      name: sourcePoi.localName || sourcePoi.osmName || place.name,
      lat: coordinates.lat,
      lng: coordinates.lng,
      tags: {
        ...(sourcePoi.osmTags ?? {}),
        ...(sourcePoi.osmName ? { name: sourcePoi.osmName } : {}),
        ...(sourcePoi.wikidata ? { wikidata: sourcePoi.wikidata } : {}),
        ...(sourcePoi.wikipedia ? { wikipedia: sourcePoi.wikipedia } : {}),
      },
    };
  }

  private async buildLocalizedTourFromBase(request: TourRequest, baseTour: Tour): Promise<TourResponse> {
    const requestedDuration = request.durationMinutes || request.duration || 240;
    const orderedBasePlaces = [...baseTour.places].sort((a, b) => (a.position || 0) - (b.position || 0));
    const poiEnrichmentCache = new PostgresPoiEnrichmentCacheRepository(prismaClient);
    const rawPois = orderedBasePlaces.map((place) => this.buildRawPoiFromMetadata(place));
    const enrichedPois = await enrichShortlistedPois(rawPois, request.language || 'en', poiEnrichmentCache, 4);

    const structuralPlaces: StructuralTourPlace[] = orderedBasePlaces.map((basePlace, index) => {
      const poi = enrichedPois[index];
      const coordinates = this.getCoordinates(basePlace);

      if (!coordinates) {
        throw new Error(`Place ${basePlace.id} is missing coordinates needed for localization`);
      }

      return {
        poi,
        name: basePlace.metadata?.sourcePoi?.localName || poi.name || basePlace.name,
        nameInTourLanguage: poi.enriched.nameTranslations[request.language || 'en'] || undefined,
        coordinates,
        importance_score: basePlace.importanceScore ?? 0,
        fameScore: basePlace.metadata?.sourcePoi?.fameScore,
        landmarkTier: basePlace.metadata?.sourcePoi?.landmarkTier,
        category: basePlace.metadata?.sourcePoi?.category || this.inferPoiCategory(poi),
        estimatedDuration: 20,
      };
    });

    const narratedPlaces = await this.buildNarratedPlaces(
      structuralPlaces,
      request.city,
      request.theme,
      request.language || 'en',
      requestedDuration
    );

    const now = new Date().toISOString();
    const tourToSave: Tour = {
      id: '',
      city: request.city,
      theme: request.theme,
      language: request.language || 'en',
      country: request.country,
      countryCode: request.countryCode,
      durationMinutes: requestedDuration,
      metadata: {
        qualityStatus: baseTour.metadata?.qualityStatus,
        itineraryKey: this.buildItineraryKey(request),
        localizedFromTourId: baseTour.id,
        localizedFromLanguage: baseTour.language,
        generationMode: 'cross-language-localization',
      },
      places: narratedPlaces.map((place: any, idx: number) => ({
        id: '',
        tourId: '',
        name: place.name,
        description: place.description,
        descriptionSections: place.descriptionSections,
        latitude: place.coordinates?.lat ?? place.latitude ?? 0,
        longitude: place.coordinates?.lng ?? place.longitude ?? 0,
        position: idx,
        importanceScore: orderedBasePlaces[idx]?.importanceScore,
        imageUrl: orderedBasePlaces[idx]?.imageUrl,
        metadata: {
          sourcePoi: orderedBasePlaces[idx]?.metadata?.sourcePoi,
          localizedFromPlaceId: orderedBasePlaces[idx]?.id,
          localizedFromTourId: baseTour.id,
          localizedFromLanguage: baseTour.language,
        },
      } as Place)),
      createdAt: now,
      updatedAt: now,
    };

    const savedTour = await this.tourRepository.save(tourToSave);
    const savedPlacesWithSections = savedTour.places.map((place, index) => ({
      ...place,
      nameInTourLanguage: narratedPlaces[index]?.nameInTourLanguage,
      descriptionSections: narratedPlaces[index]?.descriptionSections,
      coordinates: { lat: place.latitude, lng: place.longitude },
    }));
      const placesWithAudio = await this.generateAudio(savedPlacesWithSections, request.language || 'en');

    console.log('[tour_reuse]', JSON.stringify({
      mode: 'cross-language-localization',
      city: request.city,
      countryCode: request.countryCode || null,
      theme: request.theme,
      language: request.language || 'en',
      durationMinutes: requestedDuration,
      baseTourId: baseTour.id,
      baseLanguage: baseTour.language,
      localizedTourId: savedTour.id,
    }));

    return {
      id: savedTour.id,
      city: request.city,
      country: request.country,
      countryCode: request.countryCode,
      theme: request.theme,
      language: request.language || 'en',
      durationMinutes: requestedDuration,
      places: placesWithAudio.map((place: any) => ({
        id: place.id,
        tourId: savedTour.id,
        name: place.name,
        nameInTourLanguage: place.nameInTourLanguage,
        description: place.description,
        descriptionSections: place.descriptionSections,
        position: place.position || 0,
        latitude: place.latitude ?? place.coordinates?.lat,
        longitude: place.longitude ?? place.coordinates?.lng,
        audioUrl: place.audioUrl || '',
        imageUrl: place.imageUrl || '',
        coordinates: place.coordinates || { lat: place.latitude, lng: place.longitude }
      })),
      route: placesWithAudio.map((place: any) => place.coordinates || { lat: place.latitude, lng: place.longitude }),
      qualityStatus: savedTour.metadata?.qualityStatus,
      createdAt: savedTour.createdAt,
      updatedAt: savedTour.updatedAt,
    };
  }

  /**
   * Generate a complete tour by coordinating all pod interactions
   * @param request Tour generation request
   */
  async generateCompleteTour(request: TourRequest): Promise<TourResponse> {
    console.log('Starting tour generation for', request.city);

    try {
      const exactTour = await this.findExactTour(request);
      if (exactTour?.hasCompleteAudio) {
        return exactTour.response;
      }

      if (exactTour && !exactTour.hasCompleteAudio) {
        return await this.repairExactTourAudio(request, exactTour.response);
      }

      const baseTour = await this.findBaseItinerary(request);
      if (baseTour && this.canLocalizeFromSourceMetadata(baseTour)) {
        return await this.buildLocalizedTourFromBase(request, baseTour);
      }

      return await this.generateFullTour(request);
    } catch (error) {
      console.error('Error generating tour:', error);
      if (error instanceof CityNotAvailableError) {
        throw error;
      }
      if (error instanceof CityQualityNotAvailableError) {
        throw error;
      }
      throw new Error(`Failed to generate tour: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateTourFromConcept(request: ConceptTourRequest): Promise<TourResponse> {
    const concept = await this.loadStoredConcept(request);
    if (!concept) {
      throw new Error(`Concept not found: ${request.conceptSlug}`);
    }

    const requestedDuration = request.durationMinutes || concept.suggestedDurationMinutes || 120;
    const theme = this.getThemeForConceptRouteType(concept.routeType);
    const exactTour = await this.findExactConceptTour(request, theme, requestedDuration);
    if (exactTour?.hasCompleteAudio) {
      return exactTour.response;
    }

    if (exactTour && !exactTour.hasCompleteAudio) {
      return await this.repairExactTourAudio({
        city: request.city,
        country: request.country,
        countryCode: request.countryCode,
        theme,
        language: request.language,
        durationMinutes: requestedDuration,
      }, exactTour.response);
    }

    const structuralPlaces = await this.generateStructuralTourFromConcept(request, concept);
    const narratedPlaces = await this.buildNarratedPlaces(
      structuralPlaces,
      request.city,
      theme,
      request.language || 'en',
      requestedDuration
    );
    const placesWithImages = await this.fetchImagesForPlaces(narratedPlaces, request.city, request.country);

    const now = new Date().toISOString();
    const tourToSave: Tour = {
      id: '',
      city: request.city,
      theme,
      language: request.language || 'en',
      country: request.country,
      countryCode: request.countryCode,
      durationMinutes: requestedDuration,
        metadata: {
          itineraryKey: this.buildConceptItineraryKey({ ...request, durationMinutes: requestedDuration }, theme),
          conceptSlug: request.conceptSlug,
          routeType: concept.routeType,
          generationMode: 'from-concept',
          qualityStatus: getQualityStatusForRequest(request.city, request.countryCode, theme),
        },
      places: placesWithImages.map((p: any, idx: number) => ({
        id: p.id || '',
        tourId: '',
        name: p.name,
        description: p.description,
        descriptionSections: p.descriptionSections,
        latitude: p.coordinates?.lat ?? p.latitude ?? 0,
        longitude: p.coordinates?.lng ?? p.longitude ?? 0,
        position: idx,
        importanceScore: p.importance_score ?? p.importanceScore,
        imageUrl: p.imageUrl,
        audioUrl: p.audioUrl,
        metadata: {
          sourcePoi: p.poi ? {
            osmType: p.poi.osmType,
            osmId: p.poi.osmId,
            wikidata: p.poi.tags?.wikidata,
            wikipedia: p.poi.tags?.wikipedia,
            osmName: p.poi.tags?.name,
            localName: p.name,
            category: p.category,
            landmarkTier: p.landmarkTier,
            fameScore: p.fameScore,
            osmTags: p.poi.tags,
          } : undefined,
        },
      } as Place)),
      createdAt: now,
      updatedAt: now,
    };

    const savedTour = await this.tourRepository.save(tourToSave);
    const savedPlacesWithSections = savedTour.places.map((place, index) => ({
      ...place,
      nameInTourLanguage: placesWithImages[index]?.nameInTourLanguage,
      descriptionSections: placesWithImages[index]?.descriptionSections,
    }));
    const placesWithAudio = await this.generateAudio(savedPlacesWithSections, request.language || 'en');

    return {
      id: savedTour.id,
      city: request.city,
      country: request.country,
      countryCode: request.countryCode,
      theme,
      language: request.language || 'en',
      durationMinutes: requestedDuration,
      places: placesWithAudio.map((place: any) => ({
        id: place.id,
        tourId: savedTour.id,
        name: place.name,
        nameInTourLanguage: place.nameInTourLanguage,
        description: place.description,
        descriptionSections: place.descriptionSections,
        position: place.position || 0,
        latitude: place.latitude ?? place.coordinates?.lat,
        longitude: place.longitude ?? place.coordinates?.lng,
        audioUrl: place.audioUrl || '',
        imageUrl: place.imageUrl || '',
        coordinates: place.coordinates || { lat: place.latitude, lng: place.longitude }
      })),
      route: placesWithAudio.map((place: any) => place.coordinates || { lat: place.latitude, lng: place.longitude }),
      qualityStatus: savedTour.metadata?.qualityStatus,
      createdAt: savedTour.createdAt,
      updatedAt: savedTour.updatedAt,
    };
  }

  private async generateFullTour(request: TourRequest): Promise<TourResponse> {
    const requestedDuration = request.durationMinutes || request.duration || 240;
    const gateMode = getTourConfidenceGateMode();
    const repairMode = getTourQualityRepairMode();
    let qualityStatus = this.getQualityStatus(request);
    const shouldEvaluateConfidence = qualityStatus === 'unverified' && gateMode !== 'off';

    // Structural pipeline first so a future confidence gate can reject before
    // narration, images, persistence, and audio.
    const structuralTour = await this.generateStructuralTourData(
      request.city,
      request.theme,
      request.language || 'en',
      requestedDuration
    );
    const confidence = shouldEvaluateConfidence
      ? computeTourConfidence(structuralTour.confidenceInput)
      : undefined;
    let selectedStructuralPlaces = structuralTour.places;
    let finalConfidence = confidence;
    let repairMetadata = undefined;

    if (shouldEvaluateConfidence) {
      const repairResult = confidence && repairMode !== 'off'
        ? attemptTourQualityRepair({
          candidates: structuralTour.routeCandidates,
          selectedRoute: structuralTour.places,
          confidence,
          confidenceInput: structuralTour.confidenceInput,
          requestedDuration,
          theme: request.theme,
          stopBounds: this.getStopBounds(requestedDuration),
        })
        : undefined;

      if (repairResult?.attempted) {
        repairMetadata = repairResult.metadata;
        this.logTourQualityRepair({
          request,
          mode: gateMode === 'enforce' ? 'enforce' : 'shadow',
          attempted: repairResult.attempted,
          applied: repairResult.applied,
          strategy: repairResult.strategy,
          beforeScore: repairResult.metadata.beforeScore,
          afterScore: repairResult.metadata.afterScore,
          beforeReasons: repairResult.metadata.beforeReasons,
          afterReasons: repairResult.metadata.afterReasons,
        });
      }

      const shouldApplyRepair = gateMode === 'enforce'
        && repairMode === 'enforce'
        && repairResult?.applied;

      if (shouldApplyRepair && repairResult) {
        selectedStructuralPlaces = repairResult.route;
        finalConfidence = repairResult.finalConfidence;
        qualityStatus = 'auto_repaired';
      } else {
        qualityStatus = gateMode === 'enforce' && confidence?.passed ? 'auto_approved' : 'shadow_evaluated';
        finalConfidence = gateMode === 'enforce' && repairResult?.attempted
          ? repairResult.finalConfidence
          : confidence;
      }

      const reviewQueueStatus: TourQualityReviewQueueStatus = gateMode === 'shadow'
        ? (confidence?.passed ? 'shadow_passed' : 'shadow_failed')
        : (shouldApplyRepair
          ? 'auto_repaired'
          : (finalConfidence?.passed ? 'auto_approved' : 'rejected'));
      const decisionStopCount = shouldApplyRepair
        ? selectedStructuralPlaces.length
        : structuralTour.confidenceInput.output.stopCount;

      if (finalConfidence) {
        await this.recordTourQualityDecision({
          request,
          mode: gateMode === 'enforce' ? 'enforce' : 'shadow',
          qualityStatus: reviewQueueStatus,
          confidence: gateMode === 'shadow' ? confidence! : finalConfidence,
          stopCount: decisionStopCount,
        });
      }

      if (gateMode === 'enforce' && finalConfidence && !finalConfidence.passed) {
        throw new CityQualityNotAvailableError(request.city, request.theme, finalConfidence);
      }
    }

    const selectedPlaces = await this.buildNarratedPlaces(
      selectedStructuralPlaces,
      request.city,
      request.theme,
      request.language || 'en',
      requestedDuration
    );
    console.log('Selected walkable route with stops:', selectedPlaces.length);

    const placesWithImages = await this.fetchImagesForPlaces(selectedPlaces, request.city, request.country);
    console.log('Fetched images for places');

    const now = new Date().toISOString();
    const tourToSave: Tour = {
      id: '',
      city: request.city,
      theme: request.theme,
      language: request.language || 'en',
      country: request.country,
      countryCode: request.countryCode,
      durationMinutes: request.durationMinutes || request.duration || 240,
      metadata: {
        qualityStatus,
        confidence: gateMode === 'shadow' ? confidence : finalConfidence,
        repair: repairMetadata,
        itineraryKey: this.buildItineraryKey(request),
        generationMode: 'full',
      },
      places: placesWithImages.map((p: any, idx: number) => ({
        id: p.id || '',
        tourId: '',
        name: p.name,
        description: p.description,
        descriptionSections: p.descriptionSections,
        latitude: p.coordinates?.lat ?? p.latitude ?? 0,
        longitude: p.coordinates?.lng ?? p.longitude ?? 0,
        position: idx,
        importanceScore: p.importance_score ?? p.importanceScore,
        imageUrl: p.imageUrl,
        audioUrl: p.audioUrl,
        metadata: {
          sourcePoi: p.poi ? {
            osmType: p.poi.osmType,
            osmId: p.poi.osmId,
            wikidata: p.poi.tags?.wikidata,
            wikipedia: p.poi.tags?.wikipedia,
            osmName: p.poi.tags?.name,
            localName: p.name,
            category: p.category,
            landmarkTier: p.landmarkTier,
            fameScore: p.fameScore,
            osmTags: p.poi.tags,
          } : undefined,
        },
      } as Place)),
      createdAt: now,
      updatedAt: now
    };

    const savedTour = await this.tourRepository.save(tourToSave);
    console.log('Saved tour with ID:', savedTour.id);
    const savedPlacesWithSections = savedTour.places.map((place, index) => ({
      ...place,
      nameInTourLanguage: placesWithImages[index]?.nameInTourLanguage,
      descriptionSections: placesWithImages[index]?.descriptionSections,
    }));

    const placesWithAudio = await this.generateAudio(
      savedPlacesWithSections,
      request.language || 'en'
    );
    console.log('Generated audio');

    return {
      id: savedTour.id,
      city: request.city,
      country: request.country,
      countryCode: request.countryCode,
      theme: request.theme,
      language: request.language || 'en',
      durationMinutes: request.durationMinutes || request.duration || 240,
      places: placesWithAudio.map((place: any) => ({
        id: place.id,
        tourId: savedTour.id,
        name: place.name,
        nameInTourLanguage: place.nameInTourLanguage,
        description: place.description,
        descriptionSections: place.descriptionSections,
        position: place.position || 0,
        latitude: place.latitude ?? place.coordinates?.lat,
        longitude: place.longitude ?? place.coordinates?.lng,
        audioUrl: place.audioUrl || '',
        imageUrl: place.imageUrl || '',
        coordinates: place.coordinates || { lat: place.latitude, lng: place.longitude }
      })),
      route: placesWithAudio.map((place: any) => place.coordinates || { lat: place.latitude, lng: place.longitude }),
      degraded: structuralTour.routeDiagnostics.degraded,
      degradationReason: structuralTour.routeDiagnostics.degradationReason,
      coverageRatio: Number(structuralTour.routeDiagnostics.coverageRatio.toFixed(3)),
      qualityStatus,
      confidence: gateMode === 'shadow' ? confidence : finalConfidence,
      repair: repairMetadata,
      createdAt: savedTour.createdAt
    };
  }

  /**
   * Retrieve a tour by ID
   * @param id Tour ID
   */
  async retrieveTour(id: string): Promise<TourResponse> {
    try {
      const tour = await this.tourRepository.findById(id);

      if (!tour) {
        throw new Error(`Tour not found: ${id}`);
      }

      const places = [...tour.places].sort((a, b) => (a.position || 0) - (b.position || 0));

      // For each place, try to fetch audio URL if not already included
      for (let i = 0; i < places.length; i++) {
        if (!places[i].audioUrl) {
          try {
            const asset = await this.audioAssetRepository.findByPlaceId(places[i].id);
            if (asset?.audioUrl) {
              places[i] = { ...places[i], audioUrl: asset.audioUrl };
            }
          } catch (error) {
            console.warn(`Failed to get audio URL for place ${places[i].id}:`, error);
            // Continue even if we fail to get audio for one place
          }
        }
      }

      // Map to the expected format
      return {
        id: tour.id,
        city: tour.city,
        theme: tour.theme,
        ...this.buildTourDisplayCopy(tour),
        country: tour.country,
        countryCode: tour.countryCode,
        language: tour.language,
        durationMinutes: tour.durationMinutes,
        places: places.map(place => ({
          id: place.id,
          tourId: tour.id,
          name: place.name,
          nameInTourLanguage: place.nameInTourLanguage,
          description: place.description,
          descriptionSections: place.descriptionSections,
          position: place.position || 0,
          latitude: place.latitude,
          longitude: place.longitude,
          audioUrl: place.audioUrl || '',
          imageUrl: place.imageUrl || '',
          coordinates: { lat: place.latitude, lng: place.longitude }
        })),
        route: places.map(place => ({ lat: place.latitude, lng: place.longitude })),
        qualityStatus: tour.metadata?.qualityStatus,
        confidence: tour.metadata?.confidence,
        repair: tour.metadata?.repair,
        createdAt: tour.createdAt,
        updatedAt: tour.updatedAt
      };
    } catch (error) {
      console.error('Error retrieving tour:', error);
      throw new Error(`Failed to retrieve tour: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listTours(options: ListToursOptions): Promise<{ success: true; data: { tours: TourResponse[] } }> {
    const tours = await this.tourRepository.list(options);

    if (options.readyOnly) {
      const readyTours: Array<{ source: Tour; response: TourResponse }> = [];

      for (const tour of tours) {
        const hydrated = await this.retrieveTour(tour.id);
        if (!this.isReadyForBrowse(hydrated)) {
          continue;
        }

        readyTours.push({ source: tour, response: hydrated });
      }

      const deduped = new Map<string, { source: Tour; response: TourResponse }>();
      for (const candidate of readyTours) {
        const key = this.buildBrowseDedupKey(candidate.source);
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, candidate);
          continue;
        }

        const existingUpdatedAt = Date.parse(existing.source.updatedAt || existing.source.createdAt);
        const candidateUpdatedAt = Date.parse(candidate.source.updatedAt || candidate.source.createdAt);
        if (candidateUpdatedAt >= existingUpdatedAt) {
          deduped.set(key, candidate);
        }
      }

      return {
        success: true,
        data: {
          tours: [...deduped.values()].map(({ source, response }) => {
            const display = this.buildTourDisplayCopy(source);
            return {
              ...response,
              title: display.title,
              subtitle: display.subtitle,
              experienceLabel: display.experienceLabel,
              previewStopNames: response.places.slice(0, 3).map((place) => place.name),
            };
          })
        }
      };
    }

    return {
      success: true,
      data: {
        tours: tours.map((tour) => {
          const display = this.buildTourDisplayCopy(tour);
          return {
            id: tour.id,
            city: tour.city,
            country: tour.country,
            countryCode: tour.countryCode,
            theme: tour.theme,
            title: display.title,
            subtitle: display.subtitle,
            experienceLabel: display.experienceLabel,
            previewStopNames: tour.places.slice(0, 3).map((place) => place.name),
            language: tour.language,
            durationMinutes: tour.durationMinutes,
            places: tour.places.map((place) => ({
              id: place.id,
              tourId: tour.id,
              name: place.name,
              nameInTourLanguage: place.nameInTourLanguage,
              description: place.description,
              descriptionSections: place.descriptionSections,
              position: place.position,
              latitude: place.latitude,
              longitude: place.longitude,
              audioUrl: place.audioUrl || '',
              imageUrl: place.imageUrl || '',
              coordinates: { lat: place.latitude, lng: place.longitude }
            })),
            route: tour.places.map((place) => ({ lat: place.latitude, lng: place.longitude })),
            qualityStatus: tour.metadata?.qualityStatus,
            confidence: tour.metadata?.confidence,
            repair: tour.metadata?.repair,
            createdAt: tour.createdAt,
            updatedAt: tour.updatedAt
          };
        })
      }
    };
  }

  private isReadyForBrowse(tour: TourResponse): boolean {
    const hasCompleteAudio = tour.places.length > 0 && tour.places.every((place) => Boolean(place.audioUrl));
    const hasEnoughStops = tour.places.length >= FLEXIBLE_PASS_MIN_STOP_COUNT;
    const contentReadiness = evaluateTourContentReadiness(tour.places);

    return hasCompleteAudio && hasEnoughStops && contentReadiness.ready;
  }

  private buildBrowseDedupKey(tour: Tour): string {
    const conceptSlug = this.normalizeMatchValue(tour.metadata?.conceptSlug);
    if (conceptSlug) {
      return `concept:${conceptSlug}|${this.normalizeMatchValue(tour.language)}`;
    }

    return [
      this.normalizeMatchValue(tour.city),
      this.normalizeMatchValue(tour.countryCode),
      this.normalizeMatchValue(tour.theme),
      this.normalizeMatchValue(tour.language),
      String(tour.durationMinutes),
    ].join('|');
  }

  private async getEligibleFlexiblePassTours(params: { city: string; countryCode: string; language: string }): Promise<FlexiblePassTourSummary[]> {
    const tours = await this.tourRepository.list({
      city: params.city,
      countryCode: params.countryCode,
      language: params.language,
      limit: 100,
    });

    const eligible: FlexiblePassTourSummary[] = [];
    for (const tour of tours) {
      const hydrated = await this.retrieveTour(tour.id);
      const hasCompleteAudio = hydrated.places.length > 0 && hydrated.places.every((place) => Boolean(place.audioUrl));
      const contentReadiness = evaluateTourContentReadiness(hydrated.places);
      const hasEnoughStops = hydrated.places.length >= FLEXIBLE_PASS_MIN_STOP_COUNT;
      if (!hasCompleteAudio || !hasEnoughStops || !contentReadiness.ready) {
        console.log('[flexible_pass_readiness]', JSON.stringify({
          tourId: tour.id,
          city: tour.city,
          conceptSlug: tour.metadata?.conceptSlug ?? null,
          hasCompleteAudio,
          hasEnoughStops,
          contentReady: contentReadiness.ready,
          reasons: [
            ...(!hasEnoughStops ? ['too_few_stops'] : []),
            ...contentReadiness.reasons,
          ],
        }));
        continue;
      }

      const display = this.buildTourDisplayCopy(tour);

      eligible.push({
        id: tour.id,
        city: tour.city,
        country: tour.country,
        countryCode: tour.countryCode,
        language: tour.language,
        theme: tour.theme,
        title: display.title,
        subtitle: display.subtitle,
        experienceLabel: display.experienceLabel,
        durationMinutes: tour.durationMinutes,
        stopCount: hydrated.places.length,
        imageUrl: hydrated.places.find((place) => Boolean(place.imageUrl))?.imageUrl,
      });
    }

    return eligible;
  }

  async listFlexiblePassCities(language?: string): Promise<FlexiblePassCitySummary[]> {
    const tours = await this.tourRepository.list({
      language,
      limit: 200,
    });

    const grouped = new Map<string, Tour[]>();
    for (const tour of tours) {
      const key = `${tour.city}|${tour.countryCode}|${tour.language}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(tour);
      grouped.set(key, bucket);
    }

    const result: FlexiblePassCitySummary[] = [];
    for (const cityTours of grouped.values()) {
      const sample = cityTours[0];
      const eligibleTours = await this.getEligibleFlexiblePassTours({
        city: sample.city,
        countryCode: sample.countryCode,
        language: sample.language,
      });

      if (eligibleTours.length < FLEXIBLE_PASS_TOURS_REQUIRED) {
        continue;
      }

      result.push({
        city: sample.city,
        country: sample.country,
        countryCode: sample.countryCode,
        language: sample.language,
        availableTourCount: eligibleTours.length,
        toursRequired: FLEXIBLE_PASS_TOURS_REQUIRED,
        priceCents: FLEXIBLE_PASS_PRICE_CENTS,
        currency: FLEXIBLE_PASS_CURRENCY,
      });
    }

    return result.sort((left, right) => left.city.localeCompare(right.city));
  }

  async getFlexiblePassOptions(params: { city: string; countryCode: string; language: string }): Promise<FlexiblePassOptionsResponse> {
    const eligibleTours = await this.getEligibleFlexiblePassTours(params);
    if (eligibleTours.length === 0) {
      throw new Error('No eligible tours found for this flexible pass');
    }

    const sample = eligibleTours[0];
    return {
      city: sample.city,
      country: sample.country,
      countryCode: sample.countryCode,
      language: sample.language,
      toursRequired: FLEXIBLE_PASS_TOURS_REQUIRED,
      priceCents: FLEXIBLE_PASS_PRICE_CENTS,
      individualPriceCents: FLEXIBLE_PASS_INDIVIDUAL_PRICE_CENTS,
      savingsCents: (FLEXIBLE_PASS_INDIVIDUAL_PRICE_CENTS * FLEXIBLE_PASS_TOURS_REQUIRED) - FLEXIBLE_PASS_PRICE_CENTS,
      currency: FLEXIBLE_PASS_CURRENCY,
      tours: eligibleTours,
    };
  }

  async quoteFlexiblePass(request: FlexiblePassQuoteRequest): Promise<FlexiblePassQuoteResponse> {
    const options = await this.getFlexiblePassOptions({
      city: request.city,
      countryCode: request.countryCode,
      language: request.language,
    });

    const uniqueTourIds = [...new Set(request.tourIds)];
    if (uniqueTourIds.length !== FLEXIBLE_PASS_TOURS_REQUIRED) {
      throw new Error(`Select exactly ${FLEXIBLE_PASS_TOURS_REQUIRED} tours for this pass`);
    }

    const selectedTours = options.tours.filter((tour) => uniqueTourIds.includes(tour.id));
    if (selectedTours.length !== FLEXIBLE_PASS_TOURS_REQUIRED) {
      throw new Error('One or more selected tours are not eligible for this pass');
    }

    return {
      city: options.city,
      countryCode: options.countryCode,
      language: options.language,
      toursRequired: options.toursRequired,
      selectedTourCount: selectedTours.length,
      individualTotalCents: selectedTours.length * FLEXIBLE_PASS_INDIVIDUAL_PRICE_CENTS,
      passPriceCents: FLEXIBLE_PASS_PRICE_CENTS,
      savingsCents: (selectedTours.length * FLEXIBLE_PASS_INDIVIDUAL_PRICE_CENTS) - FLEXIBLE_PASS_PRICE_CENTS,
      currency: FLEXIBLE_PASS_CURRENCY,
      selectedTours,
    };
  }

  private getCandidateCount(durationMinutes: number): number {
    return getDurationPlan(durationMinutes).candidateCount;
  }

  private getStopBounds(durationMinutes: number): { minStops: number; maxStops: number } {
    const plan = getDurationPlan(durationMinutes);
    return { minStops: plan.minStops, maxStops: plan.maxStops };
  }

  private getImportanceScore(place: any): number {
    return place.importanceScore ?? place.importance_score ?? 0;
  }

  private getCategory(place: any): string {
    return place.category || 'other';
  }

  private inferPoiCategory(poi: EnrichedPoi): string {
    return classifyPoiTags(poi.tags);
  }

  private getCoordinates(place: any): { lat: number; lng: number } | null {
    const lat = place.coordinates?.lat ?? place.latitude;
    const lng = place.coordinates?.lng ?? place.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    return { lat, lng };
  }

  private estimateRouteMetrics(orderedPlaces: any[], maxSegmentMeters = 1200): {
    walkingMeters: number;
    walkingMinutes: number;
    estimatedTourMinutes: number;
    outOfIdealSegments: number;
    hasOverMaxSegment: boolean;
  } {
    return estimateRouteMetrics(orderedPlaces, maxSegmentMeters);
  }

  private buildDiversePrefix(candidates: any[], stopCount: number, maxCategoryRatio: number): any[] {
    return buildDiversePrefix(candidates, stopCount, maxCategoryRatio);
  }

  private orderVerifiedPlaces(candidates: any[]): any[] {
    return orderRouteCandidates(candidates);
  }

  private getQualityStatus(request: TourRequest): TourQualityStatus {
    return getQualityStatusForRequest(request.city, request.countryCode, request.theme);
  }

  private buildAudioNarrationText(place: { description?: string; descriptionSections?: Record<string, string> }): string {
    const orderedSections = this.audioSectionOrder
      .map((section) => place.descriptionSections?.[section]?.trim())
      .filter((section): section is string => Boolean(section));

    if (orderedSections.length > 0) {
      return orderedSections.join('\n\n');
    }

    return (place.description || '').trim();
  }

  private composeWalkingTour(verifiedPlaces: any[], requestedDuration: number, theme: string): RouteSelectionResult<any> {
    const routeCandidates = verifiedPlaces.filter((place) => this.getCoordinates(place));
    console.log('Verified candidate count:', routeCandidates.length);
    const routeSelection = composeWalkingRoute(routeCandidates, requestedDuration, theme, this.getStopBounds(requestedDuration));
    const routeMetrics = estimateRouteMetrics(routeSelection.route);

    console.log('Selected stop count:', routeSelection.route.length);
    console.log('Estimated walking meters:', Math.round(routeMetrics.walkingMeters));
    console.log('Estimated tour minutes:', Math.round(routeSelection.diagnostics.estimatedTourMinutes));

    if (routeSelection.diagnostics.degraded) {
      console.warn('[Route] degraded route below requested duration window', {
        requestedDuration,
        estimatedTourMinutes: Math.round(routeSelection.diagnostics.estimatedTourMinutes),
        coverageRatio: Number(routeSelection.diagnostics.coverageRatio.toFixed(3)),
      });
    }

    return routeSelection;
  }

  /**
   * OSM pipeline: geocode city → fetch POIs from Overpass (with Postgres cache) → enrich → rank → compose route
   */
  private async generateStructuralTourData(city: string, theme: string, language: string, requestedDuration: number): Promise<StructuralTourData> {
    const poiCache = new PostgresPoiCacheRepository(prismaClient);
    const poiEnrichmentCache = new PostgresPoiEnrichmentCacheRepository(prismaClient);
    const osmTheme = theme as Theme;
    const totalTimer = this.startStageTimer(`OSM pipeline ${city}/${theme}/${language}/${requestedDuration}`);

    // Geocode
    const geocodeTimer = this.startStageTimer('Geocode city');
    let geocoded;
    try {
      geocoded = await geocodeCity(city);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'NOT_FOUND') {
        throw new CityNotAvailableError(city, 0);
      }
      throw error;
    }
    geocodeTimer.end();
    console.log('[OSM] Geocoded city:', geocoded.displayName);

    // Cache → Overpass
    const fetchTimer = this.startStageTimer('Load POI cache or fetch Overpass');
    let rawPois: RawPoi[] | null = await poiCache.get(city, theme);
    if (!rawPois) {
      rawPois = await fetchPoisForTheme(geocoded, osmTheme);
      if (rawPois.length > 0) {
        await poiCache.set(city, theme, rawPois);
      }
    }
    fetchTimer.end();
    console.log('[OSM] Raw POIs:', rawPois.length);

    const wikidataTaggedCount = rawPois.filter((poi) => typeof poi.tags.wikidata === 'string' && poi.tags.wikidata.length > 0).length;

    const topN = this.getCandidateCount(requestedDuration);
    const shortlistSize = Math.min(rawPois.length, Math.max(topN, 40));

    const prefilterTimer = this.startStageTimer(`Prefilter ${rawPois.length} POIs by landmark fame`);
    const wikidataMetadata = await fetchWikidataLandmarkMetadata(
      rawPois
        .map((poi) => poi.tags.wikidata)
        .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0)
    );
    const sitelinkCounts = Object.fromEntries(
      Object.entries(wikidataMetadata).map(([wikidataId, metadata]) => [wikidataId, metadata.sitelinks])
    );
    const sitelinksResolvedRatio = wikidataTaggedCount > 0
      ? Object.keys(wikidataMetadata).length / wikidataTaggedCount
      : 0;
    const maxSitelinks = Object.values(wikidataMetadata).reduce((max, metadata) => Math.max(max, metadata.sitelinks), 0);
    const tieredRawPois = tierPoisByLandmarkFame(rawPois, sitelinkCounts, osmTheme, wikidataMetadata);
    const shortlistedRawPois = tieredRawPois.slice(0, shortlistSize);
    console.log('[OSM] Landmark shortlist:', JSON.stringify({
      shortlistSize,
      tierHistogram: shortlistedRawPois.reduce<Record<string, number>>((histogram, poi) => {
        histogram[poi.landmarkTier] = (histogram[poi.landmarkTier] ?? 0) + 1;
        return histogram;
      }, {}),
      sample: shortlistedRawPois.slice(0, 12).map((poi) => ({
        name: poi.name || poi.tags.name || 'unknown',
        tier: poi.landmarkTier,
        fameScore: Number(poi.fameScore.toFixed(2)),
        sitelinks: poi.fame.sitelinks,
        osmType: poi.tags.historic || poi.tags.tourism || poi.tags.building || poi.osmType,
      })),
    }));
    prefilterTimer.end();

    // Enrich shortlisted POIs only
    const enrichTimer = this.startStageTimer(`Enrich ${shortlistedRawPois.length} shortlisted POIs`);
    const enriched = await enrichShortlistedPois(shortlistedRawPois, language, poiEnrichmentCache, 4);
    enrichTimer.end();

    // Rank
    const rankTimer = this.startStageTimer('Rank POIs');
    const allRanked = rankPois(enriched, geocoded.lat, geocoded.lng);
    const ranked = allRanked.slice(0, topN);
    const summarizePoi = (poi: typeof allRanked[number]) => ({
      name: poi.name || poi.tags.name || 'unknown',
      score: Number(poi.score.toFixed(2)),
      fameScore: Number((((poi as any).fameScore ?? 0) as number).toFixed(2)),
      landmarkTier: (poi as any).landmarkTier ?? 'unknown',
      sitelinks: (poi as any).fame?.sitelinks ?? 0,
      osmType: poi.tags.historic || poi.tags.tourism || poi.tags.building || poi.osmType,
      hasWikidata: Boolean(poi.tags.wikidata),
      hasWikipedia: Boolean(poi.tags.wikipedia),
    });
    console.log('[OSM] Ranked POIs:', ranked.length);
    console.log('[OSM] Selected POIs:', JSON.stringify(ranked.map(summarizePoi)));
    if (allRanked.length > topN) {
      console.log('[OSM] Rejected POIs below topN cutoff:', JSON.stringify({
        totalRejected: allRanked.length - topN,
        sample: allRanked.slice(topN, topN + 10).map(summarizePoi),
      }));
    }
    rankTimer.end();

    // Floor check
    if (ranked.length < 5) {
      throw new CityNotAvailableError(city, ranked.length);
    }

    const routeCandidates = ranked.map((poi) => {
      const localName = poi.name || poi.tags.name || '';
      const translatedName = poi.enriched.nameTranslations[language] || localName;
      return {
        poi,
        name: localName,
        nameInTourLanguage: translatedName !== localName ? translatedName : undefined,
        coordinates: { lat: poi.lat, lng: poi.lng },
        importance_score: poi.score,
        fameScore: (poi as any).fameScore,
        landmarkTier: (poi as any).landmarkTier,
        category: this.inferPoiCategory(poi),
        estimatedDuration: 20,
      };
    });

    const composeTimer = this.startStageTimer('Compose walking route');
    const routeSelection = this.composeWalkingTour(routeCandidates, requestedDuration, theme);
    composeTimer.end();
    const selectedRoute = routeSelection.route;

    const routeCategoryCounts = selectedRoute.reduce<Map<string, number>>((counts, place) => {
      counts.set(place.category, (counts.get(place.category) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const routeMaxCategoryShare = selectedRoute.length > 0
      ? Math.max(...Array.from(routeCategoryCounts.values())) / selectedRoute.length
      : 1;
    const routeWikidataIds = selectedRoute
      .map((place) => place.poi.tags.wikidata)
      .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0);
    const routeDuplicateWikidataCount = routeWikidataIds.length - new Set(routeWikidataIds).size;
    const routeFlagshipCount = selectedRoute.filter((place) => place.landmarkTier === 'flagship').length;

    totalTimer.end();

    return {
      places: selectedRoute,
      routeCandidates,
      routeDiagnostics: routeSelection.diagnostics,
      confidenceInput: {
        input: {
          rawPoolSize: rawPois.length,
          wikidataTaggedCount,
          sitelinksResolvedRatio,
          maxSitelinks,
        },
        output: {
          shortlistSize: routeCandidates.length,
          routeDuplicateWikidataCount,
          routeMaxCategoryShare,
          routeFlagshipCount,
          degraded: routeSelection.diagnostics.degraded,
          coverageRatio: routeSelection.diagnostics.coverageRatio,
          stopCount: selectedRoute.length,
        },
      },
    };
  }

  private async buildNarratedPlaces(
    structuralPlaces: StructuralTourPlace[],
    city: string,
    theme: string,
    language: string,
    requestedDuration: number
  ): Promise<any[]> {
    const narrationTimer = this.startStageTimer(`Generate narration for ${structuralPlaces.length} stops`);
    const narratedPlaces = await Promise.all(structuralPlaces.map(async (place, index) => {
      const position = index === 0 ? 'first' : index === structuralPlaces.length - 1 ? 'last' : 'middle';
      const nextStopName = structuralPlaces[index + 1]?.name;
      const builtNarration = await buildNarration(
        place.poi,
        theme,
        language,
        this.llmServiceUrl,
        position,
        nextStopName,
        {
          cityName: city,
          totalStops: structuralPlaces.length,
          tourDurationMinutes: requestedDuration,
        }
      );

      console.log('[Orchestration] narration stop summary:', JSON.stringify({
        traceId: builtNarration.traceId,
        stopName: place.name,
        position,
        language,
        theme,
        sections: builtNarration.sections ? Object.keys(builtNarration.sections) : [],
        meta: builtNarration.meta,
      }));

      const { poi: _poi, ...rest } = place;
      return {
        ...rest,
        description: builtNarration.narration,
        descriptionSections: builtNarration.sections || undefined,
      };
    }));
    narrationTimer.end();
    return narratedPlaces;
  }

  /**
   * Generate initial places using the LLM pod
   */
  private async generateInitialPlaces(city: string, country: string, countryCode: string, theme: string, language: string, duration?: number): Promise<any[]> {
    try {
      const requestedDuration = duration || 240;
      const candidateCount = this.getCandidateCount(requestedDuration);
      console.log('Candidate count requested:', candidateCount);

      const response = await axios.post(`${this.llmServiceUrl}/generate/places`, {
        city,
        country,
        countryCode,
        language,
        duration: requestedDuration,
        maxStops: candidateCount,
        interests: theme ? [theme] : []
      });

      if (!response.data || !response.data.places || !Array.isArray(response.data.places)) {
        throw new Error('Invalid response from LLM service');
      }

      return response.data.places;
    } catch (error) {
      console.error('LLM service error:', error);
      throw new Error(`LLM service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify places using the Verification pod with parallel requests
   */
  private async verifyPlaces(places: any[], city: string, country: string, countryCode: string): Promise<any[]> {
    try {
      console.log(`Verifying places with: city=${city}, country=${country}, countryCode=${countryCode}`);

      // Create verification requests for each place in parallel
      const verificationPromises = places.map(place =>
        axios.post(`${process.env.VERIFICATION_SERVICE_URL || 'http://verification-pod:3003'}/verify/place`, {
          name: place.name,
          coordinates: place.coordinates,
          city: city,
          country: country,
          countryCode: countryCode
        })
      );

      // Execute all requests in parallel, but allow partial success.
      const responses = await Promise.allSettled(verificationPromises);

      // Extract and process only the successfully verified places.
      const verifiedPlaces = responses.flatMap((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`Verification request failed for place ${places[index].name}:`, result.reason);
          return [];
        }

        const isValid = result.value.data && result.value.data.valid;
        if (!isValid) {
          console.warn(`Place ${places[index].name} failed verification`);
          return [];
        }

        return [{
          ...places[index],
          verified: true,
          importance_score: result.value.data.details?.confidence || 0.5
        }];
      });

      if (verifiedPlaces.length === 0) {
        throw new Error('No places could be verified');
      }

      // Sort verified places by confidence before route composition evaluates the full pool.
      return verifiedPlaces
        .sort((a: any, b: any) => (b.importance_score || 0) - (a.importance_score || 0))
        ;
    } catch (error) {
      console.error('Verification service error:', error);
      throw new Error(`Verification service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch images for places
   */
  private async fetchImagesForPlaces(places: any[], city: string, country: string): Promise<any[]> {
    try {
      const placesWithImages = [...places];

      console.log(`Fetching images for ${places.length} places in ${city}, ${country}`);

      // Fetch images for each place in series (to avoid rate limits)
      for (let i = 0; i < placesWithImages.length; i++) {
        const place = placesWithImages[i];
        try {
          const imageUrl = await wikimediaService.fetchImageForPlace(place.name, city, country, {
            wikidata: place.poi?.tags?.wikidata,
            wikipedia: place.poi?.tags?.wikipedia,
            category: place.category,
            osmTags: place.poi?.tags,
            landmarkTier: place.landmarkTier,
          });
          if (imageUrl) {
            placesWithImages[i] = { ...place, imageUrl };
            console.log(`Found image for ${place.name}: ${imageUrl}`);
          } else {
            console.log(`No image found for ${place.name}`);
          }
        } catch (error) {
          console.error(`Error fetching image for ${place.name}:`, error);
          // Continue with the next place if there's an error
        }
      }

      return placesWithImages;
    } catch (error) {
      console.error('Error fetching images:', error);
      // Return the original places if there's an error
      return places;
    }
  }

  /**
   * Generate descriptions using the Description pod
   */
  private async generateDescriptions(places: any[], theme: string, language: string, city: string, country: string, expectedDuration: number): Promise<any[]> {
    try {
      const placesWithDescriptions = [];


      // Create tour narrative structure with positional context for each place
      const totalPlaces = places.length;
      console.log(`Setting up narrative positions for ${totalPlaces} places`);

      for (let i = 0; i < places.length; i++) {
        const place = places[i];

        // Determine position in the tour
        let position: 'first' | 'middle' | 'last' = 'middle';
        if (i === 0) position = 'first';
        else if (i === places.length - 1) position = 'last';

        // Create next/previous places lists for context
        const previousStops = places.slice(0, i).map(p => ({
          name: p.name,
          category: p.category || ''
        }));
        const nextStops = places.slice(i + 1).map(p => ({
          name: p.name,
          category: p.category || ''
        }));

        // Build tour context
        const tourContext = {
          position,
          tourTheme: theme,
          tourName: `${city} ${theme} Tour`,
          previousStops,
          nextStops,
          expectedDuration: expectedDuration
        };

        console.log(`Place ${i+1}/${totalPlaces}: ${place.name} has position: ${position}`);

        // Add required city and country fields to the place object
        const enrichedPlace = {
          ...place,
          city,
          country
        };

        try {
          const response = await axios.post(`${this.descriptionServiceUrl}/generate/description`, {
            place: enrichedPlace,
            theme,
            language,
            tourContext // Add tour context to the request
          });

          // Log the full response structure to debug
          console.log(`Description response for ${place.name}:`, JSON.stringify(response.data));

          // Fix data path: response.data.data.description instead of response.data.description
          if (!response.data || !response.data.success || !response.data.data || !response.data.data.description) {
            console.warn(`No description generated for ${place.name}, using fallback`);
            placesWithDescriptions.push({
              ...place,
              description: `Visit ${place.name}, a notable location in this area.`
            });
          } else {
            placesWithDescriptions.push({
              ...place,
              description: response.data.data.description
            });
          }
        } catch (error) {
          console.warn(`Description generation failed for ${place.name}, using fallback:`, error);
          placesWithDescriptions.push({
            ...place,
            description: `Visit ${place.name}, a notable location in this area.`
          });
        }
      }

      return placesWithDescriptions;
    } catch (error) {
      console.error('Description service error:', error);
      throw new Error(`Description service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate audio using the TTS pod and store in Supabase
   */
  private async generateAudio(
    places: any[],
    language: string,
    options?: { skipExistingAudio?: boolean }
  ): Promise<any[]> {
    const placesWithAudio = [];

    // Sort places by position to ensure correct audio sequence
    places.sort((a, b) => (a.position || 0) - (b.position || 0));

    const normalizedLanguage = (language || 'en').slice(0, 2);
    const KNOWN_VOXCPM_PROFILES = ['guide_en', 'guide_es', 'guide_fr', 'guide_de', 'guide_it'];
    const configuredVoice = process.env.VOXCPM_VOICE_PROFILE;
    const languageVoice = `guide_${normalizedLanguage}`;
    let voxcpmVoice = configuredVoice || languageVoice;
    if (!KNOWN_VOXCPM_PROFILES.includes(voxcpmVoice)) {
      const fallbackVoice = KNOWN_VOXCPM_PROFILES.includes(languageVoice) ? languageVoice : 'guide_en';
      console.warn(`Unknown VoxCPM voice profile "${voxcpmVoice}". Falling back to ${fallbackVoice}.`);
      voxcpmVoice = fallbackVoice;
    }
    console.log(`Tour language: ${language}, VoxCPM voice profile: ${voxcpmVoice}`);

    let kokoroAvailable = false;
    if (this.kokoroServiceUrl) {
      try {
        await axios.get(`${this.kokoroServiceUrl}/health`, { timeout: 3000 });
        kokoroAvailable = true;
      } catch {
        console.warn('Kokoro TTS pod is not reachable — excluding from fallback chain');
      }
    }

    const voxcpmReferenceId = this.voxcpmServiceUrl
      ? await this.resolveVoxCpmVoiceReference(language, voxcpmVoice)
      : null;

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const position = place.position !== undefined ? place.position : i;
      const isFirst = i === 0;
      const isLast = i === places.length - 1;

      try {
        if (options?.skipExistingAudio && place.audioUrl) {
          placesWithAudio.push({
            ...place,
            position
          });
          continue;
        }

        // Validate place has an ID
        if (!place.id) {
          console.error(`Place ${place.name} has no ID, skipping audio generation`);
          placesWithAudio.push({
            ...place,
            audioUrl: '',
            position
          });
          continue;
        }

        const narrationText = this.buildAudioNarrationText(place);
        if (!narrationText) {
          console.warn(`No description available for ${place.name}, skipping audio generation`);
          placesWithAudio.push({
            ...place,
            audioUrl: '',
            position
          });
          continue;
        }

        // Step 1: Generate audio with TTS pod - include position metadata
        console.log(`Generating audio for place: ${place.name} (position: ${position})`);
        const kokoroVoice = process.env.TTS_DEFAULT_VOICE || 'af_sarah';
        const baseTtsPayload = {
          text: narrationText,
          language,
          metadata: {
            position,
            isFirst,
            isLast,
            placeName: place.name
          }
        };

        const providers = [
          ...(this.voxcpmServiceUrl ? [{ name: 'VoxCPM', url: this.voxcpmServiceUrl }] : []),
          ...(kokoroAvailable ? [{ name: 'Kokoro', url: this.kokoroServiceUrl }] : [])
        ];
        const voxcpmTtsTimeoutMs = Number(process.env.VOXCPM_TTS_TIMEOUT_MS || '900000');
        const kokoroTtsTimeoutMs = Number(process.env.KOKORO_TTS_TIMEOUT_MS || '180000');

        let ttsData: any | null = null;
        let providerUsed = '';
        let fallbackReason = '';

        for (const provider of providers) {
          try {
            const ttsPayload = {
              ...baseTtsPayload,
              voice: provider.name === 'VoxCPM' ? voxcpmVoice : kokoroVoice,
              ...(provider.name === 'VoxCPM' && voxcpmReferenceId ? { referenceId: voxcpmReferenceId } : {}),
            };
            if (provider.name === 'VoxCPM') {
              console.log(`VoxCPM voice profile for ${place.name}: ${voxcpmVoice} (seed: unsupported, referenceId: ${voxcpmReferenceId || 'none'})`);
            }
            const timeout = provider.name === 'VoxCPM' ? voxcpmTtsTimeoutMs : kokoroTtsTimeoutMs;
            const response = await axios.post(`${provider.url}/tts/generate`, ttsPayload, { timeout });
            if (!response.data || !response.data.success || !response.data.audioData) {
              throw new Error('unsuccessful-or-empty-audio');
            }
            ttsData = response.data;
            providerUsed = provider.name;
            break;
          } catch (error) {
            let reason = error instanceof Error ? error.message : 'unknown-error';
            let fatal = false;
            if (axios.isAxiosError(error)) {
              const status = error.response?.status;
              const data = error.response?.data as { error?: string; fatal?: boolean } | undefined;
              if (typeof status === 'number') {
                reason = `status ${status}${data?.error ? `: ${data.error}` : ''}`;
              }
              fatal = data?.fatal === true;
            }
            if (provider.name === 'VoxCPM') {
              fallbackReason = reason;
              console.warn(`VoxCPM audio failed for ${place.name}, falling back to Kokoro: ${reason}`);
              if (fatal) {
                console.warn(`VoxCPM fatal error detected for ${place.name}; backend will use fallback provider if available.`);
              }
              continue;
            }
            console.warn(`Kokoro audio failed for ${place.name}: ${reason}`);
          }
        }

        if (!ttsData) {
          console.warn(`Audio generation failed for ${place.name}, using empty URL`);
          placesWithAudio.push({
            ...place,
            audioUrl: '',
            position
          });
          continue;
        }

        console.log(`Audio provider used for ${place.name}: ${providerUsed}${fallbackReason ? ` (fallback reason: ${fallbackReason})` : ''}`);

        // Step 2: Save audio to local filesystem and record metadata in Postgres
        console.log(`Saving audio locally for place: ${place.name}`);
        const storageResult = await this.audioStorage.save(
          place.id,
          language || 'en',
          ttsData.format || 'wav',
          ttsData.audioData
        );
        await this.audioAssetRepository.save({
          placeId: place.id,
          language: language || 'en',
          format: ttsData.format || 'wav',
          storagePath: storageResult.storagePath
        });
        console.log(`Audio saved for ${place.name}, URL: ${storageResult.audioUrl}`);
        placesWithAudio.push({
          ...place,
          audioUrl: storageResult.audioUrl,
          position
        });
      } catch (error) {
        console.error(`Audio processing error for ${place.name}:`, error);
        // Continue with other places if one fails
        placesWithAudio.push({
          ...place,
          audioUrl: '',
          position
        });
      }
    }

    // Re-sort the places by position to ensure they remain in proper order
    placesWithAudio.sort((a, b) => (a.position || 0) - (b.position || 0));
    return placesWithAudio;
  }

  /**
   * Helper method to get audio URL for a place
   */
  private async getAudioUrlForPlace(placeId: string): Promise<string> {
    try {
      const asset = await this.audioAssetRepository.findByPlaceId(placeId);
      return asset?.audioUrl || '';
    } catch (error) {
      console.error(`Failed to fetch audio URL for place ${placeId}:`, error);
      return '';
    }
  }

  private async resolveVoxCpmVoiceReference(language: string, voiceProfile: string): Promise<string | null> {
    const normalizedLanguage = (language || 'en').slice(0, 2);
    const provider = 'VoxCPM';
    const model = process.env.VOXCPM_MODEL_ID || 'openbmb/VoxCPM2';
    const id = randomUUID();

    try {
      const row = await prismaClient.voiceReferenceAudio.upsert({
        where: {
          voice_reference_audio_identity_unique: {
            language: normalizedLanguage,
            provider,
            model,
            voiceProfile
          }
        },
        update: {},
        create: {
          id,
          language: normalizedLanguage,
          provider,
          model,
          voiceProfile,
          format: 'wav',
          storagePath: `voice_references/${id}.wav`,
          metadata: {
            source: 'voxcpm-pod-cache',
            note: 'Pod creates/reuses this reference WAV when referenceId is passed.'
          }
        }
      });

      console.log(`VoxCPM voice reference resolved: ${row.id} (${normalizedLanguage}/${voiceProfile}/${model})`);
      return row.id;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown-error';
      console.warn(`Could not resolve VoxCPM voice reference, using Voice Design fallback: ${reason}`);
      return null;
    }
  }
}

export const orchestrationService = new OrchestrationService(
  new PostgresTourRepository(prismaClient),
  new PostgresAudioAssetRepository(prismaClient),
  new LocalFileAudioStorage(),
  new PostgresTourQualityReviewQueueRepository(prismaClient)
);
