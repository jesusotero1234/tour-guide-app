import {
  applyRegistryAuthorityV7,
  buildAdaptiveSearchPlanV7,
  classifyAgainstRegistryV7,
  degradeAuthorityForMismatch,
  NARRATIVE_STOP_BUDGET_V7,
  NarrativeAuthorityRegistryV7,
  CityIdentityReviewRequiredErrorV8,
  resolveCityIdentityV8,
  resolveCityQidV7,
  resolveWikidataQidFromWikipediaV8,
  WikidataAuthorityProviderV7,
} from './NarrativeAuthoritiesV7';
import { NarrativeDiscoveryResultV7 } from './NarrativeSourcesV7';

describe('resolveCityQidV7', () => {
  function cityIdentityGet(): (url: string, params: Record<string, string>) => Promise<{ data: unknown }> {
    return async (_url, params) => {
      if (String(params.action) === 'wbsearchentities') {
        return { data: { search: [
          { id: 'Q1', label: 'Málaga' },
          { id: 'Q2', label: 'Málaga' },
        ] } };
      }
      if (String(params.action) === 'wbgetentities') {
        const ids = String(params.ids ?? '').split('|');
        const entities: Record<string, Record<string, unknown>> = {};
        for (const id of ids) {
          if (id === 'Q1') {
            entities[id] = {
              id,
              labels: { en: { value: 'Málaga' } },
              aliases: {},
              claims: { P17: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q87' } } } }] },
            };
          } else if (id === 'Q2') {
            entities[id] = {
              id,
              labels: { en: { value: 'Málaga' } },
              aliases: {},
              claims: { P17: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q96' } } } }] },
            };
          } else if (id === 'Q87') {
            entities[id] = {
              id,
              claims: { P297: [{ mainsnak: { snaktype: 'value', datavalue: { value: 'ES' } } }] },
            };
          } else if (id === 'Q96') {
            entities[id] = {
              id,
              claims: { P297: [{ mainsnak: { snaktype: 'value', datavalue: { value: 'VE' } } }] },
            };
          }
        }
        return { data: { entities } };
      }
      return { data: {} };
    };
  }

  it('selects the candidate whose P17.P297 matches the country code and the normalized name', async () => {
    const qid = await resolveCityQidV7({
      cityName: 'Málaga',
      language: 'es',
      countryCode: 'ES',
      get: cityIdentityGet(),
    });

    expect(qid).toBe('Q1');
  });

  it('returns city_identity_review_required when the country does not match, never the first result', async () => {
    const resolution = await resolveCityIdentityV8({
      cityName: 'Málaga',
      language: 'es',
      countryCode: 'IT',
      get: cityIdentityGet(),
    });

    expect(resolution.status).toBe('city_identity_review_required');
  });

  it('returns city_identity_review_required when several candidates match and throws via resolveCityQidV7', async () => {
    const get = cityIdentityGet();
    const multi = async (url: string, params: Record<string, string>) => {
      const base = await get(url, params);
      if (String(params.action) === 'wbgetentities' && String(params.ids).includes('Q2')) {
        const entities = (base.data as { entities: Record<string, { claims: Record<string, unknown> }> }).entities;
        if (entities.Q2) {
          entities.Q2 = {
            ...entities.Q2,
            claims: { ...entities.Q2.claims, P17: [{ mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q87' } } } }] },
          };
        }
      }
      return base;
    };
    const resolution = await resolveCityIdentityV8({
      cityName: 'Málaga',
      language: 'es',
      countryCode: 'ES',
      get: multi,
    });

    expect(resolution.status).toBe('city_identity_review_required');
    await expect(resolveCityQidV7({
      cityName: 'Málaga',
      language: 'es',
      countryCode: 'ES',
      get: multi,
    })).rejects.toBeInstanceOf(CityIdentityReviewRequiredErrorV8);
  });

  it('rejects when no candidate matches the city name', async () => {
    const resolution = await resolveCityIdentityV8({
      cityName: 'Nowhere',
      language: 'es',
      get: cityIdentityGet(),
    });

    expect(resolution.status).toBe('city_identity_review_required');
  });
});

describe('resolveWikidataQidFromWikipediaV8', () => {
  it('resolves a missing QID from Wikipedia pageprops.wikibase_item', async () => {
    const qid = await resolveWikidataQidFromWikipediaV8({
      title: 'Catedral de Málaga',
      language: 'es',
      get: async () => ({
        data: {
          query: { pages: [{ pageid: 1, title: 'Catedral de Málaga', pageprops: { wikibase_item: 'Q1582758' } }] },
        },
      }),
    });

    expect(qid).toBe('Q1582758');
  });

  it('returns null when the page has no wikibase item', async () => {
    const qid = await resolveWikidataQidFromWikipediaV8({
      title: 'Sin identidad',
      language: 'es',
      get: async () => ({
        data: { query: { pages: [{ pageid: 1, title: 'Sin identidad', pageprops: {} }] } },
      }),
    });

    expect(qid).toBeNull();
  });
});

function wikibaseEntity(qid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: qid,
    labels: {
      es: { language: 'es', value: `Nombre de ${qid}` },
      ca: { language: 'ca', value: `Nom de ${qid}` },
    },
    aliases: {
      es: [{ language: 'es', value: `Alias de ${qid}` }],
    },
    claims: {
      P856: [{
        rank: 'normal',
        mainsnak: { snaktype: 'value', datavalue: { value: `https://www.${qid.toLowerCase()}.example` } },
      }],
      P131: [{
        rank: 'normal',
        mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q10' } } },
      }],
      ...overrides,
    },
    ...overrides,
  };
}

describe('WikidataAuthorityProviderV7', () => {
  it('derives official domains from P856 and administrative ancestors from P131', async () => {
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params) => {
        const ids = (params.ids ?? '').split('|');
        if (params.action === 'wbgetentities' && params.ids) {
          const entities = Object.fromEntries(ids.map((qid) => {
            if (qid === 'Q1') return ['Q1', wikibaseEntity('Q1', {
              claims: {
                P856: [{
                  rank: 'normal',
                  mainsnak: { snaktype: 'value', datavalue: { value: 'https://www.barcelona.cat' } },
                }],
                P131: [{
                  rank: 'normal',
                  mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q10' } } },
                }],
              },
            })];
            return ['Q10', wikibaseEntity('Q10', {
              claims: {
                P856: [{
                  rank: 'normal',
                  mainsnak: { snaktype: 'value', datavalue: { value: 'https://www.gencat.cat' } },
                }],
              },
            })];
          }));
          return { data: { entities } };
        }
        if (params.action === 'query') {
          return { data: { query: { pages: [{
            title: 'Q1',
            revisions: [{ revid: 42, timestamp: '2026-08-01T10:00:00Z' }],
          }] } } };
        }
        return { data: {} };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q10', language: 'es',
    });

    const domains = registry.authorities.map((authority) => authority.domain);
    expect(domains).toContain('www.barcelona.cat');
    expect(domains).toContain('www.gencat.cat');
    const place = registry.authorities.find((authority) => authority.origin === 'place_p856');
    expect(place?.wikidataRevision).toEqual({ revisionId: 42, timestamp: '2026-08-01T10:00:00Z' });
    expect(registry.aliases).toContain('Alias de Q1');
  });

  it('ignores deprecated P856 claims and preserves http URLs with their domain', async () => {
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params): Promise<{ data: unknown }> => {
        if (params.action === 'wbgetentities') {
          const ids = (params.ids ?? '').split('|');
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            entities[qid] = qid === 'Q1'
              ? wikibaseEntity('Q1', {
                claims: {
                  P856: [
                    { rank: 'deprecated', mainsnak: { snaktype: 'value', datavalue: { value: 'https://old.example' } } },
                    { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: 'http://insecure.example' } } },
                    { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: 'https://www.valid.example' } } },
                  ],
                },
              })
              : wikibaseEntity(qid);
          }
          return { data: { entities } };
        }
        return {
          data: {
            query: { pages: [{ revisions: [{ revid: 1, timestamp: '2026-01-01T00:00:00Z' }] }] },
          },
        };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q10', language: 'es',
    });

    const domains = registry.authorities.map((authority) => authority.domain);
    expect(domains).toContain('www.valid.example');
    expect(domains).not.toContain('old.example');
    expect(domains).toContain('insecure.example');
    expect(registry.authorities.find((authority) => authority.domain === 'insecure.example')?.url)
      .toBe('http://insecure.example');
  });

  it('handles a city entity without labels and sends the run language plus English for local labels', async () => {
    const languagesSeen: string[] = [];
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params): Promise<{ data: unknown }> => {
        if (params.action === 'wbgetentities') {
          languagesSeen.push(params.languages ?? '');
          const ids = (params.ids ?? '').split('|');
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            entities[qid] = qid === 'Q2'
              ? { id: 'Q2', claims: { P131: [] } }
              : wikibaseEntity(qid, {
                claims: {
                  P856: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: 'https://www.barcelona.cat' } },
                  }],
                  P131: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q10' } } },
                  }],
                },
              });
          }
          return { data: { entities } };
        }
        return {
          data: {
            query: { pages: [{ revisions: [{ revid: 7, timestamp: '2026-08-01T10:00:00Z' }] }] },
          },
        };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q2', language: 'ca',
    });

    expect(languagesSeen.every((language) => language === 'ca|en')).toBe(true);
    expect(registry.authorities.some((authority) => authority.domain === 'www.barcelona.cat')).toBe(true);
  });

  it('collects labels in the run language and English for identity matching', async () => {
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params) => {
        if (params.action === 'wbgetentities') {
          const ids = (params.ids ?? '').split('|');
          return { data: { entities: Object.fromEntries(ids.map((qid) => [
            qid,
            {
              id: qid,
              labels: {
                es: { language: 'es', value: 'Nombre es' },
                en: { language: 'en', value: 'English name' },
              },
              aliases: {},
              claims: {},
            },
          ])) } };
        }
        return { data: { query: { pages: [] } } };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q10', language: 'es',
    });

    expect(registry.labels).toEqual(expect.arrayContaining(['Nombre es', 'English name']));
  });

  it('records revisions for the place, the city and the administrative ancestors', async () => {
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params) => {
        if (params.action === 'wbgetentities') {
          const ids = (params.ids ?? '').split('|');
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            entities[qid] = qid === 'Q10'
              ? wikibaseEntity('Q10', {
                claims: {
                  P856: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: 'https://www.city.example' } },
                  }],
                  P131: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q90' } } },
                  }],
                },
              })
              : wikibaseEntity(qid);
          }
          return { data: { entities } };
        }
        return { data: { query: { pages: [
          { title: 'Q1', revisions: [{ revid: 11, timestamp: '2026-08-01T10:00:00Z' }] },
          { title: 'Q10', revisions: [{ revid: 12, timestamp: '2026-08-01T11:00:00Z' }] },
          { title: 'Q90', revisions: [{ revid: 13, timestamp: '2026-08-01T12:00:00Z' }] },
        ] } } };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q10', language: 'es',
    });

    const byQid = Object.fromEntries(registry.authorities.map((authority) => [authority.qid, authority]));
    expect(byQid.Q1?.wikidataRevision?.revisionId).toBe(11);
    expect(byQid.Q10?.wikidataRevision?.revisionId).toBe(12);
    expect(byQid.Q90?.wikidataRevision?.revisionId).toBe(13);
  });

  it('follows every P131 entity per administrative level instead of only the first', async () => {
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params) => {
        if (params.action === 'wbgetentities') {
          const ids = (params.ids ?? '').split('|');
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            const claims: Record<string, unknown> = {
              P856: [{
                rank: 'normal',
                mainsnak: { snaktype: 'value', datavalue: { value: `https://www.${qid.toLowerCase()}.example` } },
              }],
            };
            if (qid === 'Q10') {
              claims.P131 = [
                { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q90' } } } },
                { rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q91' } } } },
              ];
            } else if (qid === 'Q90' || qid === 'Q91') {
              claims.P131 = [{
                rank: 'normal',
                mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q95' } } },
              }];
            }
            entities[qid] = wikibaseEntity(qid, { claims });
          }
          return { data: { entities } };
        }
        return { data: { query: { pages: [] } } };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q10', language: 'es',
    });

    const level1 = registry.authorities.filter((authority) => authority.origin === 'admin_level_1');
    const level2 = registry.authorities.filter((authority) => authority.origin === 'admin_level_2');
    expect(level1.map((authority) => authority.qid).sort()).toEqual(['Q90', 'Q91']);
    expect(level2.map((authority) => authority.qid).sort()).toEqual(['Q95']);
  });

  it('walks at most three administrative levels', async () => {    let ancestorEntityCalls = 0;
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params): Promise<{ data: unknown }> => {
        if (params.action === 'wbgetentities') {
          const ids = (params.ids ?? '').split('|');
          if (ids.length === 1) {
            const base = Number(ids[0].slice(1));
            if (base >= 90) ancestorEntityCalls += 1;
          }
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            const base = Number(qid.slice(1));
            const nextP131 = base === 10
              ? 'Q90'
              : base >= 90 && base < 93 ? `Q${base + 1}` : null;
            entities[qid] = wikibaseEntity(qid, {
              claims: {
                P856: [{
                  rank: 'normal',
                  mainsnak: { snaktype: 'value', datavalue: { value: { url: 'https://www.example.org' } } },
                }],
                ...(nextP131 ? {
                  P131: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: { id: nextP131 } } },
                  }],
                } : {}),
              },
            });
          }
          return { data: { entities } };
        }
        return {
          data: {
            query: { pages: [{ revisions: [{ revid: 1, timestamp: '2026-01-01T00:00:00Z' }] }] },
          },
        };
      },
    });

    await provider.resolveAuthorities({ qid: 'Q1', cityQid: 'Q10', language: 'es' });
    expect(ancestorEntityCalls).toBeLessThanOrEqual(3);
  });

  it('processes P131 branches larger than 50 in chunks without dropping any ancestor', async () => {
    let entityCalls = 0;
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params): Promise<{ data: unknown }> => {
        if (params.action === 'wbgetentities') {
          const ids = String(params.ids ?? '').split('|');
          entityCalls += 1;
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            if (qid === 'Q1') {
              entities[qid] = wikibaseEntity('Q1', {
                claims: {
                  P856: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: 'https://www.example.org' } },
                  }],
                },
              });
            } else if (qid === 'Q10') {
              entities[qid] = wikibaseEntity('Q10', {
                claims: {
                  P131: Array.from({ length: 51 }, (_, index) => ({
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: { id: `Q10${String(index).padStart(2, '0')}` } } },
                  })),
                },
              });
            } else if (/^Q10\d\d$/u.test(qid)) {
              entities[qid] = wikibaseEntity(qid, {
                claims: {
                  P856: [{
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: `https://www.${qid.toLowerCase()}.example` } },
                  }],
                },
              });
            }
          }
          return { data: { entities } };
        }
        return { data: { query: { pages: [] } } };
      },
    });

    const registry = await provider.resolveAuthorities({
      qid: 'Q1', cityQid: 'Q10', language: 'es',
    });
    const level1 = registry.authorities.filter((authority) => authority.origin === 'admin_level_1');
    expect(level1.length).toBe(51);
    expect(entityCalls).toBeGreaterThanOrEqual(2);
  });

  it('resolves the Wikipedia sitelink even after the entity cache was populated without sitelinks', async () => {
    const provider = new WikidataAuthorityProviderV7({
      get: async (_url, params): Promise<{ data: unknown }> => {
        if (params.action === 'wbgetentities') {
          const ids = String(params.ids ?? '').split('|');
          const entities: Record<string, Record<string, unknown>> = {};
          for (const qid of ids) {
            entities[qid] = {
              id: qid,
              labels: { es: { value: 'Alcazaba' } },
              aliases: {},
              claims: {},
              ...(String(params.props).includes('sitelinks')
                ? { sitelinks: { eswiki: { site: 'eswiki', title: 'Alcazaba de Málaga' } } }
                : {}),
            };
          }
          return { data: { entities } };
        }
        return { data: { query: { pages: [] } } };
      },
    });
    await provider.resolveAuthorities({ qid: 'Q1', cityQid: 'Q10', language: 'es' });
    const sitelink = await provider.resolveWikipediaSitelinkV8({ qid: 'Q1', language: 'es' });

    expect(sitelink.title).toBe('Alcazaba de Málaga');
  });
});

