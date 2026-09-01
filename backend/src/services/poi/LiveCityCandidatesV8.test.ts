import { RawPoi } from '../../domain/poi/RawPoi';
import {
  loadLiveCityCandidatesV8,
  LiveCityCandidatesV8Get,
} from './LiveCityCandidatesV8';

const CITY_CENTER = { lat: 39.4699, lng: -0.3763 };

const NOMINATIM_RESPONSE = [
  {
    lat: '39.4699',
    lon: '-0.3763',
    osm_type: 'relation',
    osm_id: 2367393,
    boundingbox: ['39.3946', '39.5451', '-0.4463', '-0.3075'],
    display_name: 'Valencia, Comunitat Valenciana, España',
  },
];

const OVERPASS_ELEMENTS = [
  {
    type: 'node',
    id: 1001,
    lat: 39.47,
    lon: -0.376,
    tags: {
      name: 'Catedral de Valencia',
      'name:es': 'Catedral de Valencia',
      wikidata: 'Q246428',
      wikipedia: 'es:Catedral de Valencia',
      building: 'cathedral',
      tourism: 'attraction',
      heritage: '2',
      start_date: '1238',
    },
  },
  {
    type: 'way',
    id: 2001,
    center: { lat: 39.473, lon: -0.379 },
    tags: {
      name: 'Torres de Serranos',
      wikidata: 'Q3123400',
      wikipedia: 'es:Torres de Serranos',
      historic: 'city_gate',
      tourism: 'attraction',
      heritage: '2',
    },
  },
  {
    type: 'node',
    id: 3001,
    lat: 39.52,
    lon: -0.33,
    tags: {
      name: 'Museo de las Ciencias Príncipe Felipe',
      wikidata: 'Q3573185',
      wikipedia: 'es:Museo de las Ciencias Príncipe Felipe',
      tourism: 'museum',
      heritage: '2',
    },
  },
  {
    type: 'node',
    id: 4001,
    lat: 39.47,
    lon: -0.3765,
    tags: {
      name: 'Fuente sin identidad',
      tourism: 'attraction',
    },
  },
];

function wikidataEntity(qid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: qid,
    labels: { es: { language: 'es', value: `Nombre de ${qid}` } },
    sitelinks: { eswiki: { site: 'eswiki', title: `Artículo de ${qid}` } },
    claims: {
      P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q1000' } } } }],
    },
    ...overrides,
  };
}

const WIKIDATA_MAIN_ENTITIES: Record<string, Record<string, unknown>> = {
  Q246428: wikidataEntity('Q246428', {
    labels: {
      es: { language: 'es', value: 'Catedral de Valencia' },
      ca: { language: 'ca', value: 'Catedral de València' },
      en: { language: 'en', value: 'Valencia Cathedral' },
    },
    sitelinks: {
      eswiki: { site: 'eswiki', title: 'Catedral de Valencia' },
      enwiki: { site: 'enwiki', title: 'Valencia Cathedral' },
    },
    claims: {
      P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q51642' } } } }],
      P571: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1262-06-22T00:00:00Z' } } } }],
      P1435: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q1135524' } } } }],
    },
  }),
  Q3123400: wikidataEntity('Q3123400', {
    labels: {
      es: { language: 'es', value: 'Torres de Serranos' },
      en: { language: 'en', value: 'Serranos Towers' },
    },
    sitelinks: { eswiki: { site: 'eswiki', title: 'Torres de Serranos' } },
    claims: {
      P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q15243209' } } } }],
      P571: [{ mainsnak: { snaktype: 'value', datavalue: { value: { time: '+1392-01-01T00:00:00Z' } } } }],
    },
  }),
  Q3573185: wikidataEntity('Q3573185', {
    labels: { es: { language: 'es', value: 'Museo de las Ciencias Príncipe Felipe' } },
    sitelinks: {
      eswiki: { site: 'eswiki', title: 'Museo de las Ciencias Príncipe Felipe' },
    },
    claims: {
      P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q1396841' } } } }],
    },
  }),
};

const WIKIDATA_LABEL_ENTITIES: Record<string, Record<string, unknown>> = {
  Q51642: { id: 'Q51642', labels: { en: { language: 'en', value: 'cathedral' } } },
  Q1135524: { id: 'Q1135524', labels: { en: { language: 'en', value: 'Bien de Interés Cultural' } } },
  Q15243209: { id: 'Q15243209', labels: { es: { language: 'es', value: 'city gate' } } },
  Q1396841: { id: 'Q1396841', labels: { es: { language: 'es', value: 'museum' } } },
};

const WIKIPEDIA_EXTRACTS: Record<string, string> = {
  'Catedral de Valencia':
    'La Catedral de Valencia es un templo religioso construido entre los siglos XIII y XV.'
    + ' Es el principal monumento de la ciudad. Su construcción comenzó en 1262 sobre una mezquita.',
  'Torres de Serranos':
    'Las Torres de Serranos son una de las puertas fortificadas de la muralla medieval de Valencia.'
    + ' Fueron construidas en 1392 por el arquitecto Pere Balaguer.',
  'Museo de las Ciencias Príncipe Felipe':
    'El Museo de las Ciencias Príncipe Felipe es un museo interactivo de la Ciudad de las Artes y las Ciencias.',
};

