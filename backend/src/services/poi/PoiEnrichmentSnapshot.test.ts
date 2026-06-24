import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import { enrichFromWikidataBatch } from '../../infrastructure/enrichment/WikidataEnricher';
import { enrichFromWikipedia } from '../../infrastructure/enrichment/WikipediaEnricher';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import {
  RecordingPoiEnrichmentCache,
  SnapshotPoiEnrichmentCache,
  createEmptyPoiEnrichmentSnapshot,
  PoiEnrichmentSnapshot,
} from './PoiEnrichmentSnapshot';
import { PoiEnrichmentCache } from './PoiEnrichmentCache';

jest.mock('../../infrastructure/enrichment/WikidataEnricher', () => ({
  enrichFromWikidataBatch: jest.fn(),
}));
jest.mock('../../infrastructure/enrichment/WikipediaEnricher', () => ({
  enrichFromWikipedia: jest.fn(),
}));

const mockedWikidata = jest.mocked(enrichFromWikidataBatch);
const mockedWikipedia = jest.mocked(enrichFromWikipedia);

const poi: RawPoi = {
  osmType: 'node',
  osmId: 1,
  name: 'Museo del Prado',
  lat: 40.4138,
  lng: -3.6921,
  tags: {
    name: 'Museo del Prado',
    wikidata: 'Q160112',
    wikipedia: 'es:Museo del Prado',
    tourism: 'museum',
  },
};

describe('POI enrichment snapshots', () => {
  beforeEach(() => {
    mockedWikidata.mockReset();
    mockedWikipedia.mockReset();
  });

  it('replays captured Wikipedia and Wikidata without external enrichment calls', async () => {
    const snapshot = createEmptyPoiEnrichmentSnapshot({
      city: 'Madrid',
      theme: 'history',
      language: 'es',
      capturedAt: '2026-06-22T00:00:00.000Z',
    });
    snapshot.wikidata.Q160112 = {
      wikidataId: 'Q160112',
      wikidataUrl: 'https://www.wikidata.org/wiki/Q160112',
      nameTranslations: { es: 'Museo del Prado' },
      wikidataClaims: { inception: '1819' },
    };
    snapshot.wikipedia['es:Museo del Prado'] = {
      description: 'El Museo del Prado es un museo nacional español.',
      body: 'El edificio abrió al público en 1819.',
      language: 'es',
      wikipediaUrl: 'https://es.wikipedia.org/wiki/Museo_del_Prado',
    };

    const result = await enrichShortlistedPois(
      [poi],
      'es',
      new SnapshotPoiEnrichmentCache(snapshot)
    );

    expect(mockedWikidata).not.toHaveBeenCalled();
    expect(mockedWikipedia).not.toHaveBeenCalled();
    expect(result[0].enriched.wikipediaBody).toBe('El edificio abrió al público en 1819.');
    expect(result[0].enriched.wikidataClaims).toEqual({ inception: '1819' });
  });

  it('treats absent entries as captured misses instead of calling external services', async () => {
    const snapshot = createEmptyPoiEnrichmentSnapshot({
      city: 'Madrid',
      theme: 'history',
      language: 'es',
    });

    const result = await enrichShortlistedPois(
      [poi],
      'es',
      new SnapshotPoiEnrichmentCache(snapshot)
    );

    expect(mockedWikidata).not.toHaveBeenCalled();
    expect(mockedWikipedia).not.toHaveBeenCalled();
    expect(result[0].enriched.wikipediaBody).toBeNull();
    expect(result[0].enriched.wikidataClaims).toBeNull();
  });

  it('records cache hits so they are available for later replay', async () => {
    const inner: PoiEnrichmentCache = {
      getWikidata: jest.fn(async () => ({
        wikidataId: 'Q160112',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q160112',
        nameTranslations: { es: 'Museo del Prado' },
        wikidataClaims: { inception: '1819' },
      })),
      setWikidata: jest.fn(async () => undefined),
      getWikipedia: jest.fn(async () => ({
        description: 'Museo nacional español.',
        body: 'Contenido capturado.',
        language: 'es',
        wikipediaUrl: 'https://es.wikipedia.org/wiki/Museo_del_Prado',
      })),
      setWikipedia: jest.fn(async () => undefined),
    };
    const recorder = new RecordingPoiEnrichmentCache(
      inner,
      createEmptyPoiEnrichmentSnapshot({ city: 'Madrid', theme: 'history', language: 'es' })
    );

    await recorder.getWikidata('Q160112', 'es');
    await recorder.getWikipedia('es:Museo del Prado', 'es');

    expect(recorder.toSnapshot().wikidata.Q160112.wikidataClaims).toEqual({ inception: '1819' });
    expect(recorder.toSnapshot().wikipedia['es:Museo del Prado'].body).toBe('Contenido capturado.');
  });

  it('replays the real Barcelona shortlist snapshot with zero external calls', async () => {
    const fixtures = join(__dirname, '..', '..', '..', 'fixtures');
    const snapshot = JSON.parse(
      readFileSync(join(fixtures, 'sources', 'barcelona-history-fr.json'), 'utf8')
    ) as PoiEnrichmentSnapshot;
    const pool = JSON.parse(
      readFileSync(join(fixtures, 'pools', 'barcelona-history.json'), 'utf8')
    ) as { rawPois: RawPoi[] };
    const capturedPois = pool.rawPois.filter((candidate) => (
      Boolean(candidate.tags.wikidata && snapshot.wikidata[candidate.tags.wikidata])
      && Boolean(candidate.tags.wikipedia && snapshot.wikipedia[candidate.tags.wikipedia])
    ));

    const result = await enrichShortlistedPois(
      capturedPois,
      'fr',
      new SnapshotPoiEnrichmentCache(snapshot)
    );

    expect(capturedPois).toHaveLength(40);
    expect(result).toHaveLength(40);
    expect(result.every((candidate) => Boolean(candidate.enriched.wikipediaBody))).toBe(true);
    expect(result.every((candidate) => Boolean(candidate.enriched.wikidataClaims))).toBe(true);
    expect(mockedWikidata).not.toHaveBeenCalled();
    expect(mockedWikipedia).not.toHaveBeenCalled();
  });
});