describe('buildAdaptiveSearchPlanV7', () => {
  it('produces up to four deterministic queries and maps at most three official domains', () => {
    const plan = buildAdaptiveSearchPlanV7({
      stopName: 'Sagrada Família',
      aliases: ['Templo Expiatorio'],
      officialDomains: ['www.barcelona.cat', 'www.gencat.cat', 'museu.cat', 'extra.cat'],
      language: 'ca',
      countryCode: 'ES',
    });

    expect(plan.deterministicQueries.length).toBe(NARRATIVE_STOP_BUDGET_V7.deterministicQueries);
    expect(plan.mappedDomains.length).toBe(NARRATIVE_STOP_BUDGET_V7.mappedDomains);
    expect(plan.mappedDomains).not.toContain('extra.cat');
    expect(plan.adaptiveQueries).toEqual([]);
    expect(plan.sufficient).toBe(false);
  });

  it('uses aliases in deterministic queries', () => {
    const plan = buildAdaptiveSearchPlanV7({
      stopName: 'Sagrada Família',
      aliases: ['Templo Expiatorio de la Sagrada Familia'],
      officialDomains: [],
      language: 'ca',
      countryCode: 'ES',
    });

    expect(plan.deterministicQueries.join(' ')).toContain('Sagrada Família');
    expect(plan.deterministicQueries.join(' ')).toContain('Templo Expiatorio');
  });
});

