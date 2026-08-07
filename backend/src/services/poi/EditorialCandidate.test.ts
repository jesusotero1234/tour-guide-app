import { readFileSync } from 'fs';
import { join } from 'path';
import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { RawPoi } from '../../domain/poi/RawPoi';
import { LandmarkTieredPoi, tierPoisByLandmarkFame } from './LandmarkTiering';
import { SnapshotPoiEnrichmentCache, PoiEnrichmentSnapshot } from './PoiEnrichmentSnapshot';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import {
  buildEditorialCandidateSet,
  EditorialCandidateSource,
  resolveEditorialCityCenter,
} from './EditorialCandidate';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

function source(overrides: Partial<EditorialCandidateSource> = {}): EditorialCandidateSource {
  return {
    osmType: 'node',
    osmId: 1,
    name: 'Historic Gate',
    lat: 40.4,
    lng: -3.7,
    tags: {
      name: 'Historic Gate',
      wikidata: 'Q1',
      historic: 'city_gate',
      building: 'gate',
      material: 'stone',
    },
    enriched: {
      nameTranslations: {},
      description: 'The stone gate has three visible arches and a carved central coat of arms.',
      wikipediaLead: 'The stone gate has three visible arches and a carved central coat of arms.',
      wikipediaBody: 'The stone gate has three visible arches and a carved central coat of arms. It opened in 1778 for travellers entering the city.',
      wikidataClaims: {
        inception: '1778',
        architect: 'Example Architect',
      },
      osmTags: {},
      wikivoyage: null,
      descriptionLanguage: 'en',
      attribution: {},
    },
    fameScore: 28,
    landmarkTier: 'flagship',
    score: 50,
    ...overrides,
  };
}

describe('EditorialCandidate', () => {
  it('rejects a canonical place before route selection when usable evidence is insufficient', () => {
    const sparse = source({
      name: 'Sparse Place',
      enriched: {
        ...source().enriched,
        description: null,
        wikipediaLead: null,
        wikipediaBody: null,
        wikidataClaims: { locatedIn: 'Madrid' },
      },
      tags: { name: 'Sparse Place', wikidata: 'Q2' },
    });

    const result = buildEditorialCandidateSet([sparse], { theme: 'history', language: 'es' });

    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ localName: 'Sparse Place', reason: 'insufficient_evidence' }),
    ]);
  });

  it('clusters nearby representations of the same named ensemble', () => {
    const plaza = source({
      osmId: 10,
      name: 'Plaza de Cibeles',
      lat: 40.41917,
      lng: -3.69306,
      tags: { name: 'Plaza de Cibeles', wikidata: 'Q1537446', place: 'square' },
      fameScore: 28,
    });
    const palace = source({
      osmId: 11,
      name: 'Palacio de Cibeles',
      lat: 40.418611,
      lng: -3.691667,
      tags: { name: 'Palacio de Cibeles', wikidata: 'Q1849031', historic: 'palace', building: 'palace' },
      fameScore: 23,
    });

    const result = buildEditorialCandidateSet([plaza, palace], { theme: 'history', language: 'es' });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      canonicalId: 'Q1537446',
      localName: 'Plaza de Cibeles',
      memberCanonicalIds: ['Q1537446', 'Q1849031'],
    }));
  });

  it('accepts visible pedestrian-street evidence from OSM', () => {
    const pedestrianStreet = source({
      name: 'Historic Pedestrian Street',
      tags: {
        name: 'Historic Pedestrian Street',
        wikidata: 'Q3',
        highway: 'pedestrian',
        surface: 'paving_stones',
        tourism: 'attraction',
      },
      enriched: {
        ...source().enriched,
        wikipediaBody: 'The street opened in 1891 as part of a major urban renewal. It connects the old centre to the port.',
        wikidataClaims: {
          inception: '1891',
          namedAfter: 'Example Person',
        },
      },
    });

    const result = buildEditorialCandidateSet([pedestrianStreet], { theme: 'history', language: 'en' });

    expect(result.rejected).toEqual([]);
    expect(result.candidates[0].evidenceFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'highway: pedestrian', observable: true }),
      expect.objectContaining({ value: 'surface: paving_stones', observable: true }),
    ]));
  });

  it('preserves a strong main archaeological site as essential on long tours', () => {
    const archaeologicalSite = source({
      name: 'Ancient Theatre',
      tags: {
        name: 'Ancient Theatre',
        wikidata: 'Q4',
        historic: 'archaeological_site',
        tourism: 'attraction',
        material: 'stone',
      },
      fameScore: 22,
      landmarkTier: 'major',
    });

    const result = buildEditorialCandidateSet([archaeologicalSite], {
      theme: 'history',
      language: 'en',
      requestedDuration: 120,
    });

    expect(result.candidates[0]).toEqual(expect.objectContaining({ tier: 'essential' }));
  });

  it('does not promote weak candidates merely to force four deterministic essentials', () => {
    const weakCandidates = Array.from({ length: 5 }, (_, index) => source({
      osmId: index + 10,
      name: `Minor Building ${index + 1}`,
      lat: 40.4 + (index * 0.003),
      tags: {
        name: `Minor Building ${index + 1}`,
        wikidata: `Q${index + 10}`,
        building: 'yes',
        material: 'stone',
      },
      fameScore: 0,
      landmarkTier: 'filler',
    }));

    const result = buildEditorialCandidateSet(weakCandidates, {
      theme: 'history',
      language: 'en',
      requestedDuration: 120,
    });

    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.filter((candidate) => candidate.tier === 'essential')).toHaveLength(0);
  });

  it('surfaces the complete Madrid calibration core from frozen sources without using the oracle as input', async () => {
    const pool = JSON.parse(readFileSync(join(FIXTURES, 'pools', 'madrid-history.json'), 'utf8')) as {
      rawPois: RawPoi[];
      sitelinks: Record<string, number>;
      wikidataMetadata: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
    };
    const snapshot = JSON.parse(
      readFileSync(join(FIXTURES, 'sources', 'madrid-history-es.json'), 'utf8')
    ) as PoiEnrichmentSnapshot;
    const oracle = JSON.parse(
      readFileSync(join(FIXTURES, 'oracle', 'madrid-history-es-120.json'), 'utf8')
    ) as { stops: Array<{ qid: string; name: string }> };
    const tiered = tierPoisByLandmarkFame(
      pool.rawPois,
      pool.sitelinks,
      'history',
      pool.wikidataMetadata
    ).slice(0, 60);
    const enriched = await enrichShortlistedPois(
      tiered,
      'es',
      new SnapshotPoiEnrichmentCache(snapshot),
      20
    );
    const candidateSources = enriched.map((poi: EnrichedPoi, index) => ({
      ...poi,
      fameScore: (tiered[index] as LandmarkTieredPoi).fameScore,
      landmarkTier: (tiered[index] as LandmarkTieredPoi).landmarkTier,
    }));

    const result = buildEditorialCandidateSet(candidateSources, {
      theme: 'history',
      language: 'es',
      requestedDuration: 120,
      cityCenter: resolveEditorialCityCenter(candidateSources, { lat: 40.416775, lng: -3.70379 }),
      maxDistanceFromCenterMeters: 3500,
    });
    const surfacedIds = new Set(result.candidates.flatMap((candidate) => candidate.memberCanonicalIds));
    const missing = oracle.stops.filter((anchor) => !surfacedIds.has(anchor.qid));

    expect(missing).toEqual([]);
    expect(result.candidates.every((candidate) => candidate.evidenceFacts.length >= 4)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.evidenceFacts.some((fact) => fact.observable))).toBe(true);
  });
});
