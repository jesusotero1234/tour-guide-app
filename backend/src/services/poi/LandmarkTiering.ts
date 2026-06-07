import { RawPoi } from '../../domain/poi/RawPoi';
import { classifyPoiTags, hasPoiNotabilityTag } from '../../domain/poi/PoiClassification';
import { Theme } from '../../domain/poi/themeTags';
import { wikidataGet } from '../../infrastructure/enrichment/wikidataClient';

export type LandmarkTier = 'flagship' | 'major' | 'supporting' | 'filler';

export interface LandmarkTieredPoi extends RawPoi {
  fame: {
    sitelinks: number;
  };
  fameScore: number;
  landmarkTier: LandmarkTier;
}

interface WikidataEntityLike {
  id?: string;
  missing?: boolean;
  sitelinks?: Record<string, unknown>;
  claims?: Record<string, any[]>;
  labels?: Record<string, { value?: string }>;
}

export interface WikidataLandmarkMetadata {
  sitelinks: number;
  instanceOfLabels: string[];
}

type FameAttribution = 'normal' | 'transferable';

const HISTORY_EXCLUDED_INSTANCE_OF_LABELS = new Set([
  'spacecraft',
  'lunar lander',
  'satellite program',
  'artificial satellite',
  'satellite',
  'rocket',
  'space probe',
  'space vehicle',
  'vehicle family',
  'road vehicle',
  'automobile model',
  'aircraft',
  'aerospace vehicle',
  'space launch vehicle',
  'rocket stage',
  'missile',
  'aviation museum',
  'aerospace museum',
  'space museum',
  'science museum',
  'transport museum',
]);

const HISTORY_AREA_INSTANCE_OF_LABELS = new Set([
  'city',
  'town',
  'municipality',
  'municipality of spain',
  'human settlement',
  'capital city',
  'administrative territorial entity',
  'district',
  'neighbourhood',
  'historic district',
  'historic centre',
  'historic center',
]);

const HISTORY_PLACE_LIKE_INSTANCE_OF_LABELS = new Set([
  'archaeological site',
  'art museum',
  'basilica',
  'bridge',
  'building',
  'castle',
  'cathedral',
  'church building',
  'city gate',
  'city hall',
  'concert hall',
  'cultural center',
  'fortification',
  'gate',
  'historic house museum',
  'library building',
  'market hall',
  'memorial',
  'monastery',
  'monument',
  'mosque',
  'museum',
  'museum building',
  'opera house',
  'palace',
  'park',
  'place of worship',
  'plaza',
  'religious building',
  'shrine',
  'site of special scientific interest',
  'square',
  'synagogue',
  'temple',
  'theatre building',
  'tower',
]);

const HISTORY_TRANSFERABLE_INSTANCE_OF_LABELS = new Set([
  'aerospace vehicle',
  'aircraft',
  'aircraft family',
  'aircraft model',
  'artillery',
  'automobile model',
  'bomber aircraft',
  'fighter aircraft',
  'firearm model',
  'helicopter',
  'interceptor aircraft',
  'jet aircraft',
  'locomotive',
  'military aircraft',
  'missile',
  'model of aircraft',
  'reconnaissance aircraft',
  'road vehicle',
  'rocket',
  'ship',
  'ship class',
  'space launch vehicle',
  'space probe',
  'space vehicle',
  'spacecraft',
  'submarine',
  'tank',
  'train',
  'trainer aircraft',
  'transport aircraft',
  'vehicle',
  'vehicle family',
  'weapon',
]);

function compareTier(left: LandmarkTier, right: LandmarkTier): number {
  const order: LandmarkTier[] = ['flagship', 'major', 'supporting', 'filler'];
  return order.indexOf(left) - order.indexOf(right);
}

function extractClaimEntityIds(claims: Record<string, any[]> | undefined, propId: string): string[] {
  return (claims?.[propId] ?? [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value): value is string => typeof value === 'string');
}

function normalizeEntityLabel(label: string): string {
  return label.trim().toLowerCase();
}

function hasHistoryExcludedType(instanceOfLabels: string[]): boolean {
  return instanceOfLabels.map(normalizeEntityLabel).some((label) => HISTORY_EXCLUDED_INSTANCE_OF_LABELS.has(label));
}

function hasHistoryAreaType(instanceOfLabels: string[]): boolean {
  return instanceOfLabels.map(normalizeEntityLabel).some((label) => HISTORY_AREA_INSTANCE_OF_LABELS.has(label));
}

function hasHistoryPlaceLikeType(instanceOfLabels: string[]): boolean {
  return instanceOfLabels.map(normalizeEntityLabel).some((label) => HISTORY_PLACE_LIKE_INSTANCE_OF_LABELS.has(label));
}