describe('applyRegistryAuthorityV7', () => {
  const registry: NarrativeAuthorityRegistryV7 = {
    authorities: [{ domain: 'www.barcelona.cat', origin: 'place_p856', qid: 'Q1', wikidataRevision: null, url: null }],
    aliases: ['Templo Expiatorio'],
    labels: ['Sagrada Família'],
  };

  it('promotes a registered official domain to primary_authority', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.barcelona.cat/sagrada-familia',
      title: 'Sagrada Família',
      description: '',
      engine: 'searxng-json',
      authority: { tier: 'discovery_only', publisherKey: 'barcelona.cat', rule: 'unregistered_awaiting_registry' },
    };

    const promoted = applyRegistryAuthorityV7(result, registry);
    expect(promoted.authority.tier).toBe('primary_authority');
    expect(promoted.authority.rule).toBe('registered_p856:place_p856');
  });

  it('leaves unregistered domains untouched', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.elpais.com/cultura',
      title: 'Cultura',
      description: '',
      engine: 'searxng-json',
      authority: { tier: 'discovery_only', publisherKey: 'elpais.com', rule: 'unregistered_awaiting_registry' },
    };

    const kept = applyRegistryAuthorityV7(result, registry);
    expect(kept.authority.tier).toBe('discovery_only');
  });
});

