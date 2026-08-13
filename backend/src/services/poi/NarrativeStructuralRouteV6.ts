import { TourRequest } from '../../types/api';
import { buildTourNarrativePlan } from '../narrative/TourTextQuality';
import { StructuralTourData } from '../orchestrationService';
import {
  NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6,
  NarrativeRouteBriefV6,
  narrativeFingerprintV6,
} from './NarrativeContractsV6';

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function routeStopId(name: string): string {
  return normalized(name).replace(/\s+/g, '-');
}

function wikipediaUrl(tags: Record<string, string | undefined>, attributionUrl?: string): string | null {
  if (attributionUrl) return attributionUrl;
  const tagged = tags.wikipedia;
  if (!tagged) return null;
  const separator = tagged.indexOf(':');
  if (separator <= 0 || separator === tagged.length - 1) return null;
  const language = tagged.slice(0, separator);
  const title = tagged.slice(separator + 1).replace(/ /g, '_');
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%2F/gi, '/')}`;
}

export function buildNarrativeRouteFromStructuralTourV6(input: {
  request: TourRequest;
  structuralTour: StructuralTourData;
}): NarrativeRouteBriefV6 {
  const { request, structuralTour } = input;
  if (structuralTour.places.length < 4 || structuralTour.places.length > 8) {
    throw new Error('structural narrative route must contain between 4 and 8 stops');
  }
  const names = structuralTour.places.map((place) => (
    place.nameInTourLanguage?.trim() || place.name.trim()
  ));
  if (names.some((name) => !name)) throw new Error('structural narrative route has an empty name');
  const stopIds = names.map(routeStopId);
  if (new Set(stopIds).size !== stopIds.length) {
    throw new Error('structural narrative route has duplicate stop identities');
  }
  const narrativePlan = buildTourNarrativePlan({
    city: request.city,
    theme: request.theme,
    language: request.language,
    placeNames: names,
  });
  const stops = structuralTour.places.map((place, position) => {
    const lat = place.coordinates.lat;
    const lng = place.coordinates.lng;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`structural narrative stop ${stopIds[position]} has invalid coordinates`);
    }
    const attribution = place.poi.enriched.attribution;
    const wikidataId = attribution.wikidata?.id ?? place.poi.tags.wikidata;
    if (!wikidataId || !/^Q\d+$/u.test(wikidataId)) {
      throw new Error(`structural narrative stop ${stopIds[position]} lacks a Wikidata identity`);
    }
    const wikidataUrl = attribution.wikidata?.url
      ?? `https://www.wikidata.org/wiki/${wikidataId}`;
    return {
      stopId: stopIds[position],
      position,
      name: names[position],
      narrativeRole: narrativePlan.stopRoles[position].role,
      wikidataId,
      wikidataUrl,
      wikipediaUrl: wikipediaUrl(place.poi.tags, attribution.wikipedia?.url),
      coordinates: { lat, lng },
      previousStopId: stopIds[position - 1] ?? null,
      nextStopId: stopIds[position + 1] ?? null,
    };
  });
  const route = {
    schemaVersion: NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6,
    caseId: `${normalized(request.city).replace(/\s+/g, '-')}-${request.theme}-${request.language}-${request.durationMinutes}`,
    city: request.city,
    country: request.country,
    language: request.language,
    theme: request.theme,
    durationMinutes: request.durationMinutes,
    stops,
  };
  return { ...route, fingerprint: narrativeFingerprintV6(route) };
}