function hasHistoryTransferableType(instanceOfLabels: string[]): boolean {
  return instanceOfLabels.map(normalizeEntityLabel).some((label) => HISTORY_TRANSFERABLE_INSTANCE_OF_LABELS.has(label));
}

function getHistoryFameAttribution(poi: RawPoi, instanceOfLabels: string[]): FameAttribution {
  if (instanceOfLabels.length === 0) {
    return 'normal';
  }

  if (hasHistoryPlaceLikeType(instanceOfLabels)) {
    return 'normal';
  }

  const category = classifyPoiTags(poi.tags);
  if (category === 'palace_castle' || category === 'square_civic' || category === 'market' || category === 'religious' || category === 'museum') {
    return 'normal';
  }

  return hasHistoryTransferableType(instanceOfLabels) ? 'transferable' : 'normal';
}

function getFameAttribution(
  poi: RawPoi,
  theme: Theme | undefined,
  metadata: WikidataLandmarkMetadata | undefined
): FameAttribution {
  if (theme !== 'history') {
    return 'normal';
  }

  return getHistoryFameAttribution(poi, metadata?.instanceOfLabels ?? []);
}

function getEffectiveSitelinks(
  poi: RawPoi,
  sitelinks: number,
  theme: Theme | undefined,
  metadata: WikidataLandmarkMetadata | undefined
): number {
  if (getFameAttribution(poi, theme, metadata) === 'transferable') {
    return Math.min(sitelinks, 5);
  }

  return sitelinks;
}

function capLandmarkTier(tier: LandmarkTier, fameAttribution: FameAttribution): LandmarkTier {
  if (fameAttribution !== 'transferable') {
    return tier;
  }

  if (tier === 'flagship' || tier === 'major') {
    return 'supporting';
  }

  return tier;
}

function shouldExcludePoiForTheme(
  poi: RawPoi,
  theme: Theme | undefined,
  metadata: WikidataLandmarkMetadata | undefined
): boolean {
  if (theme !== 'history') {
    return false;
  }

  const place = poi.tags.place?.toLowerCase();
  if (place && ['city', 'town', 'village', 'municipality', 'suburb', 'quarter', 'neighbourhood'].includes(place)) {
    return true;
  }

  const instanceOfLabels = metadata?.instanceOfLabels ?? [];
  if (hasHistoryAreaType(instanceOfLabels)) {
    return true;
  }

  if (hasHistoryPlaceLikeType(instanceOfLabels)) {
    return false;
  }

  return hasHistoryExcludedType(instanceOfLabels);
}

export function scoreLandmarkFame(poi: RawPoi, sitelinks: number): number {
  const category = classifyPoiTags(poi.tags);
  let score = Math.log2(sitelinks + 1) * 3;

  if (poi.tags.wikidata) score += 1;
  if (poi.tags.wikipedia) score += 1;
  if (hasPoiNotabilityTag(poi.tags)) score += 1;
  if (poi.osmType === 'way' || poi.osmType === 'relation') score += 0.75;
  if (poi.tags.tourism === 'attraction') score += 2;
  if (poi.tags.tourism === 'museum') score += 1.25;
  if (poi.tags.place === 'square') score += 1.5;
  if (poi.tags.amenity === 'marketplace') score += 1.25;
  if (poi.tags.heritage) score += 1.5;

  if (category === 'palace_castle' || category === 'square_civic' || category === 'museum') {
    score += 1;
  }

  if (category === 'religious' && poi.tags.heritage) {
    score += 1;
  }

  if (category === 'memorial') score -= 1.5;
  if (category === 'artwork') score -= 1;

  return score;
}

export function assignLandmarkTier(rankIndex: number, totalPois: number): LandmarkTier {
  if (totalPois <= 1) {
    return 'flagship';
  }

  const flagshipCutoff = Math.max(1, Math.floor(totalPois * 0.1));
  const majorCutoff = Math.max(flagshipCutoff + 1, Math.ceil(totalPois * 0.4));
  const supportingCutoff = Math.max(majorCutoff + 1, Math.ceil(totalPois * 0.75));
  const rank = rankIndex + 1;

  if (rank <= flagshipCutoff) return 'flagship';
  if (rank <= majorCutoff) return 'major';
  if (rank <= supportingCutoff) return 'supporting';
  return 'filler';
}

