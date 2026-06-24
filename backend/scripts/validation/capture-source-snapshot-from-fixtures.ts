import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { enrichShortlistedPois } from '../../src/services/poi/PoiEnrichmentPipeline';
import {
  createEmptyPoiEnrichmentSnapshot,
  PoiEnrichmentSnapshot,
} from '../../src/services/poi/PoiEnrichmentSnapshot';
import { PoiEnrichmentCache } from '../../src/services/poi/PoiEnrichmentCache';
import { WikidataBatchEnrichment } from '../../src/infrastructure/enrichment/WikidataEnricher';
import { WikipediaEnrichment } from '../../src/infrastructure/enrichment/WikipediaEnricher';

interface PoolFixture {
  rawPois: RawPoi[];
}

interface CandidateFixture {
  city: string;
  theme: string;
  candidates: Array<{
    name: string;
    wikidataId: string | null;
  }>;
}

class SourceSnapshotRecorder implements PoiEnrichmentCache {
  constructor(private readonly snapshot: PoiEnrichmentSnapshot) {}

  async getWikidata(wikidataId: string, language: string): Promise<WikidataBatchEnrichment | null> {
    return language === this.snapshot.language ? this.snapshot.wikidata[wikidataId] ?? null : null;
  }

  async setWikidata(wikidataId: string, language: string, payload: WikidataBatchEnrichment): Promise<void> {
    if (language === this.snapshot.language) {
      this.snapshot.wikidata[wikidataId] = payload;
    }
  }

  async getWikipedia(osmWikipediaTag: string, language: string): Promise<WikipediaEnrichment | null> {
    return language === this.snapshot.language ? this.snapshot.wikipedia[osmWikipediaTag] ?? null : null;
  }

  async setWikipedia(osmWikipediaTag: string, language: string, payload: WikipediaEnrichment): Promise<void> {
    if (language === this.snapshot.language) {
      this.snapshot.wikipedia[osmWikipediaTag] = payload;
    }
  }

  toSnapshot(): PoiEnrichmentSnapshot {
    return this.snapshot;
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readOrCreateSnapshot(path: string, input: { city: string; theme: string; language: string }): PoiEnrichmentSnapshot {
  if (!existsSync(path)) {
    return createEmptyPoiEnrichmentSnapshot(input);
  }

  const snapshot = readJson<PoiEnrichmentSnapshot>(path);
  if (snapshot.city !== input.city || snapshot.theme !== input.theme || snapshot.language !== input.language) {
    throw new Error(`Existing snapshot ${path} does not match ${input.city}/${input.theme}/${input.language}`);
  }
  return snapshot;
}

async function main(): Promise<void> {
  const city = process.argv[2] || 'Madrid';
  const theme = process.argv[3] || 'history';
  const language = process.argv[4] || 'es';
  const slug = `${city.toLowerCase()}-${theme}`;
  const fixtures = join(__dirname, '..', '..', 'fixtures');

  const pool = readJson<PoolFixture>(join(fixtures, 'pools', `${slug}.json`));
  const candidateFixture = readJson<CandidateFixture>(join(fixtures, 'candidates', `${slug}.json`));
  const output = join(fixtures, 'sources', `${slug}-${language}.json`);
  const snapshot = readOrCreateSnapshot(output, { city: candidateFixture.city || city, theme, language });
  const recorder = new SourceSnapshotRecorder(snapshot);

  const rawByQid = new Map(
    pool.rawPois
      .filter((poi) => poi.tags.wikidata)
      .map((poi) => [poi.tags.wikidata as string, poi])
  );
  const candidatePois = candidateFixture.candidates.flatMap((candidate) => {
    if (!candidate.wikidataId) return [];
    const poi = rawByQid.get(candidate.wikidataId);
    if (!poi) {
      throw new Error(`Candidate ${candidate.name} (${candidate.wikidataId}) is missing from raw pool`);
    }
    return [poi];
  });

  console.log(`Capturing source snapshot for ${city}/${theme}/${language} from ${candidatePois.length} candidates...`);
  await enrichShortlistedPois(candidatePois, language, recorder, 4);

  mkdirSync(join(fixtures, 'sources'), { recursive: true });
  writeFileSync(output, JSON.stringify(recorder.toSnapshot(), null, 2));
  console.log(
    `Wrote ${output} (${Object.keys(snapshot.wikidata).length} Wikidata, `
    + `${Object.keys(snapshot.wikipedia).length} Wikipedia).`
  );
}

main().catch((error) => {
  console.error('[capture-source-snapshot-from-fixtures] failed:', error);
  process.exit(1);
});