describe('classifyAgainstRegistryV7', () => {
  const registry: NarrativeAuthorityRegistryV7 = {
    authorities: [{ domain: 'www.barcelona.cat', origin: 'place_p856', qid: 'Q1', wikidataRevision: null, url: null }],
    aliases: ['Templo Expiatorio'],
    labels: ['Sagrada Família'],
  };

  it('promotes then degrades a registered domain page that matches no alias', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.barcelona.cat/agenda/deportes',
      title: 'Agenda deportiva',
      description: 'Eventos',
      engine: 'searxng-json',
      authority: { tier: 'discovery_only', publisherKey: 'barcelona.cat', rule: 'unregistered_awaiting_registry' },
    };

    const classified = classifyAgainstRegistryV7(result, registry, 'Sagrada Família');
    expect(classified.authority.tier).toBe('discovery_only');
    expect(classified.authority.rule).toBe('degraded_identity_mismatch');
  });

  it('keeps a registered matching page as primary authority', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.barcelona.cat/sagrada-familia',
      title: 'Templo Expiatorio de la Sagrada Familia',
      description: 'Página oficial',
      engine: 'searxng-json',
      authority: { tier: 'discovery_only', publisherKey: 'barcelona.cat', rule: 'unregistered_awaiting_registry' },
    };

    const classified = classifyAgainstRegistryV7(result, registry, 'Sagrada Família');
    expect(classified.authority.tier).toBe('primary_authority');
  });
});

