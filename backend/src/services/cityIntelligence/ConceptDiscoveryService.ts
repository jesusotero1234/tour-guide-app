import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { CityConceptDiscoveryResult, ConceptConfidence, ConceptPoiRef, ConceptRouteType, TourConcept } from '../../domain/concepts/TourConcept';
import { RawPoi } from '../../domain/poi/RawPoi';
import { classifyPoiTags, PoiCategory } from '../../domain/poi/PoiClassification';
import { Theme } from '../../domain/poi/themeTags';
import { geocodeCity } from '../../infrastructure/geocoder/NominatimGeocoder';
import { prismaClient } from '../../infrastructure/db/prismaClient';
import { WikidataLandmarkMetadata, fetchWikidataLandmarkMetadata, tierPoisByLandmarkFame } from '../poi/LandmarkTiering';
import { PostgresPoiCacheRepository } from '../../infrastructure/postgres/PostgresPoiCacheRepository';
import { PostgresPoiEnrichmentCacheRepository } from '../../infrastructure/postgres/PostgresPoiEnrichmentCacheRepository';
import { fetchPoisForTheme } from '../../infrastructure/poi/OverpassPoiFetcher';
import { enrichShortlistedPois } from '../poi/PoiEnrichmentPipeline';
import { rankPois } from '../poi/PoiRanker';
import { composeWalkingRoute, estimateRouteMetrics } from '../poi/RouteSelection';
import { getDurationPlan } from '../poi/DurationPlanning';
import { conceptCategoryMatches, isEligibleForL1, isEligibleForL2, isEligibleForL3 } from './conceptRules';
import { normalizeCityName } from '../tourQuality/VerifiedCities';
import { getConceptDisplayCopy } from './conceptDisplayCopy';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONCEPT_DURATION_MINUTES = 120;
const OSRM_BASE_URL = 'https://router.project-osrm.org';

function applyDisplayCopy(city: string, concept: TourConcept): TourConcept {
  const copy = getConceptDisplayCopy({ city, routeType: concept.routeType, slug: concept.slug });
  return {
    ...concept,
    title: copy.title,
    angle: copy.subtitle,
  };
}

type ConceptCandidatePoi = {
  raw: RawPoi;
  name: string;
  category: PoiCategory;
  landmarkTier: string;
  fameScore: number;
  sitelinks: number;
  wikipediaBodyLength: number;
  instanceOfLabels: string[];
  wikidataClaims: Record<string, string> | null;
  lat: number;
  lng: number;
};

type ThemePools = Record<Theme, ConceptCandidatePoi[]>;

type ConceptDefinition = {
  routeType: ConceptRouteType;
  title: (city: string) => string;
  angle: string;
  iconKey: string;
  poolThemes: Theme[];
  categoryFilter?: (poi: ConceptCandidatePoi) => boolean;
  anchorPredicate?: (poi: ConceptCandidatePoi) => boolean;
  minAnchors: number;
  minSupporting: number;
  minStops: number;
  maxStops: number;
  minEvidencePoiCount?: number;
  evidencePredicate?: (poi: ConceptCandidatePoi) => boolean;
};

