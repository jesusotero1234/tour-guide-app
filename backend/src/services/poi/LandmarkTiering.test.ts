import { RawPoi } from '../../domain/poi/RawPoi';
import { assignLandmarkTier, scoreLandmarkFame, tierPoisByLandmarkFame } from './LandmarkTiering';

function buildPoi(overrides: Partial<RawPoi>): RawPoi {
  return {
    osmType: 'node',
    osmId: 1,
    name: 'POI',
    lat: 40.4168,
    lng: -3.7038,
    tags: {},
    ...overrides,
  };
}

describe('LandmarkTiering', () => {
  it('scores globally famous squares above secondary documented buildings', () => {
    const sol = buildPoi({
      osmId: 1,
      name: 'Puerta del Sol',
      osmType: 'relation',
      tags: {
        wikidata: 'Q1',
        wikipedia: 'es:Puerta_del_Sol',
        tourism: 'attraction',
        place: 'square',
      },
    });

    const longoria = buildPoi({
      osmId: 2,
      name: 'Palacio Longoria',
      osmType: 'way',
      tags: {
        wikidata: 'Q2',
        wikipedia: 'es:Palacio_Longoria',
        building: 'palace',
      },
    });

    expect(scoreLandmarkFame(sol, 45)).toBeGreaterThan(scoreLandmarkFame(longoria, 12));
  });

  it('assigns relative landmark tiers by city-local ranking', () => {
    expect(assignLandmarkTier(0, 10)).toBe('flagship');
    expect(assignLandmarkTier(1, 10)).toBe('major');
    expect(assignLandmarkTier(4, 10)).toBe('supporting');
    expect(assignLandmarkTier(8, 10)).toBe('filler');
  });

  it('returns a deterministic famous-first shortlist with tiers', () => {
    const tiered = tierPoisByLandmarkFame([
      buildPoi({
        osmId: 1,
        name: 'Puerta del Sol',
        osmType: 'relation',
        tags: { wikidata: 'Q1', tourism: 'attraction', wikipedia: 'es:Puerta_del_Sol', place: 'square' },
      }),
      buildPoi({
        osmId: 2,
        name: 'Plaza Mayor',
        osmType: 'relation',
        tags: { wikidata: 'Q2', tourism: 'attraction', wikipedia: 'es:Plaza_Mayor', place: 'square' },
      }),
      buildPoi({
        osmId: 3,
        name: 'Minor Memorial',
        tags: { wikidata: 'Q3', historic: 'memorial' },
      }),
      buildPoi({
        osmId: 4,
        name: 'Secondary Church',
        osmType: 'way',
        tags: { wikidata: 'Q4', building: 'church' },
      }),
    ], {
      Q1: 50,
      Q2: 40,
      Q3: 2,
      Q4: 5,
    });

    expect(tiered.map((poi) => poi.name)).toEqual([
      'Puerta del Sol',
      'Plaza Mayor',
      'Secondary Church',
      'Minor Memorial',
    ]);
    expect(tiered[0].landmarkTier).toBe('flagship');
    expect(tiered[1].landmarkTier).toBe('major');
    expect(tiered[3].landmarkTier).toBe('filler');
  });

  it('excludes non-historic entity types from history shortlist', () => {
    const tiered = tierPoisByLandmarkFame([
      buildPoi({
        osmId: 1,
        name: "Chang'e 4",
        tags: { wikidata: 'Q1', tourism: 'attraction', wikipedia: 'en:Chang\'e_4' },
      }),
      buildPoi({
        osmId: 2,
        name: 'Aeroscopia',
        tags: { wikidata: 'Q2', tourism: 'museum', wikipedia: 'fr:Aeroscopia' },
      }),
      buildPoi({
        osmId: 3,
        name: 'Capitole',
        tags: { wikidata: 'Q3', tourism: 'attraction', wikipedia: 'fr:Capitole_de_Toulouse', heritage: '1' },
      }),
    ], {
      Q1: 45,
      Q2: 25,
      Q3: 20,
    }, 'history', {
      Q1: { sitelinks: 45, instanceOfLabels: ['lunar lander'] },
      Q2: { sitelinks: 25, instanceOfLabels: ['aviation museum'] },
      Q3: { sitelinks: 20, instanceOfLabels: ['city hall'] },
    });

    expect(tiered.map((poi) => poi.name)).toEqual(['Capitole']);
  });

  it('excludes city-scale entities from history shortlist', () => {
    const tiered = tierPoisByLandmarkFame([
      buildPoi({
        osmId: 1,
        name: 'Toledo',
        tags: { wikidata: 'Q1', wikipedia: 'es:Toledo', heritage: '1', place: 'city' },
      }),
      buildPoi({
        osmId: 2,
        name: 'Catedral de Santa María',
        tags: { wikidata: 'Q2', wikipedia: 'es:Catedral_de_Toledo', building: 'cathedral' },
      }),
    ], {
      Q1: 129,
      Q2: 44,
    }, 'history', {
      Q1: { sitelinks: 129, instanceOfLabels: ['municipality of Spain'] },
      Q2: { sitelinks: 44, instanceOfLabels: ['cathedral'] },
    });

    expect(tiered.map((poi) => poi.name)).toEqual(['Catedral de Santa María']);
  });

  it('caps transferable object fame so place-like landmarks rank above it in history', () => {
    const tiered = tierPoisByLandmarkFame([
      buildPoi({
        osmId: 1,
        name: 'Famous Aircraft Exhibit',
        tags: { wikidata: 'Q1', wikipedia: 'en:Famous_Aircraft', historic: 'memorial' },
      }),
      buildPoi({
        osmId: 2,
        name: 'Grand Square',
        osmType: 'relation',
        tags: { wikidata: 'Q2', wikipedia: 'en:Grand_Square', tourism: 'attraction', place: 'square' },
      }),
      buildPoi({
        osmId: 3,
        name: 'Historic Cathedral',
        osmType: 'way',
        tags: { wikidata: 'Q3', wikipedia: 'en:Historic_Cathedral', building: 'cathedral', heritage: '1' },
      }),
    ], {
      Q1: 120,
      Q2: 18,
      Q3: 15,
    }, 'history', {
      Q1: { sitelinks: 120, instanceOfLabels: ['Aircraft Family'] },
      Q2: { sitelinks: 18, instanceOfLabels: ['square'] },
      Q3: { sitelinks: 15, instanceOfLabels: ['cathedral'] },
    });

    expect(tiered.map((poi) => poi.name)).toEqual([
      'Grand Square',
      'Historic Cathedral',
      'Famous Aircraft Exhibit',
    ]);
    expect(tiered.find((poi) => poi.name === 'Famous Aircraft Exhibit')?.landmarkTier).not.toBe('flagship');
  });

  it('keeps place-like entities on normal scoring when labels are mixed', () => {
    const tiered = tierPoisByLandmarkFame([
      buildPoi({
        osmId: 1,
        name: 'Aviation Museum',
        osmType: 'way',
        tags: { wikidata: 'Q1', wikipedia: 'en:Aviation_Museum', tourism: 'museum' },
      }),
      buildPoi({
        osmId: 2,
        name: 'Small Memorial',
        tags: { wikidata: 'Q2', historic: 'memorial' },
      }),
    ], {
      Q1: 22,
      Q2: 8,
    }, 'history', {
      Q1: { sitelinks: 22, instanceOfLabels: ['aviation museum', 'museum', 'building'] },
      Q2: { sitelinks: 8, instanceOfLabels: ['memorial'] },
    });

    expect(tiered.map((poi) => poi.name)).toEqual(['Aviation Museum', 'Small Memorial']);
    expect(tiered[0].landmarkTier).toBe('flagship');
  });

  it('keeps transferable-only pools non-empty in history', () => {
    const tiered = tierPoisByLandmarkFame([
      buildPoi({
        osmId: 1,
        name: 'Aircraft One',
        tags: { wikidata: 'Q1', wikipedia: 'en:Aircraft_One', historic: 'memorial' },
      }),
      buildPoi({
        osmId: 2,
        name: 'Aircraft Two',
        tags: { wikidata: 'Q2', wikipedia: 'en:Aircraft_Two', historic: 'memorial' },
      }),
      buildPoi({
        osmId: 3,
        name: 'Aircraft Three',
        tags: { wikidata: 'Q3', wikipedia: 'en:Aircraft_Three', historic: 'memorial' },
      }),
    ], {
      Q1: 60,
      Q2: 48,
      Q3: 33,
    }, 'history', {
      Q1: { sitelinks: 60, instanceOfLabels: ['fighter aircraft'] },
      Q2: { sitelinks: 48, instanceOfLabels: ['trainer aircraft'] },
      Q3: { sitelinks: 33, instanceOfLabels: ['helicopter'] },
    });

    expect(tiered).toHaveLength(3);
    expect(tiered.every((poi) => poi.landmarkTier !== 'flagship')).toBe(true);
  });
});
