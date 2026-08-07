import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { classifyPoiTags, hasPoiNotabilityTag } from '../../domain/poi/PoiClassification';
import { Theme } from '../../domain/poi/themeTags';
import { getHistoryPlaceProfile } from './HistoryPlaceScoring';
import { LandmarkTier } from './LandmarkTiering';

export interface RankedPoi extends EnrichedPoi {
  score: number;
}

interface TierAwarePoi extends EnrichedPoi {
  fameScore?: number;
  landmarkTier?: LandmarkTier;
  fame?: {
    sitelinks?: number;
  };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getHistoryDefaultTourDistancePenalty(poi: EnrichedPoi, centroidLat: number, centroidLng: number): number {
  const distanceKm = haversineKm({ lat: poi.lat, lng: poi.lng }, { lat: centroidLat, lng: centroidLng });
  if (distanceKm <= 4) {
    return 0;
  }

  const outerCorePenalty = Math.max(0, Math.min(distanceKm, 10) - 4) * 1.8;
  const remotePenalty = Math.max(0, distanceKm - 10) * 3.2;
  return outerCorePenalty + remotePenalty;
}

function scorePoi(poi: EnrichedPoi, centroidLat: number, centroidLng: number, theme?: Theme): number {
  let score = 0;
  const tierAwarePoi = poi as TierAwarePoi;

  score += tierAwarePoi.fameScore ?? 0;

  if (tierAwarePoi.landmarkTier === 'flagship') score += 4;
  else if (tierAwarePoi.landmarkTier === 'major') score += 2;
  else if (tierAwarePoi.landmarkTier === 'supporting') score += 1;

  // Notability: wikidata/wikipedia presence
  if (poi.tags.wikidata) score += 3;
  if (poi.tags.wikipedia) score += 2;

  // Name presence
  if (poi.name && poi.name.trim().length > 0) score += 1;

  // Enrichment: description available
  if (poi.enriched.description) score += 2;

  // Enrichment density: richer articles/claims tend to indicate more notable POIs.
  const wikipediaLength = poi.enriched.wikipediaBody?.length ?? 0;
  if (wikipediaLength >= 2000) score += 2;
  else if (wikipediaLength > 1000) score += 1;

  const relevantClaimKeys = ['inception', 'architect', 'heritageDesignation', 'architecturalStyle'];
  const relevantClaimCount = relevantClaimKeys.filter(key => poi.enriched.wikidataClaims?.[key]).length;
  score += Math.min(relevantClaimCount, 3);

  // Shared category classification keeps ranking and diversity aligned.
  const category = classifyPoiTags(poi.tags);

  // OSM category fit: prefer historic buildings/places over commemorative markers.
  if (poi.tags.historic === 'castle' || poi.tags.historic === 'palace') score += 1;
  if (poi.tags.building === 'cathedral' || poi.tags.building === 'palace' || poi.tags.building === 'castle') score += 1;
  if (poi.tags.tourism === 'attraction') score += 2;
  if (poi.tags.tourism === 'museum') score += 1;

  if (category === 'square_civic' && hasPoiNotabilityTag(poi.tags)) {
    score += poi.tags.place === 'square' ? 3 : 1.5;
  }

  if (category === 'market' && hasPoiNotabilityTag(poi.tags)) {
    score += 2;
  }

  if (category === 'civic_power' && hasPoiNotabilityTag(poi.tags)) {
    score += 2.5;
  }

  if (category === 'religious' && (poi.tags.heritage || hasPoiNotabilityTag(poi.tags))) {
    score += 2;
  }

  if (poi.tags.heritage) score += 1;
  if (category === 'memorial') score -= 2;
  if (category === 'artwork') score -= 1;
  if (poi.tags.historic === 'aircraft') score -= 3;

  if (theme === 'history') {
    const historyProfile = getHistoryPlaceProfile(poi);
    score += Math.min(10, historyProfile.score);
    score -= getHistoryDefaultTourDistancePenalty(poi, centroidLat, centroidLng);
    if (historyProfile.isMuseumLike && !historyProfile.isEventSiteLike) {
      score -= 3;
    }
  }

  // Translated name available
  if (Object.keys(poi.enriched.nameTranslations).length > 0) score += 1;

  return score;
}

function getCategoryDiversityPenalty(
  categoryCounts: Map<string, number>,
  selectedCount: number,
  category: string
): number {
  if (selectedCount === 0) {
    return 1;
  }

  const currentCount = categoryCounts.get(category) ?? 0;
  const share = currentCount / selectedCount;
  const overuse = Math.max(0, share - 0.5);
  const repetitionPenalty = Math.max(0, currentCount - 1) * 0.2;

  return 1 + (overuse * 2.5) + repetitionPenalty;
}

/**
 * Pure function. Ranks enriched POIs by landmark fame/tier plus existing enrichment
 * and category-fit signals. Returns sorted descending by score.
 */
export function rankPois(
  pois: EnrichedPoi[],
  centroidLat: number,
  centroidLng: number,
  theme?: Theme
): RankedPoi[] {
  const scored: RankedPoi[] = pois.map(poi => ({
    ...poi,
    score: scorePoi(poi, centroidLat, centroidLng, theme),
  }));

  const selected: RankedPoi[] = [];
  const remaining = [...scored];
  const categoryCounts = new Map<string, number>();

  while (remaining.length > 0) {
    remaining.sort((a, b) => {
      const aPenalty = getCategoryDiversityPenalty(categoryCounts, selected.length, classifyPoiTags(a.tags));
      const bPenalty = getCategoryDiversityPenalty(categoryCounts, selected.length, classifyPoiTags(b.tags));
      const aAdjustedScore = a.score / aPenalty;
      const bAdjustedScore = b.score / bPenalty;

      if (bAdjustedScore !== aAdjustedScore) {
        return bAdjustedScore - aAdjustedScore;
      }

      return b.score - a.score;
    });

    const next = remaining.shift();
    if (!next) {
      break;
    }

    selected.push(next);
    const category = classifyPoiTags(next.tags);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  return selected;
}