describe('degradeAuthorityForMismatch', () => {
  const registry: NarrativeAuthorityRegistryV7 = {
    authorities: [{ domain: 'www.barcelona.cat', origin: 'place_p856', qid: 'Q1', wikidataRevision: null, url: null }],
    aliases: ['Templo Expiatorio'],
    labels: ['Sagrada Família'],
  };

  it('keeps an official domain result when it matches an alias', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.barcelona.cat/sagrada-familia',
      title: 'Templo Expiatorio de la Sagrada Familia',
      description: 'Página oficial',
      engine: 'searxng-json',
      authority: { tier: 'primary_authority', publisherKey: 'barcelona.cat', rule: 'official_registry' },
    };

    const kept = degradeAuthorityForMismatch(result, registry, 'Sagrada Família');
    expect(kept.authority.tier).toBe('primary_authority');
  });

  it('matches using registry labels with accent normalization', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.barcelona.cat/templo',
      title: 'Visita al templo de la Sagrada Familia',
      description: '',
      engine: 'searxng-json',
      authority: { tier: 'primary_authority', publisherKey: 'barcelona.cat', rule: 'official_registry' },
    };

    const kept = degradeAuthorityForMismatch(result, registry, 'Sagrada Familia');
    expect(kept.authority.tier).toBe('primary_authority');
  });

  it('degrades an official domain result to discovery when the page matches no alias', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.barcelona.cat/agenda/evento-deportivo',
      title: 'Agenda deportiva',
      description: 'Eventos',
      engine: 'searxng-json',
      authority: { tier: 'primary_authority', publisherKey: 'barcelona.cat', rule: 'official_registry' },
    };

    const degraded = degradeAuthorityForMismatch(result, registry, 'Sagrada Família');
    expect(degraded.authority.tier).toBe('discovery_only');
    expect(degraded.authority.rule).toBe('degraded_identity_mismatch');
  });

  it('leaves unregistered domains untouched', () => {
    const result: NarrativeDiscoveryResultV7 = {
      url: 'https://www.elpais.com/cultura',
      title: 'Cultura',
      description: '',
      engine: 'searxng-json',
      authority: { tier: 'established_source', publisherKey: 'elpais.com', rule: 'editorial_registry' },
    };

    const kept = degradeAuthorityForMismatch(result, registry, 'Sagrada Família');
    expect(kept.authority.tier).toBe('established_source');
  });
});