interface ScriptedGetV8Options {
  overpassError?: unknown;
}

function scriptedGetV8(options: ScriptedGetV8Options = {}): {
  get: LiveCityCandidatesV8Get;
  calls: Array<{ url: string; params: Record<string, unknown> }>;
  fetchPois: (city: { lat: number; lng: number }, theme: string) => Promise<RawPoi[]>;
} {
  const calls: Array<{ url: string; params: Record<string, unknown> }> = [];
  const get: LiveCityCandidatesV8Get = async (url, params) => {
    calls.push({ url, params: params as Record<string, unknown> });
    if (url.includes('nominatim.openstreetmap.org')) {
      return { data: NOMINATIM_RESPONSE };
    }
    if (url.includes('wikidata.org')) {
      const ids = String(params.ids ?? '').split('|');
      const props = String(params.props ?? '');
      if (props.includes('sitelinks')) {
        return { data: {
          entities: Object.fromEntries(ids.map((id) => [
            id,
            WIKIDATA_MAIN_ENTITIES[id] ?? wikidataEntity(id),
          ])),
        } };
      }
      return { data: { entities: Object.fromEntries(ids.map((id) => [id, WIKIDATA_LABEL_ENTITIES[id]])) } };
    }
    if (url.includes('wikipedia.org')) {
      const titles = String(params.titles ?? '').split('|').filter(Boolean);
      return {
        data: {
          query: {
            pages: titles.map((title, index) => ({
              pageid: index + 1,
              ns: 0,
              index: index + 1,
              title,
              extract: WIKIPEDIA_EXTRACTS[title]
                ?? (title.startsWith('Artículo')
                  ? 'Extracto del artículo sobre el monumento histórico y su construcción.'
                  : ''),
            })),
          },
        },
      };
    }
    return { data: {} };
  };
  const fetchPois = async (_city: { lat: number; lng: number }, _theme: string): Promise<RawPoi[]> => {
    if (options.overpassError !== undefined) throw options.overpassError;
    return OVERPASS_ELEMENTS.map((element) => {
      const record = element as Record<string, unknown>;
      const center = record.center as Record<string, unknown> | undefined;
      return {
        osmType: record.type as RawPoi['osmType'],
        osmId: record.id as number,
        name: (record.tags as Record<string, unknown>).name as string,
        lat: Number(record.lat ?? center?.lat),
        lng: Number(record.lon ?? center?.lon),
        tags: record.tags as RawPoi['tags'],
      };
    });
  };
  return { get, calls, fetchPois };
}

