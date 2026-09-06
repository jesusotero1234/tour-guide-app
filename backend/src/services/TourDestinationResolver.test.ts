import { resolveTourDestination } from './TourDestinationResolver';
const claim = (value: unknown) => [{ mainsnak: { datavalue: { value } } }];
function world(city = 'Madrid', code = 'ES', language = 'es', qid = 'Q2807') {
  const entities: Record<string, any> = {
    [qid]: { labels: { en: { value: city } }, aliases: { es: [{ value: city + ' alias' }] },
      claims: { P17: claim({ id: 'Q29' }), P31: claim({ id: 'Q515' }) }, sitelinks: { [language + 'wiki']: { title: city } } },
    Q29: { labels: { en: { value: code === 'ES' ? 'Spain' : 'Japan' } }, claims: { P297: claim(code), P37: claim({ id: 'Q1321' }) } },
    Q1321: { claims: { P218: claim(language) } },
  };
  const search = [qid];
  const get = jest.fn(async (_url: string, p: Record<string, string>) => ({
    data: p.action === 'wbsearchentities' ? { search: search.map(id => ({ id })) }
      : { entities: Object.fromEntries((p.ids ?? '').split('|').map(id => [id, entities[id] ? { id, ...entities[id] } : { id, missing: true }])) },
    status: 200,
  }));
  return { entities, search, get };
}
describe('canonical destination and research languages', () => {
  it('resolves aliases and fetches country languages without a city P37', async () => {
    const w = world();
    const a = await resolveTourDestination({ city: 'Madrid', countryCode: 'ES' }, w.get);
    const b = await resolveTourDestination({ city: 'Madrid alias', countryCode: 'ES' }, w.get);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ qid: 'Q2807', city: 'Madrid', country: 'Spain', researchLanguages: ['es', 'en'] });
    expect(w.get.mock.calls.some(([, p]) => p.ids === 'Q1321')).toBe(true);
  });
  it('uses destination languages for a different country', async () => {
    const w = world('Kyoto', 'JP', 'ja', 'Q34600');
    expect(await resolveTourDestination({ city: 'Kyoto', countryCode: 'JP' }, w.get))
      .toMatchObject({ qid: 'Q34600', countryCode: 'JP', researchLanguages: ['ja', 'en'] });
  });
  it('excludes a same-name newspaper but accepts a city subclass', async () => {
    const w = world();
    w.entities.Q2807.claims.P31 = claim({id:'Q200'});
    w.entities.Q200 = {claims:{P279:claim({id:'Q15284'})}};
    w.entities.Q999 = {...structuredClone(w.entities.Q2807), claims:{P17:claim({id:'Q29'}),P31:claim({id:'Q11032'})}};
    w.search.push('Q999');
    expect((await resolveTourDestination({city:'Madrid',countryCode:'ES'},w.get)).qid).toBe('Q2807');
  });
  it('pairs source titles with their actual edition and allows missing Wikivoyage', async () => {
    const w = world('Kyoto','JP','ja','Q34600');
    w.entities.Q34600.sitelinks.jawiki.title = '京都市';
    w.entities.Q34600.sitelinks.enwikivoyage = {title:'Kyoto'};
    expect((await resolveTourDestination({city:'Kyoto',countryCode:'JP'},w.get)).wikimediaPages)
      .toEqual({wikipedia:{language:'ja',title:'京都市'},wikivoyage:{language:'en',title:'Kyoto'}});
    delete w.entities.Q34600.sitelinks.enwikivoyage;
    expect((await resolveTourDestination({city:'Kyoto',countryCode:'JP'},w.get)).wikimediaPages?.wikivoyage).toBeNull();
  });
  it('does not choose between ambiguous cities', async () => {
    const w = world(); w.entities.Q999 = structuredClone(w.entities.Q2807); w.search.push('Q999');
    await expect(resolveTourDestination({ city: 'Madrid', countryCode: 'ES' }, w.get)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });
  it('uses city administration languages and excludes country languages restricted to other regions', async () => {
    const w = world();
    w.entities.Q29.claims.P37.push({...claim({id:'Q100'})[0], qualifiers:{P518:claim({id:'Q200'})}});
    w.entities.Q100 = {claims:{P218:claim('ca')}};
    w.entities.Q2807.claims.P131 = [{...claim({id:'Q200'})[0], qualifiers:{P582:claim('1983')}}];
    w.entities.Q200 = {claims:{P37:claim({id:'Q100'})}};
    expect((await resolveTourDestination({city:'Madrid',countryCode:'ES'},w.get)).researchLanguages).toEqual(['es','en']);
    w.entities.Q2807.claims.P131 = claim({id:'Q200'});
    w.entities.Q200 = {claims:{P37:claim({id:'Q100'}),P131:claim({id:'Q29'})}};
    expect((await resolveTourDestination({city:'Madrid',countryCode:'ES'},w.get)).researchLanguages).toEqual(['ca','es','en']);
  });
  it('rejects mismatched country and invalid country code', async () => {
    const w = world();
    await expect(resolveTourDestination({ city: 'Madrid', countryCode: 'JP' }, w.get)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
    w.get.mockClear();
    await expect(resolveTourDestination({ city: 'Madrid', countryCode: 'ESP' }, w.get)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
    expect(w.get).not.toHaveBeenCalled();
  });
  it('keeps city language priority and English within a bounded multilingual policy', async () => {
    const w = world();
    w.entities.Q2807.claims.P37 = [...claim({id:'Q100'}), ...claim({id:'Q101'}), ...claim({id:'Q102'})];
    w.entities.Q100 = { claims: { P218: claim('fr') } };
    w.entities.Q101 = { claims: { P218: claim('de') } };
    w.entities.Q102 = { claims: { P218: claim('it') } };
    w.entities.Q2807.sitelinks.frwiki = { title:'Madrid' };
    expect((await resolveTourDestination({ city:'Madrid',countryCode:'ES' },w.get)).researchLanguages).toEqual(['fr','de','en']);
  });
});

describe('Seville OSM link resolves ambiguity without bypassing Wikidata checks', () => {
  it('requires review when no location is provided despite multiple Seville candidates', async () => {
    const w = world('Seville', 'ES', 'es', 'Q8717');
    w.entities.Q55893348 = {
      labels: { en: { value: 'Seville' } },
      aliases: { es: [{ value: 'Sevilla' }] },
      claims: { P17: claim({ id: 'Q29' }), P31: claim({ id: 'Q515' }) },
      sitelinks: { eswiki: { title: 'Sevilla' } },
    };
    w.search.push('Q55893348');
    await expect(resolveTourDestination({ city: 'Seville', countryCode: 'ES' }, w.get)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });

  it('resolves Seville via OSM link and verifies Wikidata entity without bypassing checks', async () => {
    const w = world('Seville', 'ES', 'es', 'Q8717');
    w.entities.Q55893348 = {
      labels: { en: { value: 'Seville' } },
      aliases: { es: [{ value: 'Sevilla' }] },
      claims: { P17: claim({ id: 'Q29' }), P31: claim({ id: 'Q515' }) },
      sitelinks: { eswiki: { title: 'Sevilla' } },
    };
    w.search.push('Q55893348');

    const originalGet = w.get;
    const mockGet = jest.fn(async (url: string, params: Record<string, string>) => {
      if (url.includes('nominatim.openstreetmap.org/lookup')) {
        return {
          data: [{
            osm_type: 'relation',
            osm_id: 342563,
            addresstype: 'city',
            name: 'Seville',
            lat: '37.3886303',
            lon: '-5.9953403',
            address: { country_code: 'ES', city: 'Seville' },
            extratags: { wikidata: 'Q8717' },
          }],
          status: 200,
        };
      }
      return originalGet(url, params);
    });

    const result = await resolveTourDestination({
      city: 'Seville',
      countryCode: 'ES',
      location: { source: { provider: 'nominatim', osmType: 'relation', osmId: 342563 }, coordinates: { lat: 37.3886303, lng: -5.9953403 } },
    }, mockGet);

    expect(result).toMatchObject({ qid: 'Q8717', countryCode: 'ES' });
    expect(mockGet.mock.calls.some(([, p]) => p.action === 'wbsearchentities')).toBe(false);
    expect(mockGet.mock.calls.some(([, p]) => p.action === 'wbgetentities' && p.ids === 'Q8717')).toBe(true);
  });

  it('rejects provider-linked Wikidata entity of non-settlement type', async () => {
    const w = world('Seville', 'ES', 'es', 'Q8717');
    w.entities.Q55893348 = {
      labels: { en: { value: 'Seville' } },
      aliases: { es: [{ value: 'Sevilla' }] },
      claims: { P17: claim({ id: 'Q29' }), P31: claim({ id: 'Q515' }) },
      sitelinks: { eswiki: { title: 'Sevilla' } },
    };
    w.search.push('Q55893348');

    const originalGet = w.get;
    const mockGet = jest.fn(async (url: string, params: Record<string, string>) => {
      if (url.includes('nominatim.openstreetmap.org/lookup')) {
        return {
          data: [{
            osm_type: 'relation',
            osm_id: 342563,
            addresstype: 'city',
            name: 'Seville',
            lat: '37.3886303',
            lon: '-5.9953403',
            address: { country_code: 'ES', city: 'Seville' },
            extratags: { wikidata: 'Q8717' },
          }],
          status: 200,
        };
      }
      return originalGet(url, params);
    });

    w.entities.Q8717.claims.P31 = claim({ id: 'Q11032' });

    await expect(resolveTourDestination({
      city: 'Seville',
      countryCode: 'ES',
      location: { source: { provider: 'nominatim', osmType: 'relation', osmId: 342563 }, coordinates: { lat: 37.3886303, lng: -5.9953403 } },
    }, mockGet)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });

  it('rejects when Wikidata country P297 disagrees with ES even if provider country is ES', async () => {
    const w = world('Seville', 'ES', 'es', 'Q8717');
    w.entities.Q55893348 = {
      labels: { en: { value: 'Seville' } },
      aliases: { es: [{ value: 'Sevilla' }] },
      claims: { P17: claim({ id: 'Q29' }), P31: claim({ id: 'Q515' }) },
      sitelinks: { eswiki: { title: 'Sevilla' } },
    };
    w.search.push('Q55893348');

    const originalGet = w.get;
    const mockGet = jest.fn(async (url: string, params: Record<string, string>) => {
      if (url.includes('nominatim.openstreetmap.org/lookup')) {
        return {
          data: [{
            osm_type: 'relation',
            osm_id: 342563,
            addresstype: 'city',
            name: 'Seville',
            lat: '37.3886303',
            lon: '-5.9953403',
            address: { country_code: 'ES', city: 'Seville' },
            extratags: { wikidata: 'Q8717' },
          }],
          status: 200,
        };
      }
      return originalGet(url, params);
    });

    w.entities.Q142 = { claims: { P297: claim('FR') } };
    w.entities.Q8717.claims.P17 = claim({ id: 'Q142' });

    await expect(resolveTourDestination({
      city: 'Seville',
      countryCode: 'ES',
      location: { source: { provider: 'nominatim', osmType: 'relation', osmId: 342563 }, coordinates: { lat: 37.3886303, lng: -5.9953403 } },
    }, mockGet)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });

  it('rejects ambiguous candidates when verified provider has no wikidata tag', async () => {
    const w = world('Seville', 'ES', 'es', 'Q8717');
    w.entities.Q55893348 = {
      labels: { en: { value: 'Seville' } },
      aliases: { es: [{ value: 'Sevilla' }] },
      claims: { P17: claim({ id: 'Q29' }), P31: claim({ id: 'Q515' }) },
      sitelinks: { eswiki: { title: 'Sevilla' } },
    };
    w.search.push('Q55893348');

    const originalGet = w.get;
    const mockGet = jest.fn(async (url: string, params: Record<string, string>) => {
      if (url.includes('nominatim.openstreetmap.org/lookup')) {
        return {
          data: [{
            osm_type: 'relation',
            osm_id: 342563,
            addresstype: 'city',
            name: 'Seville',
            lat: '37.3886303',
            lon: '-5.9953403',
            address: { country_code: 'ES', city: 'Seville' },
            extratags: {},
          }],
          status: 200,
        };
      }
      return originalGet(url, params);
    });

    await expect(resolveTourDestination({
      city: 'Seville',
      countryCode: 'ES',
      location: { source: { provider: 'nominatim', osmType: 'relation', osmId: 342563 }, coordinates: { lat: 37.3886303, lng: -5.9953403 } },
    }, mockGet)).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });

  it('preserves existing compatibility for unique candidate without provider', async () => {
    const w = world('Seville', 'ES', 'es', 'Q8717');
    const result = await resolveTourDestination({ city: 'Seville', countryCode: 'ES' }, w.get);
    expect(result).toMatchObject({ qid: 'Q8717', countryCode: 'ES' });
  });
});
