import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import { Theme } from '../../domain/poi/themeTags';
import { EditorialCandidateSource, resolveEditorialCityCenter } from './EditorialCandidate';
import {
  buildEditorialEntitiesV5,
  editorialDistanceMetersV5,
  EditorialEntityCandidateV5,
} from './EditorialEvidenceV5';
import { LandmarkTieredPoi, tierPoisByLandmarkFame } from './LandmarkTiering';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from './PoiEnrichmentSnapshot';

interface CorePoolFixtureV6 {
  geocode: { lat: number; lng: number };
  rawPois: RawPoi[];
  sitelinks: Record<string, number>;
  wikidataMetadata: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
}

export interface EditorialCoreInputContextV6 {
  city: string;
  cityKey: string;
  theme: Theme;
  language: string;
  durationMinutes: number;
}

export interface EditorialCoreInputV6 {
  entities: EditorialEntityCandidateV5[];
  readyEntities: EditorialEntityCandidateV5[];
  prefilteredCount: number;
  evidenceGaps: Array<{ canonicalId: string; name: string; missing: string[] }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function maximumCandidateDistance(durationMinutes: number): number {
  if (durationMinutes <= 120) return 3_500;
  if (durationMinutes <= 180) return 4_500;
  return 6_000;
}

function toSources(
  enriched: Awaited<ReturnType<typeof enrichShortlistedPois>>,
  tiered: LandmarkTieredPoi[]
): EditorialCandidateSource[] {
  return enriched.map((poi, index) => ({
    ...poi,
    fameScore: tiered[index]?.fameScore ?? 0,
    landmarkTier: tiered[index]?.landmarkTier,
  }));
}

function selectReadyCandidates(
  entities: EditorialEntityCandidateV5[],
  limit: number
): EditorialEntityCandidateV5[] {
  return [...entities].sort((left, right) => (
    (right.firstVisitScore ?? right.recognitionScore)
      - (left.firstVisitScore ?? left.recognitionScore)
    || right.recognitionScore - left.recognitionScore
    || right.fameScore - left.fameScore
    || left.canonicalId.localeCompare(right.canonicalId)
  )).slice(0, limit);
}

export async function loadEditorialCoreInputV6(
  context: EditorialCoreInputContextV6,
  fixturesDirectory: string
): Promise<EditorialCoreInputV6> {
  const slug = `${context.cityKey}-${context.theme}`;
  const poolPath = join(fixturesDirectory, 'pools', `${slug}.json`);
  const sourcePath = join(fixturesDirectory, 'sources', `${slug}-${context.language}.json`);
  if (!existsSync(poolPath) || !existsSync(sourcePath)) {
    throw new Error(`Missing frozen pool/source fixtures for ${slug}-${context.language}`);
  }
  const pool = readJson<CorePoolFixtureV6>(poolPath);
  const sourceSnapshot = readJson<PoiEnrichmentSnapshot>(sourcePath);
  const tiered = tierPoisByLandmarkFame(
    pool.rawPois, pool.sitelinks, context.theme, pool.wikidataMetadata
  );
  const cache = new SnapshotPoiEnrichmentCache(sourceSnapshot);
  const enriched = await enrichShortlistedPois(tiered, context.language, cache, 40);
  const sources = toSources(enriched, tiered);
  const cityCenter = resolveEditorialCityCenter(sources, pool.geocode) ?? pool.geocode;
  const entities = buildEditorialEntitiesV5(sources, context.language).filter((entity) => (
    editorialDistanceMetersV5(entity.coordinates, cityCenter)
      <= maximumCandidateDistance(context.durationMinutes)
  ));
  const readyEntities = selectReadyCandidates(
    entities.filter((entity) => entity.readiness.ready), 30
  );
  return {
    entities,
    readyEntities,
    prefilteredCount: Math.min(60, tiered.length),
    evidenceGaps: entities.filter((entity) => !entity.readiness.ready).map((entity) => ({
      canonicalId: entity.canonicalId,
      name: entity.localName,
      missing: entity.readiness.missing,
    })),
  };
}