const CONCEPT_DEFINITIONS: ConceptDefinition[] = [
  {
    routeType: 'historical',
    title: (city) => `${city} Historical Highlights`,
    angle: 'Historic landmarks, squares, churches, and major civic memory.',
    iconKey: 'landmark',
    poolThemes: ['history'],
    minAnchors: 2,
    minSupporting: 3,
    minStops: 5,
    maxStops: 8,
    minEvidencePoiCount: 3,
    evidencePredicate: (poi) => Boolean(poi.raw.tags.heritage || poi.wikidataClaims?.inception),
  },
  {
    routeType: 'architecture',
    title: (city) => `${city} Architecture Walk`,
    angle: 'Buildings, design, and major civic or monumental architecture.',
    iconKey: 'building',
    poolThemes: ['architecture'],
    anchorPredicate: (poi) => (
      (poi.landmarkTier === 'flagship' || poi.landmarkTier === 'major')
      && poi.sitelinks >= 8
      && poi.wikipediaBodyLength >= 500
      && Boolean(poi.wikidataClaims?.architect || poi.wikidataClaims?.architecturalStyle || poi.raw.tags.building)
    ),
    minAnchors: 2,
    minSupporting: 3,
    minStops: 5,
    maxStops: 7,
    minEvidencePoiCount: 2,
    evidencePredicate: (poi) => Boolean(poi.wikidataClaims?.architect || poi.wikidataClaims?.architecturalStyle),
  },
  {
    routeType: 'royal',
    title: (city) => `${city} Royal And Palace Route`,
    angle: 'Palaces, royal spaces, and monuments of power.',
    iconKey: 'crown',
    poolThemes: ['history', 'architecture'],
    categoryFilter: (poi) => poi.category === 'palace_castle' && poi.sitelinks >= 10,
    minAnchors: 1,
    minSupporting: 1,
    minStops: 5,
    maxStops: 5,
  },
  {
    routeType: 'religious',
    title: (city) => `${city} Sacred And Religious Heritage`,
    angle: 'Churches, cathedrals, and religious heritage with strong public significance.',
    iconKey: 'church',
    poolThemes: ['history', 'architecture'],
    categoryFilter: (poi) => poi.category === 'religious' && (poi.sitelinks >= 5 || Boolean(poi.raw.tags.heritage)),
    minAnchors: 1,
    minSupporting: 1,
    minStops: 5,
    maxStops: 6,
  },
  {
    routeType: 'markets',
    title: (city) => `${city} Markets And Public Life`,
    angle: 'Markets, squares, and social spaces tied to everyday city life.',
    iconKey: 'market',
    poolThemes: ['food'],
    categoryFilter: (poi) => poi.category === 'market',
    minAnchors: 2,
    minSupporting: 3,
    minStops: 5,
    maxStops: 6,
  },
  {
    routeType: 'general',
    title: (city) => `${city} Essential Landmarks`,
    angle: 'A balanced first-visit route through the city’s most recognisable places.',
    iconKey: 'star',
    poolThemes: ['history'],
    minAnchors: 2,
    minSupporting: 3,
    minStops: 5,
    maxStops: 7,
  },
  {
    routeType: 'art',
    title: (city) => `${city} Art And Museum Route`,
    angle: 'Museums, art landmarks, and culturally notable collections.',
    iconKey: 'palette',
    poolThemes: ['art'],
    categoryFilter: (poi) => poi.category === 'museum' || poi.category === 'artwork',
    minAnchors: 1,
    minSupporting: 2,
    minStops: 5,
    maxStops: 5,
  },
];

function normalizeStopName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalizeStopName(value).replace(/\s+/g, '-');
}

function getPoiIdentity(poi: ConceptCandidatePoi): string {
  return poi.raw.tags.wikidata || `${poi.raw.osmType}:${poi.raw.osmId}`;
}

function getConceptPoiRef(poi: ConceptCandidatePoi): ConceptPoiRef {
  return {
    wikidata: poi.raw.tags.wikidata,
    osmType: poi.raw.osmType,
    osmId: poi.raw.osmId,
    name: poi.name,
    lat: poi.lat,
    lng: poi.lng,
    category: poi.category,
    landmarkTier: poi.landmarkTier,
    fameScore: poi.fameScore,
  };
}

function calculateSpreadMeters(pois: ConceptPoiRef[]): number {
  if (pois.length === 0) return 0;
  const metrics = estimateRouteMetrics(pois.map((poi) => ({ coordinates: { lat: poi.lat, lng: poi.lng } })));
  return Math.round(metrics.walkingMeters);
}

function getOverlapRatio(left: TourConcept, right: TourConcept): number {
  const leftIds = new Set([...left.anchorPois, ...left.supportingPois].map((poi) => poi.wikidata || `${poi.osmType}:${poi.osmId}`));
  const rightIds = new Set([...right.anchorPois, ...right.supportingPois].map((poi) => poi.wikidata || `${poi.osmType}:${poi.osmId}`));
  const shared = [...leftIds].filter((id) => rightIds.has(id)).length;
  const denominator = Math.min(leftIds.size, rightIds.size) || 1;
  return shared / denominator;
}

function inferConfidence(anchorCount: number, walkabilityOk: boolean, maxOverlap: number): ConceptConfidence {
  if (anchorCount >= 3 && walkabilityOk) {
    return 'high';
  }

  if (anchorCount >= 2 || (anchorCount >= 1 && maxOverlap < 0.6)) {
    return 'medium';
  }

  return 'low';
}