export function tierPoisByLandmarkFame(
  pois: RawPoi[],
  sitelinksByWikidataId: Record<string, number>,
  theme?: Theme,
  wikidataMetadataById: Record<string, WikidataLandmarkMetadata> = {}
): LandmarkTieredPoi[] {
  const scored = pois.flatMap((poi) => {
    const metadata = poi.tags.wikidata ? wikidataMetadataById[poi.tags.wikidata] : undefined;
    if (shouldExcludePoiForTheme(poi, theme, metadata)) {
      return [];
    }

    const sitelinks = poi.tags.wikidata ? sitelinksByWikidataId[poi.tags.wikidata] ?? 0 : 0;
    const effectiveSitelinks = getEffectiveSitelinks(poi, sitelinks, theme, metadata);
    const fameAttribution = getFameAttribution(poi, theme, metadata);
    return [{
      ...poi,
      fame: { sitelinks },
      fameScore: scoreLandmarkFame(poi, effectiveSitelinks),
      landmarkTier: 'filler' as LandmarkTier,
      _fameAttribution: fameAttribution,
    }];
  });

  scored.sort((a, b) => {
    if (b.fameScore !== a.fameScore) {
      return b.fameScore - a.fameScore;
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  return scored.map((poi, index) => ({
    ...poi,
    landmarkTier: capLandmarkTier(assignLandmarkTier(index, scored.length), poi._fameAttribution),
  })).sort((a, b) => {
    if (b.fameScore !== a.fameScore) {
      return b.fameScore - a.fameScore;
    }
    if (a.landmarkTier !== b.landmarkTier) {
      return compareTier(a.landmarkTier, b.landmarkTier);
    }
    return (a.name || '').localeCompare(b.name || '');
  }).map(({ _fameAttribution, ...poi }) => poi);
}

async function fetchEntityLabels(ids: string[], language = 'en'): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const data = await wikidataGet<any>({
    params: {
      action: 'wbgetentities',
      ids: uniqueIds.join('|'),
      props: 'labels',
      languages: [language, 'en'].filter((lang, idx, arr) => arr.indexOf(lang) === idx).join('|'),
      format: 'json',
      formatversion: 2,
    },
  });

  const entities = data?.entities;
  const entries: Array<[string, WikidataEntityLike]> = Array.isArray(entities)
    ? entities
        .filter((entity: WikidataEntityLike | null | undefined): entity is WikidataEntityLike => Boolean(entity?.id))
        .map((entity) => [entity.id as string, entity])
    : Object.entries((entities ?? {}) as Record<string, WikidataEntityLike>);

  return Object.fromEntries(entries.map(([id, entity]) => {
    const labels = entity.labels ?? {};
    return [id, labels[language]?.value || labels.en?.value || id];
  }));
}

export async function fetchWikidataLandmarkMetadata(
  wikidataIds: string[],
  language = 'en'
): Promise<Record<string, WikidataLandmarkMetadata>> {
  const uniqueIds = Array.from(new Set(wikidataIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const metadata: Record<string, WikidataLandmarkMetadata> = {};
  const batchSize = 50;

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);

    try {
      const data = await wikidataGet<any>({
        params: {
          action: 'wbgetentities',
          ids: batch.join('|'),
          props: 'sitelinks|claims',
          format: 'json',
          formatversion: 2,
        },
      });

      const entities = data?.entities;
      const entityEntries: Array<[string, WikidataEntityLike]> = Array.isArray(entities)
        ? entities
            .filter((entity: WikidataEntityLike | null | undefined): entity is WikidataEntityLike => Boolean(entity?.id))
            .map((entity) => [entity.id as string, entity])
        : Object.entries((entities ?? {}) as Record<string, WikidataEntityLike>);

      const labels = await fetchEntityLabels(
        entityEntries.flatMap(([, entity]) => extractClaimEntityIds(entity.claims, 'P31')),
        language
      );

      for (const wikidataId of batch) {
        const entity = entityEntries.find(([id]) => id === wikidataId)?.[1];
        if (!entity || entity.missing) {
          metadata[wikidataId] = { sitelinks: 0, instanceOfLabels: [] };
          continue;
        }

        metadata[wikidataId] = {
          sitelinks: Object.keys(entity.sitelinks ?? {}).length,
          instanceOfLabels: extractClaimEntityIds(entity.claims, 'P31').map((id) => labels[id] || id),
        };
      }
    } catch (error) {
      console.warn('[LandmarkTiering] Failed to fetch Wikidata landmark metadata batch:', batch, error);
      for (const wikidataId of batch) {
        metadata[wikidataId] = metadata[wikidataId] ?? { sitelinks: 0, instanceOfLabels: [] };
      }
    }
  }

  return metadata;
}

export async function fetchWikidataSitelinkCounts(wikidataIds: string[]): Promise<Record<string, number>> {
  const metadata = await fetchWikidataLandmarkMetadata(wikidataIds);
  return Object.fromEntries(Object.entries(metadata).map(([wikidataId, entry]) => [wikidataId, entry.sitelinks]));
}