describe('loadLiveCityCandidatesV8', () => {
  it('geocodes the city, parses OSM elements, and keeps only candidates near the center', async () => {
    const { get, calls, fetchPois } = scriptedGetV8();
    const result = await loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      countryCode: 'ES',
    }, { get, fetchPois });

    const nominatimCall = calls.find((call) => call.url.includes('nominatim'));
    expect(nominatimCall?.params.q).toBe('valencia');
    expect(nominatimCall?.params.countrycodes).toBe('es');

    expect(result.cityCenter).toEqual({ lat: CITY_CENTER.lat, lng: CITY_CENTER.lng });
    expect(result.readyEntities.map((entity) => entity.canonicalId).sort()).toEqual(['Q246428', 'Q3123400']);
    const scores = result.readyEntities.map((entity) => entity.firstVisitScore ?? 0);
    expect([...scores].sort((left, right) => right - left)).toEqual(scores);
    const cathedral = result.readyEntities.find((entity) => entity.canonicalId === 'Q246428');
    expect(cathedral?.localName).toBe('Catedral de Valencia');
    expect(cathedral?.fameScore).toBeGreaterThan(0);
    expect(cathedral?.recognitionScore).toBeGreaterThan(0);
    expect(result.readyEntities.every((entity) => entity.readiness.ready)).toBe(true);

    const entityIds = result.entities.map((entity) => entity.canonicalId);
    expect(entityIds).not.toContain('Q3573185');
    expect(entityIds).not.toContain('osm:node:4001');
    expect(result.prefilteredCount).toBe(3);
    expect(result.evidenceGaps).toEqual([]);
  });

  it('requests Wikidata and Wikipedia enrichment over the network endpoints', async () => {
    const { get, calls, fetchPois } = scriptedGetV8();
    await loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, { get, fetchPois });

    const wikidataCalls = calls.filter((call) => call.url.includes('wikidata.org'));
    expect(wikidataCalls.some((call) => call.params.props === 'labels|claims|sitelinks')).toBe(true);
    expect(wikidataCalls.some((call) => call.params.props === 'labels')).toBe(true);

    const wikipediaCalls = calls.filter((call) => call.url.includes('wikipedia.org'));
    expect(wikipediaCalls.length).toBeGreaterThan(0);
    expect(wikipediaCalls.every((call) => call.url === 'https://es.wikipedia.org/w/api.php')).toBe(true);
    expect(wikipediaCalls.every((call) => call.params.maxlag === 30)).toBe(true);
  });

  it('keeps a small serial Wikipedia budget when the pool is much larger than the shortlist', async () => {
    const { get, calls } = scriptedGetV8();
    const manyPois: RawPoi[] = Array.from({ length: 251 }, (_, index) => ({
      osmType: 'node',
      osmId: 10_000 + index,
      name: `Monumento ${index + 1}`,
      lat: 39.47 + (index % 7) * 0.0005,
      lng: -0.376 + (index % 5) * 0.0005,
      tags: {
        name: `Monumento ${index + 1}`,
        wikidata: `Q9${String(100_000 + index)}`,
        wikipedia: `es:Artículo ${index + 1}`,
        tourism: 'attraction',
      },
    }));
    const result = await loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, { get, fetchPois: async () => manyPois });

    const wikipediaCalls = calls.filter((call) => call.url.includes('wikipedia.org'));
    const wikidataEntityCalls = calls.filter((call) => (
      call.url.includes('wikidata.org') && String(call.params.props).includes('sitelinks')
    ));
    expect(result.prefilteredCount).toBe(60);
    expect(wikidataEntityCalls.length).toBe(6);
    expect(wikipediaCalls.length).toBeLessThanOrEqual(8);
  });

  it('retries a retryable 500 via the shared policy with a recorded Retry-After wait', async () => {
    const base = scriptedGetV8();
    const waits: number[] = [];
    let wikidataCalls = 0;
    const get: LiveCityCandidatesV8Get = async (url, params, options) => {
      if (url.includes('wikidata.org') && String(params.props).includes('sitelinks')) {
        wikidataCalls += 1;
        if (wikidataCalls === 1) {
          throw {
            response: { status: 500, headers: { 'retry-after': '7' } },
          };
        }
      }
      return base.get(url, params, options);
    };

    const result = await loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, {
      get,
      fetchPois: base.fetchPois,
      wait: async (ms) => { waits.push(ms); },
    });

    expect(wikidataCalls).toBe(2);
    expect(waits).toContain(7000);
    expect(result.readyEntities.length).toBeGreaterThan(0);
  });

  it('does not retry non-retryable failures', async () => {
    const base = scriptedGetV8();
    let wikidataCalls = 0;
    const get: LiveCityCandidatesV8Get = async (url, params, options) => {
      if (url.includes('wikidata.org') && String(params.props).includes('sitelinks')) {
        wikidataCalls += 1;
        throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
      }
      return base.get(url, params, options);
    };

    await expect(loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, { get, fetchPois: base.fetchPois })).rejects.toThrow(/forbidden/);
    expect(wikidataCalls).toBe(1);
  });

  it('retries an HTTP-200 maxlag body from Wikidata with a recorded wait', async () => {
    const base = scriptedGetV8();
    const waits: number[] = [];
    let wikidataCalls = 0;
    const get: LiveCityCandidatesV8Get = async (url, params, options) => {
      if (url.includes('wikidata.org') && String(params.props).includes('sitelinks')) {
        wikidataCalls += 1;
        if (wikidataCalls === 1) {
          return { data: { error: { code: 'maxlag', lag: 2 } } };
        }
      }
      return base.get(url, params, options);
    };

    const result = await loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, {
      get,
      fetchPois: base.fetchPois,
      wait: async (ms) => { waits.push(ms); },
    });

    expect(wikidataCalls).toBeGreaterThanOrEqual(2);
    expect(waits).toContain(5000);
    expect(result.readyEntities.length).toBeGreaterThan(0);
  });

  it('fails clearly when Overpass returns a runtime error', async () => {
    const { get, fetchPois } = scriptedGetV8({
      overpassError: new Error('runtime error: Query timed out'),
    });
    await expect(loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, { get, fetchPois })).rejects.toThrow(/runtime error: Query timed out/);
  });

  it('rejects invalid inputs with strict validation', async () => {
    const { get } = scriptedGetV8();
    await expect(loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'history',
      language: 'e',
      durationMinutes: 120,
    }, { get, fetchPois: scriptedGetV8().fetchPois })).rejects.toThrow(/language code/);
    await expect(loadLiveCityCandidatesV8({
      city: 'valencia',
      cityKey: 'valencia',
      theme: 'cuisine' as never,
      language: 'es',
      durationMinutes: 120,
    }, { get, fetchPois: scriptedGetV8().fetchPois })).rejects.toThrow(/supported theme/);
    await expect(loadLiveCityCandidatesV8({
      city: '',
      cityKey: 'valencia',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
    }, { get, fetchPois: scriptedGetV8().fetchPois })).rejects.toThrow(/city name/);
  });
});