async function validateWalkability(anchorPois: ConceptPoiRef[]): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || anchorPois.length < 2) {
    return true;
  }

  try {
    for (let index = 1; index < anchorPois.length; index++) {
      const from = anchorPois[index - 1];
      const to = anchorPois[index];
      const response = await axios.get(`${OSRM_BASE_URL}/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}`, {
        params: { overview: 'false' },
        timeout: 10000,
        headers: { 'User-Agent': 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)' },
      });

      const route = response.data?.routes?.[0];
      if (!route || typeof route.distance !== 'number' || typeof route.duration !== 'number') {
        continue;
      }

      const euclidean = estimateRouteMetrics([
        { coordinates: { lat: from.lat, lng: from.lng } },
        { coordinates: { lat: to.lat, lng: to.lng } },
      ]);
      const actualMinutes = route.duration / 60;
      const actualMeters = route.distance;
      const ratio = euclidean.walkingMinutes > 0 ? actualMinutes / euclidean.walkingMinutes : 1;

      if (ratio > 1.6 || actualMeters > 1500) {
        return false;
      }
    }
  } catch (error) {
    console.warn('[ConceptDiscovery] walkability validation failed, falling back to route heuristics', error);
  }

  return true;
}

function filterAcceptedConcepts(concepts: TourConcept[]): { accepted: TourConcept[]; rejected: Array<{ slug: string; reason: string }> } {
  const accepted: TourConcept[] = [];
  const rejected: Array<{ slug: string; reason: string }> = [];

  for (const concept of concepts.sort((left, right) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    return confidenceOrder[left.confidence] - confidenceOrder[right.confidence];
  })) {
    const conflicting = accepted.find((existing) => getOverlapRatio(existing, concept) > 0.4);
    if (conflicting) {
      rejected.push({ slug: concept.slug, reason: `overlap_with_${conflicting.slug}` });
      continue;
    }
    accepted.push(concept);
  }

  return { accepted, rejected };
}

export class ConceptDiscoveryService {
  constructor(private readonly prisma: PrismaClient) {}

  private async getThemePool(city: string, language: string, theme: Theme): Promise<ConceptCandidatePoi[]> {
    const poiCache = new PostgresPoiCacheRepository(this.prisma);
    const enrichmentCache = new PostgresPoiEnrichmentCacheRepository(this.prisma);
    const geocoded = await geocodeCity(city);
    let rawPois = await poiCache.get(city, theme);
    if (!rawPois) {
      rawPois = await fetchPoisForTheme(geocoded, theme);
      if (rawPois.length > 0) {
        await poiCache.set(city, theme, rawPois);
      }
    }

    const wikidataMetadata = await fetchWikidataLandmarkMetadata(
      rawPois
        .map((poi) => poi.tags.wikidata)
        .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0),
      language
    );

    const sitelinks = Object.fromEntries(Object.entries(wikidataMetadata).map(([wikidataId, metadata]) => [wikidataId, metadata.sitelinks]));
    const tiered = tierPoisByLandmarkFame(rawPois, sitelinks, theme, wikidataMetadata);
    const shortlisted = tiered.slice(0, Math.min(Math.max(getDurationPlan(CONCEPT_DURATION_MINUTES).candidateCount, 40), tiered.length));
    const enriched = await enrichShortlistedPois(shortlisted, language, enrichmentCache, 4);
    const ranked = rankPois(enriched, geocoded.lat, geocoded.lng);

