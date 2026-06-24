import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { rankPois } from './PoiRanker';

function buildPoi(overrides: Partial<EnrichedPoi>): EnrichedPoi {
  return {
    osmType: 'node',
    osmId: 1,
    name: 'POI',
    lat: 40.4168,
    lng: -3.7038,
    tags: {},
    enriched: {
      nameTranslations: {},
      description: null,
      wikipediaLead: null,
      wikipediaBody: null,
      wikidataClaims: null,
      osmTags: {},
      wikivoyage: null,
      descriptionLanguage: null,
      attribution: {},
    },
    ...overrides,
  };
}

function getCategoryShare(pois: Array<{ tags: EnrichedPoi['tags'] }>, category: string): number {
  if (pois.length === 0) {
    return 0;
  }

  const matching = pois.filter((poi) => poi.tags.historic === category).length;
  return matching / pois.length;
}

describe('rankPois', () => {
  it('returns POIs sorted by descending score', () => {
    const plaza = buildPoi({
      osmId: 1,
      name: 'Plaza Mayor',
      tags: {
        place: 'square',
        tourism: 'attraction',
        wikidata: 'Q123',
        wikipedia: 'es:Plaza_Mayor',
      },
      enriched: {
        nameTranslations: { en: 'Main Square' },
        description: 'Historic square',
        wikipediaLead: 'Historic square',
        wikipediaBody: 'x'.repeat(2200),
        wikidataClaims: { inception: '1619', heritageDesignation: 'Monument' },
        osmTags: {},
        wikivoyage: null,
        descriptionLanguage: 'es',
        attribution: {},
      },
    });

    const memorial = buildPoi({
      osmId: 2,
      name: 'Minor Memorial',
      tags: {
        historic: 'memorial',
        tourism: 'artwork',
        wikidata: 'Q999',
      },
      enriched: {
        nameTranslations: {},
        description: null,
        wikipediaLead: null,
        wikipediaBody: null,
        wikidataClaims: null,
        osmTags: {},
        wikivoyage: null,
        descriptionLanguage: null,
        attribution: {},
      },
    });

    const ranked = rankPois([memorial, plaza], 40.4168, -3.7038);

    expect(ranked.map((poi) => poi.name)).toEqual(['Plaza Mayor', 'Minor Memorial']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('keeps finite scores when enrichment fields are missing', () => {
    const sparse = buildPoi({
      osmId: 3,
      name: 'Sparse POI',
      tags: {
        tourism: 'museum',
      },
    });

    const ranked = rankPois([sparse], 40.4168, -3.7038);

    expect(ranked).toHaveLength(1);
    expect(Number.isFinite(ranked[0].score)).toBe(true);
  });

  it('does not let centroid distance bury a flagship landmark', () => {
    const flagship = {
      ...buildPoi({
        osmId: 4,
        name: 'Palacio Real',
        lat: 40.4179,
        lng: -3.7143,
        tags: {
          wikidata: 'Q4',
          wikipedia: 'es:Palacio_Real_de_Madrid',
          tourism: 'attraction',
          building: 'palace',
        },
        enriched: {
          nameTranslations: { en: 'Royal Palace of Madrid' },
          description: 'Major royal palace',
          wikipediaLead: 'Major royal palace',
          wikipediaBody: 'x'.repeat(2200),
          wikidataClaims: { inception: '1738', heritageDesignation: 'Monument' },
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'es',
          attribution: {},
        },
      }),
      fameScore: 16,
      landmarkTier: 'flagship' as const,
      fame: { sitelinks: 45 },
    };

    const centralSecondary = {
      ...buildPoi({
        osmId: 5,
        name: 'Secondary Central Building',
        lat: 40.4168,
        lng: -3.7038,
        tags: {
          wikidata: 'Q5',
          wikipedia: 'es:Secondary_Central_Building',
          building: 'yes',
        },
        enriched: {
          nameTranslations: { en: 'Secondary Central Building' },
          description: 'Documented central building',
          wikipediaLead: 'Documented central building',
          wikipediaBody: 'x'.repeat(2200),
          wikidataClaims: { architect: 'Architect' },
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'es',
          attribution: {},
        },
      }),
      fameScore: 5,
      landmarkTier: 'supporting' as const,
      fame: { sitelinks: 6 },
    };

    const ranked = rankPois([centralSecondary, flagship], 40.4168, -3.7038);

    expect(ranked.map((poi) => poi.name)).toEqual(['Palacio Real', 'Secondary Central Building']);
  });

  it('prefers lived history sites over museum containers for history tours', () => {
    const famousMuseum = {
      ...buildPoi({
        osmId: 6,
        name: 'National History Museum',
        tags: {
          tourism: 'museum',
          wikidata: 'Q6',
          wikipedia: 'en:National_History_Museum',
        },
        enriched: {
          nameTranslations: { en: 'National History Museum' },
          description: 'Large museum collection',
          wikipediaLead: 'Large museum collection',
          wikipediaBody: 'x'.repeat(2500),
          wikidataClaims: { inception: '1900', heritageDesignation: 'Monument' },
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'en',
          attribution: {},
        },
      }),
      fameScore: 18,
      landmarkTier: 'flagship' as const,
      fame: { sitelinks: 80 },
    };

    const parliamentSite = {
      ...buildPoi({
        osmId: 7,
        name: 'Old Parliament Gate',
        tags: {
          tourism: 'attraction',
          building: 'government',
          wikidata: 'Q7',
          wikipedia: 'en:Old_Parliament_Gate',
          'canonical:instance_of': 'government building|parliament building',
        },
        enriched: {
          nameTranslations: { en: 'Old Parliament Gate' },
          description: 'Site of public political events',
          wikipediaLead: 'Site of public political events',
          wikipediaBody: 'x'.repeat(1200),
          wikidataClaims: { inception: '1850' },
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'en',
          attribution: {},
        },
      }),
      fameScore: 13,
      landmarkTier: 'major' as const,
      fame: { sitelinks: 35 },
    };

    const ranked = rankPois([famousMuseum, parliamentSite], 40.4168, -3.7038, 'history');

    expect(ranked.map((poi) => poi.name)).toEqual(['Old Parliament Gate', 'National History Museum']);
  });

  it('breaks synthetic memorial monopoly when viable alternatives exist', () => {
    const memorials = Array.from({ length: 10 }, (_, index) => ({
      ...buildPoi({
        osmId: 100 + index,
        name: `Memorial ${index + 1}`,
        tags: {
          historic: 'memorial',
          tourism: 'attraction',
          wikidata: `QM${index + 1}`,
          wikipedia: `en:Memorial_${index + 1}`,
        },
        enriched: {
          nameTranslations: { en: `Memorial ${index + 1}` },
          description: 'Documented memorial landmark',
          wikipediaLead: 'Documented memorial landmark',
          wikipediaBody: 'x'.repeat(1800),
          wikidataClaims: { inception: '1900', heritageDesignation: 'Monument' },
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'en',
          attribution: {},
        },
      }),
      fameScore: 11.8 - (index * 0.1),
      landmarkTier: 'major' as const,
      fame: { sitelinks: 18 - index },
    }));

    const alternatives = [
      {
        ...buildPoi({
          osmId: 201,
          name: 'Grand Square',
          tags: { place: 'square', tourism: 'attraction', wikidata: 'QA1', wikipedia: 'en:Grand_Square' },
          enriched: {
            nameTranslations: { en: 'Grand Square' },
            description: 'Historic civic square',
            wikipediaLead: 'Historic civic square',
            wikipediaBody: 'x'.repeat(1800),
            wikidataClaims: { inception: '1700', heritageDesignation: 'Monument' },
            osmTags: {},
            wikivoyage: null,
            descriptionLanguage: 'en',
            attribution: {},
          },
        }),
        fameScore: 7.9,
        landmarkTier: 'major' as const,
        fame: { sitelinks: 16 },
      },
      {
        ...buildPoi({
          osmId: 202,
          name: 'Central Market',
          tags: { amenity: 'marketplace', wikidata: 'QA2', wikipedia: 'en:Central_Market' },
          enriched: {
            nameTranslations: { en: 'Central Market' },
            description: 'Historic covered market',
            wikipediaLead: 'Historic covered market',
            wikipediaBody: 'x'.repeat(1700),
            wikidataClaims: { inception: '1880', architect: 'Architect' },
            osmTags: {},
            wikivoyage: null,
            descriptionLanguage: 'en',
            attribution: {},
          },
        }),
        fameScore: 7.6,
        landmarkTier: 'major' as const,
        fame: { sitelinks: 14 },
      },
      {
        ...buildPoi({
          osmId: 203,
          name: 'Old Cathedral',
          tags: { building: 'cathedral', heritage: 'yes', wikidata: 'QA3', wikipedia: 'en:Old_Cathedral' },
          enriched: {
            nameTranslations: { en: 'Old Cathedral' },
            description: 'Historic cathedral landmark',
            wikipediaLead: 'Historic cathedral landmark',
            wikipediaBody: 'x'.repeat(1650),
            wikidataClaims: { inception: '1600', heritageDesignation: 'Monument' },
            osmTags: {},
            wikivoyage: null,
            descriptionLanguage: 'en',
            attribution: {},
          },
        }),
        fameScore: 7.5,
        landmarkTier: 'major' as const,
        fame: { sitelinks: 13 },
      },
      {
        ...buildPoi({
          osmId: 204,
          name: 'City Museum',
          tags: { tourism: 'museum', wikidata: 'QA4', wikipedia: 'en:City_Museum' },
          enriched: {
            nameTranslations: { en: 'City Museum' },
            description: 'Museum with strong local significance',
            wikipediaLead: 'Museum with strong local significance',
            wikipediaBody: 'x'.repeat(1600),
            wikidataClaims: { architect: 'Architect', architecturalStyle: 'Style' },
            osmTags: {},
            wikivoyage: null,
            descriptionLanguage: 'en',
            attribution: {},
          },
        }),
        fameScore: 7.3,
        landmarkTier: 'major' as const,
        fame: { sitelinks: 12 },
      },
      {
        ...buildPoi({
          osmId: 205,
          name: 'Royal Residence',
          tags: { building: 'palace', tourism: 'attraction', wikidata: 'QA5', wikipedia: 'en:Royal_Residence' },
          enriched: {
            nameTranslations: { en: 'Royal Residence' },
            description: 'Palace with strong historical interest',
            wikipediaLead: 'Palace with strong historical interest',
            wikipediaBody: 'x'.repeat(1600),
            wikidataClaims: { inception: '1750', heritageDesignation: 'Monument' },
            osmTags: {},
            wikivoyage: null,
            descriptionLanguage: 'en',
            attribution: {},
          },
        }),
        fameScore: 7.2,
        landmarkTier: 'major' as const,
        fame: { sitelinks: 12 },
      },
    ];

    const ranked = rankPois([...memorials, ...alternatives], 0, 0);
    const naiveTopTen = [...ranked].sort((a, b) => b.score - a.score).slice(0, 10);
    const diverseTopTen = ranked.slice(0, 10);

    expect(getCategoryShare(naiveTopTen, 'memorial')).toBeGreaterThan(0.7);
    expect(getCategoryShare(diverseTopTen, 'memorial')).toBeLessThanOrEqual(0.7);
    expect(diverseTopTen.filter((poi) => poi.tags.historic !== 'memorial').length).toBeGreaterThanOrEqual(3);
  });
});
