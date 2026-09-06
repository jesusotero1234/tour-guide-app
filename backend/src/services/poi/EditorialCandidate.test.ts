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

  describe('resolveEditorialCityCenter', () => {
    it('preserves a valid geocoded center even when remote high-fame POIs dominate', () => {
      const origins = [
        { lat: 40.416775, lng: -3.70379 },
        { lat: -33.45, lng: 150.27 },
      ];

      for (const origin of origins) {
        const nearby = [
          source({ osmId: 1, lat: origin.lat + 0.001, lng: origin.lng + 0.001, fameScore: 10 }),
          source({ osmId: 2, lat: origin.lat - 0.001, lng: origin.lng - 0.001, fameScore: 12 }),
        ];
        const remote = Array.from({ length: 12 }, (_, index) => source({
          osmId: 100 + index,
          lat: origin.lat + 0.04,
          lng: origin.lng + 0.04,
          fameScore: 90 + index,
        }));

        const all = [...nearby, ...remote];
        const shuffled = [...all].reverse();

        expect(resolveEditorialCityCenter(all, origin)).toEqual(origin);
        expect(resolveEditorialCityCenter(shuffled, origin)).toEqual(origin);
      }
    });

    it('handles edge cases for geocoded centers and source coordinates', () => {
      const validCenter = { lat: 0, lng: 0 };
      const validSource = source({ osmId: 1, lat: 10, lng: 20, fameScore: 50 });
      const invalidSource = source({ osmId: 2, lat: NaN, lng: 20, fameScore: 60 });
      const outOfRangeSource = source({ osmId: 3, lat: 91, lng: 20, fameScore: 70 });

      expect(resolveEditorialCityCenter([], validCenter)).toEqual(validCenter);
      expect(resolveEditorialCityCenter([validSource], undefined)).toEqual({ lat: 10, lng: 20 });
      expect(resolveEditorialCityCenter([validSource, invalidSource, outOfRangeSource], undefined)).toEqual({ lat: 10, lng: 20 });
      expect(resolveEditorialCityCenter([invalidSource, outOfRangeSource], undefined)).toBeUndefined();

      const invalidCenters: Array<{ lat: number; lng: number }> = [
        { lat: NaN, lng: 0 },
        { lat: Infinity, lng: 0 },
        { lat: 91, lng: 0 },
        { lat: 0, lng: 181 },
        { lat: 0, lng: NaN },
        { lat: 0, lng: Infinity },
        { lat: -91, lng: 0 },
        { lat: 0, lng: -181 },
      ];
      expect(resolveEditorialCityCenter([])).toBeUndefined();
      for (const center of invalidCenters) {
        const unusableSource = source({ ...center, fameScore: 100 });
        expect(resolveEditorialCityCenter([validSource], center)).toEqual({ lat: 10, lng: 20 });
        expect(resolveEditorialCityCenter([validSource, unusableSource])).toEqual({ lat: 10, lng: 20 });
        expect(resolveEditorialCityCenter([unusableSource], center)).toBeUndefined();
        expect(resolveEditorialCityCenter([], center)).toBeUndefined();
      }
    });

    it('computes median of top-20 valid sources when no geocoded center is available', () => {
      const sources = Array.from({ length: 21 }, (_, index) => source({
        osmId: index + 1,
        lat: 10 + index,
        lng: 20 + index,
        fameScore: index,
      }));
      const invalidHighFame = source({
        osmId: 999,
        lat: NaN,
        lng: 20,
        fameScore: 100,
      });

      expect(resolveEditorialCityCenter(sources, undefined)).toEqual({ lat: 21, lng: 31 });
      expect(resolveEditorialCityCenter([...sources, invalidHighFame], undefined)).toEqual({ lat: 21, lng: 31 });
    });

    it('falls back to median when geocoded center is a remote municipal centroid with no local support', () => {
      const centroid = { lat: 40.4, lng: -3.7 };
      const farPois = Array.from({ length: 25 }, (_, index) => source({
        osmId: index + 1,
        lat: 40.44,
        lng: -3.66,
        fameScore: 50 + index,
      }));

      expect(resolveEditorialCityCenter(farPois, centroid)).toEqual({ lat: 40.44, lng: -3.66 });
    });

    it('preserves geocoded center when one low-fame POI is within local corroboration radius despite far high-fame POIs', () => {
      const centroid = { lat: 40.4, lng: -3.7 };
      const nearbyLowFame = source({
        osmId: 1,
        lat: 40.4005,
        lng: -3.6995,
        fameScore: 5,
      });
      const farHighFame = Array.from({ length: 24 }, (_, index) => source({
        osmId: index + 2,
        lat: 40.44,
        lng: -3.66,
        fameScore: 80 + index,
      }));

      expect(resolveEditorialCityCenter([nearbyLowFame, ...farHighFame], centroid)).toEqual(centroid);
    });

    it('preserves geocoded center when POIs are near the median but not within local corroboration radius', () => {
      const centroid = { lat: 40.4, lng: -3.7 };
      const pois = Array.from({ length: 10 }, (_, index) => source({
        osmId: index + 1,
        lat: 40.415,
        lng: -3.685,
        fameScore: 30 + index,
      }));

      expect(resolveEditorialCityCenter(pois, centroid)).toEqual(centroid);
    });
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