    return ranked.flatMap((poi) => {
      const metadata = poi.tags.wikidata ? wikidataMetadata[poi.tags.wikidata] : undefined;
      const ruleInput = {
        poi,
        sitelinks: metadata?.sitelinks ?? 0,
        instanceOfLabels: metadata?.instanceOfLabels ?? [],
        wikipediaBodyLength: poi.enriched.wikipediaBody?.length ?? 0,
        landmarkTier: (poi as any).landmarkTier as string | undefined,
      };

      if (!isEligibleForL1(ruleInput, theme) || !isEligibleForL2(ruleInput)) {
        return [];
      }

      return [{
        raw: poi,
        name: poi.name || poi.tags.name || '',
        category: classifyPoiTags(poi.tags),
        landmarkTier: (poi as any).landmarkTier ?? 'filler',
        fameScore: (poi as any).fameScore ?? 0,
        sitelinks: metadata?.sitelinks ?? 0,
        wikipediaBodyLength: poi.enriched.wikipediaBody?.length ?? 0,
        instanceOfLabels: metadata?.instanceOfLabels ?? [],
        wikidataClaims: poi.enriched.wikidataClaims,
        lat: poi.lat,
        lng: poi.lng,
      } satisfies ConceptCandidatePoi];
    });
  }

  private async buildPools(city: string, language: string): Promise<ThemePools> {
    const themes: Theme[] = ['history', 'architecture', 'food', 'art'];
    const entries = await Promise.all(themes.map(async (theme) => [theme, await this.getThemePool(city, language, theme)] as const));
    return Object.fromEntries(entries) as ThemePools;
  }

  private async buildConcept(city: string, language: string, definition: ConceptDefinition, pools: ThemePools): Promise<TourConcept | null> {
    const merged = definition.poolThemes.flatMap((theme) => pools[theme]);
    const unique = new Map<string, ConceptCandidatePoi>();
    for (const poi of merged) {
      if (!conceptCategoryMatches(definition.routeType, poi.category)) continue;
      if (definition.categoryFilter && !definition.categoryFilter(poi)) continue;
      unique.set(getPoiIdentity(poi), poi);
    }

    const candidates = [...unique.values()]
      .sort((left, right) => right.fameScore - left.fameScore || left.name.localeCompare(right.name));

    if (candidates.length < definition.minStops) {
      return null;
    }

    const anchors = candidates.filter((poi) => (definition.anchorPredicate ? definition.anchorPredicate(poi) : isEligibleForL3({
      poi: poi.raw,
      sitelinks: poi.sitelinks,
      instanceOfLabels: poi.instanceOfLabels,
      wikipediaBodyLength: poi.wikipediaBodyLength,
      landmarkTier: poi.landmarkTier,
    })));

    if (anchors.length < definition.minAnchors) {
      return null;
    }

    if (definition.minEvidencePoiCount && definition.evidencePredicate) {
      const evidenceCount = candidates.filter(definition.evidencePredicate).length;
      if (evidenceCount < definition.minEvidencePoiCount) {
        return null;
      }
    }

    const routeCandidates = candidates.map((poi) => ({
      name: poi.name,
      wikidataId: poi.raw.tags.wikidata,
      coordinates: { lat: poi.lat, lng: poi.lng },
      importance_score: poi.fameScore,
      fameScore: poi.fameScore,
      landmarkTier: poi.landmarkTier,
      category: poi.category,
      poi,
    }));

    const route = composeWalkingRoute(routeCandidates, CONCEPT_DURATION_MINUTES, definition.routeType, {
      minStops: definition.minStops,
      maxStops: Math.min(definition.maxStops, routeCandidates.length),
    });

    const routePois = route.route
      .map((candidate) => (candidate as any).poi as ConceptCandidatePoi)
      .filter(Boolean);

    if (routePois.length < definition.minStops) {
      return null;
    }

    const routeAnchors = routePois.filter((poi) => anchors.some((anchor) => getPoiIdentity(anchor) === getPoiIdentity(poi))).slice(0, 3);
    const supporting = routePois.filter((poi) => !routeAnchors.some((anchor) => getPoiIdentity(anchor) === getPoiIdentity(poi)));

    if (supporting.length < definition.minSupporting) {
      return null;
    }

    const anchorRefs = routeAnchors.map(getConceptPoiRef);
    const walkabilityOk = await validateWalkability(anchorRefs);
    const allRefs = routePois.map(getConceptPoiRef);

    return {
      slug: slugify(`${city}-${definition.routeType}`),
      title: definition.title(city),
      routeType: definition.routeType,
      angle: definition.angle,
      iconKey: definition.iconKey,
      estimatedStops: allRefs.length,
      suggestedDurationMinutes: CONCEPT_DURATION_MINUTES,
      confidence: 'medium',
      reason: `${definition.routeType} concept detected from clustered notable POIs in ${city}.`,
      anchorPois: anchorRefs,
      supportingPois: supporting.map(getConceptPoiRef),
      signals: {
        poiCount: allRefs.length,
        flagshipCount: routePois.filter((poi) => poi.landmarkTier === 'flagship').length,
        majorCount: routePois.filter((poi) => poi.landmarkTier === 'major').length,
        spreadMeters: calculateSpreadMeters(allRefs),
        overlapWithOthers: {},
        walkabilityOk,
      },
    };
  }

  private async persist(city: string, countryCode: string, language: string, discovery: CityConceptDiscoveryResult): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.cityConceptCache.upsert({
        where: {
          city_countryCode_language: {
            city,
            countryCode,
            language,
          },
        },
        create: {
          city,
          countryCode,
          language,
          payload: discovery as any,
          computedAt: now,
          expiresAt,
        },
        update: {
          payload: discovery as any,
          computedAt: now,
          expiresAt,
        },
      });

      await tx.tourConcept.deleteMany({ where: { city, countryCode, language } });

      if (discovery.concepts.length > 0) {
        await tx.tourConcept.createMany({
          data: discovery.concepts
            .filter((concept) => concept.confidence !== 'low')
            .map((concept) => ({
              city,
              countryCode,
              language,
              slug: concept.slug,
              title: concept.title,
              routeType: concept.routeType,
              angle: concept.angle,
              iconKey: concept.iconKey,
              estimatedStops: concept.estimatedStops,
              suggestedDurationMinutes: concept.suggestedDurationMinutes,
              confidence: concept.confidence,
              status: 'draft',
              anchorPoiIds: concept.anchorPois as any,
              supportingPoiIds: concept.supportingPois as any,
              signals: concept.signals as any,
            })),
        });
      }
    });
  }

  async getCityConcepts(params: { city: string; countryCode: string; language: string; includeLowConfidence?: boolean }): Promise<CityConceptDiscoveryResult> {
    const city = params.city.trim();
    const countryCode = params.countryCode.trim().toUpperCase();
    const language = (params.language || 'en').trim().toLowerCase();
    const cached = await this.prisma.cityConceptCache.findUnique({
      where: {
        city_countryCode_language: { city, countryCode, language },
      },
    });

    if (cached && cached.expiresAt > new Date()) {
      const payload = cached.payload as unknown as CityConceptDiscoveryResult;
      if (params.includeLowConfidence) {
        return {
          ...payload,
          concepts: payload.concepts.map((concept) => applyDisplayCopy(city, concept)),
        };
      }

      return {
        ...payload,
        concepts: payload.concepts
          .filter((concept) => concept.confidence !== 'low')
          .map((concept) => applyDisplayCopy(city, concept)),
      };
    }

    const canonicalCity = normalizeCityName(city);
    const pools = await this.buildPools(city, language);
    const conceptCandidates = (await Promise.all(CONCEPT_DEFINITIONS.map((definition) => this.buildConcept(city, language, definition, pools))))
      .filter((concept): concept is TourConcept => Boolean(concept));

    for (const concept of conceptCandidates) {
      concept.signals.overlapWithOthers = Object.fromEntries(
        conceptCandidates
          .filter((other) => other.slug !== concept.slug)
          .map((other) => [other.slug, Number(getOverlapRatio(concept, other).toFixed(3))])
      );
      const maxOverlap = Math.max(0, ...Object.values(concept.signals.overlapWithOthers));
      concept.confidence = inferConfidence(concept.anchorPois.length, concept.signals.walkabilityOk, maxOverlap);
    }

    const { accepted, rejected } = filterAcceptedConcepts(conceptCandidates);
    const discovery: CityConceptDiscoveryResult = {
      city,
      countryCode,
      language,
      computedAt: new Date().toISOString(),
      concepts: accepted,
      rejected: [
        ...rejected,
        ...conceptCandidates
          .filter((concept) => concept.confidence === 'low')
          .map((concept) => ({ slug: concept.slug, reason: 'low_confidence' })),
      ],
    };

    await this.persist(city, countryCode, language, discovery);

    if (params.includeLowConfidence) {
      return {
        ...discovery,
        concepts: discovery.concepts.map((concept) => applyDisplayCopy(city, concept)),
      };
    }

    return {
      ...discovery,
      concepts: discovery.concepts
        .filter((concept) => concept.confidence !== 'low')
        .map((concept) => applyDisplayCopy(city, concept)),
    };
  }
}

export const conceptDiscoveryService = new ConceptDiscoveryService(prismaClient);
