import { StructuralTourData, StructuralTourPlace } from '../orchestrationService';
import { buildNarrativeRouteFromStructuralTourV6 } from './NarrativeStructuralRouteV6';

function place(position: number, overrides: Partial<StructuralTourPlace> = {}): StructuralTourPlace {
  const name = `Parada ${position + 1}`;
  return {
    poi: {
      osmType: 'relation', osmId: position + 1, name,
      lat: 41.38 + position * 0.001, lng: 2.17 + position * 0.001,
      tags: { name, wikidata: `Q${position + 1}`, wikipedia: `es:${name.replace(/ /g, '_')}` },
      enriched: {
        nameTranslations: { es: name }, description: null, wikipediaLead: null,
        wikipediaBody: null, wikidataClaims: null, osmTags: {}, wikivoyage: null,
        descriptionLanguage: 'es', attribution: {
          wikidata: { id: `Q${position + 1}`, url: `https://www.wikidata.org/wiki/Q${position + 1}` },
        },
      },
    },
    name, coordinates: { lat: 41.38 + position * 0.001, lng: 2.17 + position * 0.001 },
    importance_score: 10 - position, category: 'monument', estimatedDuration: 20,
    ...overrides,
  };
}

function structural(places: StructuralTourPlace[]): StructuralTourData {
  return {
    places, routeCandidates: places,
    routeDiagnostics: {
      estimatedTourMinutes: 120, requestedDuration: 120,
      degraded: false, degradationReason: null, coverageRatio: 1,
    },
    confidenceInput: {
      input: { rawPoolSize: 20, wikidataTaggedCount: 20, sitelinksResolvedRatio: 1, maxSitelinks: 100 },
      output: {
        shortlistSize: places.length, routeDuplicateWikidataCount: 0,
        routeMaxCategoryShare: 0.5, routeFlagshipCount: 1, degraded: false,
        coverageRatio: 1, stopCount: places.length,
      },
    },
  };
}

const request = {
  city: 'Barcelona', country: 'España', countryCode: 'ES',
  theme: 'history', language: 'es', durationMinutes: 120,
};

describe('narrative v6 structural route adapter', () => {
  it('preserves the production selection order without an oracle', () => {
    const places = [place(0), place(1), place(2), place(3)];
    const route = buildNarrativeRouteFromStructuralTourV6({ request, structuralTour: structural(places) });

    expect(route.stops.map((stop) => stop.name)).toEqual(places.map((item) => item.name));
    expect(route.stops.map((stop) => stop.position)).toEqual([0, 1, 2, 3]);
    expect(route.stops[0].previousStopId).toBeNull();
    expect(route.stops[3].nextStopId).toBeNull();
  });

  it('rejects duplicate stable stop identities', () => {
    const places = [place(0), place(1), place(2), place(3, { name: 'Parada 1' })];
    expect(() => buildNarrativeRouteFromStructuralTourV6({
      request, structuralTour: structural(places),
    })).toThrow('duplicate stop identities');
  });

  it('rejects missing Wikidata identity and invalid coordinates', () => {
    const missingIdentity = place(3);
    missingIdentity.poi.tags.wikidata = undefined;
    missingIdentity.poi.enriched.attribution.wikidata = undefined;
    expect(() => buildNarrativeRouteFromStructuralTourV6({
      request, structuralTour: structural([place(0), place(1), place(2), missingIdentity]),
    })).toThrow('lacks a Wikidata identity');

    expect(() => buildNarrativeRouteFromStructuralTourV6({
      request,
      structuralTour: structural([place(0), place(1), place(2), place(3, {
        coordinates: { lat: 200, lng: 2.17 },
      })]),
    })).toThrow('invalid coordinates');
  });
});
