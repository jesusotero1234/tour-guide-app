import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { Theme } from '../../src/domain/poi/themeTags';
import { geocodeCity } from '../../src/infrastructure/geocoder/NominatimGeocoder';
import { fetchPoisForTheme } from '../../src/infrastructure/poi/OverpassPoiFetcher';
import { PoiEnrichmentCache } from '../../src/services/poi/PoiEnrichmentCache';
import { enrichShortlistedPois } from '../../src/services/poi/PoiEnrichmentPipeline';
import {
  createEmptyPoiEnrichmentSnapshot,
  PoiEnrichmentSnapshot,
  SnapshotPoiEnrichmentCache,
} from '../../src/services/poi/PoiEnrichmentSnapshot';
import {
  fetchWikidataLandmarkMetadata,
  tierPoisByLandmarkFame,
} from '../../src/services/poi/LandmarkTiering';

interface ManifestCase {
  id: string;
  scope: 'calibration' | 'holdout';
  city: string;
  theme: Theme;
  language: string;
}

interface EvaluationManifest {
  schemaVersion: 'route-editorial-evaluation-v2';
  cases: ManifestCase[];
}

class NetworkRecordingCache implements PoiEnrichmentCache {
  private readonly cache: SnapshotPoiEnrichmentCache;

  constructor(private readonly snapshot: PoiEnrichmentSnapshot) {
    this.cache = new SnapshotPoiEnrichmentCache(snapshot);
  }

  getWikidata(id: string, language: string) {
    return this.cache.getWikidata(id, language);
  }

  setWikidata(id: string, language: string, payload: Parameters<PoiEnrichmentCache['setWikidata']>[2]) {
    return this.cache.setWikidata(id, language, payload);
  }

  getWikipedia(tag: string, language: string) {
    return this.cache.getWikipedia(tag, language);
  }

  setWikipedia(tag: string, language: string, payload: Parameters<PoiEnrichmentCache['setWikipedia']>[2]) {
    return this.cache.setWikipedia(tag, language, payload);
  }

  toSnapshot(): PoiEnrichmentSnapshot {
    return this.snapshot;
  }
}

function argumentValue(flag: string): string | undefined {
  const exact = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--holdout-data-only')) {
    throw new Error('Holdout source capture requires --holdout-data-only');
  }
  const caseId = argumentValue('--case') ?? 'segovia-history-es-120';
  const fixtures = join(__dirname, '..', '..', 'fixtures');
  const manifest = readJson<EvaluationManifest>(join(fixtures, 'oracle', 'editorial-v2-manifest.json'));
  const evaluationCase = manifest.cases.find((item) => item.id === caseId);
  if (!evaluationCase || evaluationCase.scope !== 'holdout') {
    throw new Error(`Source capture only accepts a declared holdout case, received ${caseId}`);
  }

  const capturedAt = new Date().toISOString();
  const geocoded = await geocodeCity(evaluationCase.city);
  const rawPois: RawPoi[] = await fetchPoisForTheme(geocoded, evaluationCase.theme);
  if (rawPois.length === 0) throw new Error(`No POIs captured for ${evaluationCase.city}`);

  const wikidataMetadata = await fetchWikidataLandmarkMetadata(
    rawPois.map((poi) => poi.tags.wikidata).filter((id): id is string => Boolean(id))
  );
  const sitelinks = Object.fromEntries(Object.entries(wikidataMetadata)
    .map(([id, metadata]) => [id, metadata.sitelinks]));
  const ids = rawPois.map((poi) => poi.tags.wikidata).filter((id): id is string => Boolean(id));
  const coveredIds = new Set(Object.keys(wikidataMetadata));
  const metadataCoverage = ids.length === 0 ? 1 : ids.filter((id) => coveredIds.has(id)).length / ids.length;
  if (metadataCoverage < 0.5) {
    throw new Error(`Wikidata metadata coverage ${Math.round(metadataCoverage * 100)}% is too low`);
  }

  const tiered = tierPoisByLandmarkFame(rawPois, sitelinks, evaluationCase.theme, wikidataMetadata);
  const captureSet = tiered.slice(0, 60);
  const recordingCache = new NetworkRecordingCache(createEmptyPoiEnrichmentSnapshot({
    city: evaluationCase.city,
    theme: evaluationCase.theme,
    language: evaluationCase.language,
    capturedAt,
  }));
  console.log(`[editorial-v4] capturing evidence for ${captureSet.length}/${rawPois.length} POIs; no selector will run`);
  await enrichShortlistedPois(captureSet, evaluationCase.language, recordingCache, 4);

  const slug = `${evaluationCase.city.toLowerCase()}-${evaluationCase.theme}`;
  const poolPath = join(fixtures, 'pools', `${slug}.json`);
  const sourcePath = join(fixtures, 'sources', `${slug}-${evaluationCase.language}.json`);
  mkdirSync(dirname(poolPath), { recursive: true });
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(poolPath, `${JSON.stringify({
    city: evaluationCase.city,
    theme: evaluationCase.theme,
    capturedAt: capturedAt.slice(0, 10),
    geocode: { lat: geocoded.lat, lng: geocoded.lng, boundingBox: geocoded.boundingBox },
    rawPois,
    sitelinks,
    wikidataMetadata,
  }, null, 2)}\n`);
  writeFileSync(sourcePath, `${JSON.stringify(recordingCache.toSnapshot(), null, 2)}\n`);
  console.log(`[editorial-v4] wrote holdout pool/source only: ${poolPath}, ${sourcePath}`);
}

main().catch((error) => {
  console.error('[capture-editorial-holdout-sources-v4] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
