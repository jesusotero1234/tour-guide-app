import {
  NarrativeCuratorOutputV8,
  NarrativeRoleV8,
  NARRATIVE_ROLES_V8,
} from './NarrativeDossierV8';
import {
  NarrativeCuratorPacketV8,
  NarrativeResearchServicesV8,
  NARRATIVE_RESEARCH_BUDGET_V8,
  NARRATIVE_ADAPTIVE_QUERY_GUIDANCE_V8,
  NARRATIVE_CURATOR_SUPPORT_GUIDANCE_V8,
  buildCuratorPacketV8,
  curatorRoleGuidanceV8,
  meetsNarrativeRichnessTargetV8,
  researchNarrativeStopV8,
} from './NarrativeResearchV8';
import { NarrativeCapturedSourceV8, NarrativeDiscoveryResultV7 } from './NarrativeSourcesV7';
import { NarrativeEvidenceSpanV7, segmentCaptureIntoSpansV7 } from './NarrativeSpansV7';
import { NarrativeAuthorityRegistryV7 } from './NarrativeAuthoritiesV7';

const REGISTRY: NarrativeAuthorityRegistryV7 = {
  authorities: [
    {
      domain: 'www.malaga.es',
      origin: 'place_p856',
      qid: 'Q1',
      wikidataRevision: null,
      url: 'https://www.malaga.es/alcazaba',
    },
  ],
  aliases: ['Málaga'],
  labels: ['Málaga'],
};

function wikipediaSource(
  sourceId: string,
  content: string
): NarrativeCapturedSourceV8 {
  return {
    sourceId,
    requestedUrl: `https://${sourceId}.wikipedia.org/wiki/Articulo`,
    finalUrl: `https://${sourceId}.wikipedia.org/wiki/Articulo`,
    title: 'Artículo',
    capturedAt: '2026-08-01T10:00:00Z',
    content,
    fingerprint: `f-${sourceId}`,
    authority: {
      tier: 'established_source',
      publisherKey: 'wikimedia',
      rule: 'wikimedia_qid_match',
    },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
    sourceKind: 'wikipedia_api',
    entityQid: 'Q1',
    publisherKey: 'wikimedia',
  };
}

function officialSource(
  sourceId: string,
  content: string
): NarrativeCapturedSourceV8 {
  return {
    sourceId,
    requestedUrl: `https://www.malaga.es/${sourceId}`,
    finalUrl: `https://www.malaga.es/${sourceId}`,
    title: 'Alcazaba de Málaga',
    capturedAt: '2026-08-01T10:00:00Z',
    content,
    fingerprint: `f-${sourceId}`,
    authority: {
      tier: 'primary_authority',
      publisherKey: 'www.malaga.es',
      rule: 'registered_p856:place_p856',
    },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
    sourceKind: 'official_web',
    entityQid: null,
    publisherKey: 'www.malaga.es',
  };
}

function curatorFromSpans(packet: NarrativeCuratorPacketV8): NarrativeCuratorOutputV8 {
  const bySource = new Map<string, typeof packet.spans>();
  for (const span of packet.spans) {
    const list = bySource.get(span.sourceId) ?? [];
    list.push(span);
    bySource.set(span.sourceId, list);
  }
  const sourceOrder = ['es-wiki', 'municipal'];
  const used = new Set<string>();
  const propositions = NARRATIVE_ROLES_V8.map((role, index) => {
    const preferredSource = sourceOrder[index % sourceOrder.length];
    const preferred = bySource.get(preferredSource) ?? packet.spans;
    const span = preferred.find((candidate) => !used.has(candidate.evidenceSpanId))
      ?? packet.spans.find((candidate) => !used.has(candidate.evidenceSpanId))!;
    used.add(span.evidenceSpanId);
    return {
      text: `Proposición de ${role} basada en el fragmento ${span.evidenceSpanId}.`,
      role,
      certainty: 'high' as const,
      interpretation: 'direct' as const,
      supports: [{
        sourceId: span.sourceId,
        evidenceSpanIds: [span.evidenceSpanId],
      }],
    };
  });
  return {
    propositions,
    authorizedNames: [],
    authorizedNumbers: [],
    discrepancies: [],
    limits: [],
  };
}

function curatorForRoles(
  packet: NarrativeCuratorPacketV8,
  roles: NarrativeRoleV8[]
): NarrativeCuratorOutputV8 {
  const used = new Set<string>();
  return {
    propositions: roles.map((role) => {
      const span = packet.spans.find((candidate) => !used.has(candidate.evidenceSpanId))!;
      used.add(span.evidenceSpanId);
      return {
        text: `Proposición de ${role} basada en el fragmento ${span.evidenceSpanId}.`,
        role,
        certainty: 'high' as const,
        interpretation: 'direct' as const,
        supports: [{ sourceId: span.sourceId, evidenceSpanIds: [span.evidenceSpanId] }],
      };
    }),
    authorizedNames: [],
    authorizedNumbers: [],
    discrepancies: [],
    limits: [],
  };
}

function baselineServicesV8(
  overrides: Partial<NarrativeResearchServicesV8> = {}
): NarrativeResearchServicesV8 {
  const wiki = wikipediaSource('es-wiki', [
    'Se observa la torre y el lienzo de la muralla.',
    'Construida en el siglo XI sobre una fortificación anterior.',
    'Fue residencia histórica de los gobernadores musulmanes durante siglos.',
    'El abandono histórico contrasta con su recuperación contemporánea.',
    'Su rasgo distintivo es el sistema de doble muralla.',
  ].join('\n\n'));
  return {
    resolveIdentity: async () => ({
      qid: 'Q1',
      labels: ['Alcazaba'],
      aliases: [],
      wikipediaTitle: 'Alcazaba de Málaga',
      revision: null,
    }),
    resolveAuthorities: async () => REGISTRY,
    resolveQidFromWikipedia: async () => 'Q1',
    captureWikipedia: async () => wiki,
    search: async () => [],
    mapOfficialSite: async () => [],
    captureWeb: async () => officialSource('municipal', wiki.content),
    curate: async (packet) => curatorFromSpans(packet),
    proposeAdaptiveQueries: async () => [],
    ...overrides,
  };
}

const BASE_INPUT = {
  runId: 'research-test',
  stopId: 'Q1',
  stopName: 'Alcazaba',
  cityName: 'Málaga',
  cityQid: 'Q10',
  countryCode: 'ES',
  language: 'es',
  required: false,
};

describe('researchNarrativeStopV8', () => {
  it('meetsNarrativeRichnessTargetV8 enforces proposition and visual anchor thresholds', () => {
    const target = {
      stopId: 'Q1',
      targetSeconds: 300,
      targetWords: 700,
      minPropositions: 7,
      maxPropositions: 11,
      minVisualAnchors: 2,
    };

    const fiveRoles: NarrativeRoleV8[] = [
      'visible_observation',
      'chronology_or_transformation',
      'human_agency_or_lived_function',
      'tension_or_contrast',
      'distinctive_trait',
    ];
    expect(meetsNarrativeRichnessTargetV8(fiveRoles, target)).toBe(false);

    const sevenRolesOneVisual: NarrativeRoleV8[] = [
      'visible_observation',
      'chronology_or_transformation',
      'human_agency_or_lived_function',
      'tension_or_contrast',
      'chronology_or_transformation',
      'chronology_or_transformation',
      'human_agency_or_lived_function',
    ];
    expect(meetsNarrativeRichnessTargetV8(sevenRolesOneVisual, target)).toBe(false);

    const sevenRolesTwoVisual: NarrativeRoleV8[] = [
      'visible_observation',
      'chronology_or_transformation',
      'human_agency_or_lived_function',
      'tension_or_contrast',
      'distinctive_trait',
      'visible_observation',
      'chronology_or_transformation',
    ];
    expect(meetsNarrativeRichnessTargetV8(sevenRolesTwoVisual, target)).toBe(true);

    expect(meetsNarrativeRichnessTargetV8(fiveRoles, undefined)).toBe(true);
  });

  it('shares role semantics with repair curation and adaptive query planning', () => {
    const repairGuidance = curatorRoleGuidanceV8(['tension_or_contrast']).join(' ');
    expect(repairGuidance).toContain('destrucción/reconstrucción');
    expect(repairGuidance).toContain('ronda de reparación');
    expect(repairGuidance).toContain('Prioriza primero: tension_or_contrast');
    expect(NARRATIVE_ADAPTIVE_QUERY_GUIDANCE_V8.join(' ')).toContain('abandono/recuperación');

    const supportGuidance = NARRATIVE_CURATOR_SUPPORT_GUIDANCE_V8.join(' ');
    expect(supportGuidance).toContain('1-3');
    expect(supportGuidance).toContain('0026');
    expect(supportGuidance).toContain('0027');
    expect(supportGuidance).toContain('0030');
    expect(supportGuidance).toContain('objetos support separados');
    expect(supportGuidance).toContain('proposiciones atómicas');
    expect(supportGuidance).toContain('diez');
    expect(supportGuidance).toContain('10');
    expect(supportGuidance).toContain('authorizedNumbers');
  });

  it('produces API sources when SearXNG returns nothing and Firecrawl would 403 on Wikimedia', async () => {
    const es = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const en = wikipediaSource('en-wiki', [
      'The alcazaba overlooks the city from the hill.',
      'It was rebuilt during the Nasrid period.',
      'It served as a fortress and residence.',
      'It contrasts with the modern port below.',
      'Its distinctive feature is the double wall.',
    ].join('\n\n'));
    let searchCalls = 0;
    let webCaptureCalls = 0;
    const webCaptureRequestClasses: string[] = [];
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: { revisionId: 42, timestamp: '2026-08-01T10:00:00Z' },
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async ({ expectedQid }) => (
        expectedQid === 'Q1' ? es : null
      ),
      search: async () => {
        searchCalls += 1;
        return [];
      },
      mapOfficialSite: async () => [],
      captureWeb: async (input) => {
        webCaptureCalls += 1;
        webCaptureRequestClasses.push(input.requestClass);
        throw new Error('Firecrawl 403 on Wikimedia HTML');
      },
      curate: async (packet) => {
        const roles: NarrativeRoleV8[] = ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function'];
        const used = new Set<string>();
        const propositions = roles.map((role) => {
          const span = packet.spans.find((candidate) => !used.has(candidate.evidenceSpanId))!;
          used.add(span.evidenceSpanId);
          return {
            text: `Proposición de ${role} basada en el fragmento ${span.evidenceSpanId}.`,
            role,
            certainty: 'high' as const,
            interpretation: 'direct' as const,
            supports: [{
              sourceId: span.sourceId,
              evidenceSpanIds: [span.evidenceSpanId],
            }],
          };
        });
        return {
          propositions,
          authorizedNames: [],
          authorizedNumbers: [],
          discrepancies: [],
          limits: [],
        };
      },
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(webCaptureCalls).toBe(1);
    expect(webCaptureRequestClasses).toEqual(['place_exact']);
    expect(searchCalls).toBeGreaterThan(0);
    expect(result.stats.capturedSourceCount).toBe(1);
    expect(result.captures.every((capture) => capture.sourceKind === 'wikipedia_api')).toBe(true);
    expect(result.status).toBe('sufficient');
    if (result.status === 'sufficient') {
      expect(result.evidenceTier).toBe('C');
      expect(result.routeEligible).toBe(true);
      expect(result.gates.minimumEvidenceReady).toBe(true);
      expect(result.gates.writerReady).toBe(false);
      expect(result.stats.publisherCount).toBe(1);
      expect(result.stats.curationCount).toBe(2);
    }
  });

  it('stops researching and returns sufficient once writerReady is reached', async () => {
    const wiki = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const official = officialSource('municipal', [
      'La visita permite observar el recinto amurallado.',
      'Las obras comenzaron en el siglo XI.',
      'El ayuntamiento gestiona el uso público del recinto.',
      'El contraste con el puerto es evidente.',
      'El rasgo único es su sistema de doble muralla.',
    ].join('\n\n'));
    let searches = 0;
    let adaptiveCalls = 0;
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => {
        searches += 1;
        return [{
          url: 'https://www.malaga.es/alcazaba',
          title: 'Alcazaba',
          description: 'Alcazaba de Málaga',
          engine: 'searxng-json',
          authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
        } as NarrativeDiscoveryResultV7];
      },
      mapOfficialSite: async () => [],
      captureWeb: async () => official,
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => {
        adaptiveCalls += 1;
        return [];
      },
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    if (result.status !== 'sufficient') return;
    expect(searches).toBe(0);
    expect(adaptiveCalls).toBe(0);
    expect(result.dossier.sufficiency.isSufficient).toBe(true);
    expect(result.gates.writerReady).toBe(true);
  });

  it('never calls Firecrawl for discovery_only URLs and caps attempts and curations', async () => {
    const wiki = wikipediaSource('es-wiki', 'Contenido del artículo de la parada.');
    let webCaptureCalls = 0;
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => Array.from({ length: 20 }, (_, index) => ({
        url: `https://www.other${index}.example/p${index}`,
        title: 'Otro',
        description: 'no autorizado',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'other.example', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7)),
      mapOfficialSite: async () => [],
      captureWeb: async () => {
        webCaptureCalls += 1;
        return officialSource('x', 'Contenido.');
      },
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(webCaptureCalls).toBe(1);
    expect(result.captureLog.some((entry) => entry.outcome === 'skipped_discovery_only')).toBe(true);
    expect(result.stats.attemptedUrlCount).toBeLessThanOrEqual(12);
    expect(result.stats.curationCount).toBeLessThanOrEqual(2);
  });

  it('filters generic map links before attempting deterministic search results', async () => {
    const wiki = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const official = officialSource('municipal', [
      'La visita permite observar el recinto amurallado.',
      'Las obras comenzaron en el siglo XI.',
      'El ayuntamiento gestiona el uso público del recinto.',
      'El contraste con el puerto es evidente.',
      'El rasgo único es su sistema de doble muralla.',
    ].join('\n\n'));
    const alcazabaUrl = 'https://www.malaga.es/es/laprovincia/patrimonio/lis_cd-3816/alcazaba-de-malaga';
    const delegationUrls = Array.from({ length: 10 }, (_, index) => (
      `https://www.malaga.es/delegacion${index}`
    ));
    const homepageRegistry: NarrativeAuthorityRegistryV7 = {
      authorities: [{
        domain: 'www.malaga.es',
        origin: 'city_p856',
        qid: 'Q10',
        wikidataRevision: null,
        url: 'https://www.malaga.es/',
      }],
      aliases: ['Málaga'],
      labels: ['Málaga'],
    };
    const webCaptureUrls: string[] = [];
    const webCaptureRequestClasses: string[] = [];
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => homepageRegistry,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => [{
        url: alcazabaUrl,
        title: 'Alcazaba de Málaga',
        description: 'Patrimonio de la provincia',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7],
      mapOfficialSite: async () => delegationUrls.map((url) => ({
        url,
        title: 'Delegación',
        description: '',
        engine: 'map',
        authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7)),
      captureWeb: async (input) => {
        const url = input.url;
        webCaptureUrls.push(url);
        webCaptureRequestClasses.push(input.requestClass);
        if (url.includes('alcazaba')) return official;
        return {
          ...official,
          sourceId: `delegation-${webCaptureUrls.length}`,
          requestedUrl: url,
          finalUrl: url,
          title: 'Delegación',
          content: 'Portal institucional de la delegación.',
        };
      },
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    expect(webCaptureUrls).not.toContain('https://www.malaga.es/');
    const alcazabaIndex = webCaptureUrls.findIndex((url) => url.includes('alcazaba'));
    const firstDelegationIndex = webCaptureUrls.findIndex((url) => url.includes('delegacion'));
    expect(alcazabaIndex).toBeGreaterThanOrEqual(0);
    expect(webCaptureRequestClasses[alcazabaIndex]).toBe('discovered_secondary');
    expect(firstDelegationIndex).toBe(-1);
    expect(result.captureLog.some((entry) => (
      entry.phase === 'map'
      && entry.outcome === 'skipped_discovery_only'
      && entry.errorClassification === 'identity_mismatch'
    ))).toBe(true);
  });

  it('does not repeat a successful scrape whose content misses the stop identity', async () => {
    const wiki = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const official = officialSource('municipal', [
      'La visita permite observar el recinto amurallado.',
      'Las obras comenzaron en el siglo XI.',
      'El ayuntamiento gestiona el uso público del recinto.',
      'El contraste con el puerto es evidente.',
      'El rasgo único es su sistema de doble muralla.',
    ].join('\n\n'));
    const alcazabaUrl = 'https://www.malaga.es/es/laprovincia/patrimonio/lis_cd-3816/alcazaba-de-malaga';
    const callsByUrl = new Map<string, number>();
    const homepageRegistry: NarrativeAuthorityRegistryV7 = {
      authorities: [{
        domain: 'www.malaga.es',
        origin: 'city_p856',
        qid: 'Q10',
        wikidataRevision: null,
        url: 'https://www.malaga.es/',
      }],
      aliases: ['Málaga'],
      labels: ['Málaga'],
    };
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => homepageRegistry,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => [{
        url: alcazabaUrl,
        title: 'Alcazaba de Málaga',
        description: 'Patrimonio de la provincia',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7],
      mapOfficialSite: async () => [],
      captureWeb: async (input) => {
        const url = input.url;
        const calls = (callsByUrl.get(url) ?? 0) + 1;
        callsByUrl.set(url, calls);
        if (url.includes('alcazaba') && calls >= 2) return official;
        return {
          ...official,
          sourceId: `partial-${calls}`,
          requestedUrl: url,
          finalUrl: url,
          title: 'Portal institucional',
          content: 'Contenido parcial sin el nombre de la parada.',
        };
      },
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(callsByUrl.get(alcazabaUrl)).toBe(1);
    expect(result.status).toBe('evidence_review_required');
    expect(result.captureLog.some((entry) => (
      entry.requestedUrl === alcazabaUrl && entry.outcome === 'capture_rejected'
    ))).toBe(true);
  });

  it('builds deterministic queries with the disambiguated name and no quotes', async () => {
    const queries: string[] = [];
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wikipediaSource('es-wiki', 'Contenido del artículo.'),
      search: async (input) => {
        queries.push(input.query);
        return [];
      },
      mapOfficialSite: async () => [],
      captureWeb: async () => officialSource('x', 'Contenido.'),
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    await researchNarrativeStopV8(BASE_INPUT, services);

    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]).toBe('site:www.malaga.es Alcazaba de Málaga');
    expect(queries).toContain('Alcazaba de Málaga historia transformación');
    expect(queries.every((query) => !query.startsWith('"'))).toBe(true);
  });

  it('preserves independent publisher diversity before filling remaining span budget', () => {
    const maxSpans = NARRATIVE_RESEARCH_BUDGET_V8.packetMaxSpans;
    const wikiContent = Array.from({ length: maxSpans }, (_, index) =>
      `Alcazaba de Málaga torre ${index} lienzo muralla.`
    ).join('\n\n');
    const wiki = wikipediaSource('es-wiki', wikiContent);
    const official = officialSource('municipal', [
      '![Alcazaba de Málaga](https://www.malaga.es/alcazaba.jpg)',
      'Visitas guiadas',
      'La visita permite observar el recinto amurallado desde el acceso principal.',
      'Las obras del conjunto defensivo comenzaron durante el siglo XI en Málaga.',
      'Los gobernadores musulmanes habitaron este recinto durante su etapa palaciega.',
      'El sistema de doble muralla constituye un rasgo distintivo del monumento.',
    ].join('\n\n'));

    const wikiSpans = segmentCaptureIntoSpansV7(wiki).spans;
    const officialSpans = segmentCaptureIntoSpansV7(official).spans;
    const spansBySource = new Map<string, NarrativeEvidenceSpanV7[]>([
      [wiki.sourceId, wikiSpans],
      [official.sourceId, officialSpans],
    ]);

    const packet = buildCuratorPacketV8({
      stopId: 'Q1',
      stopName: 'Alcazaba',
      language: 'es',
      captures: [wiki, official],
      spansBySource,
      aliases: [],
    });

    const publisherKeys = new Set(packet.spans.map((span) => span.publisherKey));
    expect(publisherKeys.has('wikimedia')).toBe(true);
    expect(publisherKeys.has('www.malaga.es')).toBe(true);
    const selectedOfficialSpans = packet.spans.filter((span) => span.publisherKey === 'www.malaga.es');
    expect(selectedOfficialSpans).toHaveLength(3);
    expect(selectedOfficialSpans.every((span) => !span.text.includes('!['))).toBe(true);
    expect(packet.excludedSpanCount).toBeGreaterThan(0);
    expect(new Set(packet.spans.map((span) => span.evidenceSpanId)).size).toBe(packet.spans.length);
    expect(packet.spans.length).toBeLessThanOrEqual(maxSpans);
    const totalChars = packet.spans.reduce((sum, span) => sum + span.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(NARRATIVE_RESEARCH_BUDGET_V8.packetMaxCharacters);
  });

  it('selects spans from first, middle, and final thirds when adaptive narration target is rich', () => {
    const paragraphs = Array.from({ length: 75 }, (_, index) =>
      `La Alcazaba de Málaga conserva la torre ${index} y el lienzo de la muralla principal. ` +
      `El recinto amurallado muestra la transformación histórica del siglo XI y la función de residencia de los gobernadores. ` +
      `El sistema de doble muralla constituye un rasgo distintivo del monumento en Málaga.`
    ).join('\n\n');
    const wiki = wikipediaSource('es-wiki', paragraphs);
    const wikiSpans = segmentCaptureIntoSpansV7(wiki).spans;
    const narrationTarget = {
      stopId: 'Q1',
      targetSeconds: 360,
      targetWords: 840,
      minPropositions: 10,
      maxPropositions: 14,
      minVisualAnchors: 3,
    };
    const packet = buildCuratorPacketV8({
      stopId: 'Q1',
      stopName: 'Alcazaba',
      language: 'es',
      captures: [wiki],
      spansBySource: new Map([[wiki.sourceId, wikiSpans]]),
      aliases: [],
      narrationTarget,
    });

    expect(packet.narrationTarget).toEqual(narrationTarget);
    expect(packet.spans.length).toBeGreaterThan(40);
    expect(packet.spans.length).toBeLessThanOrEqual(56);

    const totalSpans = wikiSpans.length;
    const firstThird = new Set(wikiSpans.slice(0, Math.ceil(totalSpans / 3)).map((span) => span.evidenceSpanId));
    const middleThird = new Set(wikiSpans.slice(Math.ceil(totalSpans / 3), Math.ceil((2 * totalSpans) / 3)).map((span) => span.evidenceSpanId));
    const finalThird = new Set(wikiSpans.slice(Math.ceil((2 * totalSpans) / 3)).map((span) => span.evidenceSpanId));
    const selectedIds = new Set(packet.spans.map((span) => span.evidenceSpanId));
    expect([...selectedIds].some((id) => firstThird.has(id))).toBe(true);
    expect([...selectedIds].some((id) => middleThird.has(id))).toBe(true);
    expect([...selectedIds].some((id) => finalThird.has(id))).toBe(true);
  });

  it('filters unresolved template expressions from curator packet spans', () => {
    const wiki = wikipediaSource('es-wiki', [
      'La Alcazaba de Málaga conserva una torre visible junto a la muralla principal.',
      'Este párrafo es deliberadamente largo para superar el umbral de longitud y contiene la expresión de plantilla sin resolver ${page.title} dentro del texto capturado de Wikipedia.',
    ].join('\n\n'));
    const wikiSpans = segmentCaptureIntoSpansV7(wiki).spans;
    const packet = buildCuratorPacketV8({
      stopId: 'Q1',
      stopName: 'Alcazaba de Málaga',
      language: 'es',
      captures: [wiki],
      spansBySource: new Map([[wiki.sourceId, wikiSpans]]),
      aliases: [],
    });

    expect(packet.spans.some((span) => span.text.includes('La Alcazaba de Málaga conserva una torre visible'))).toBe(true);
    expect(packet.spans.every((span) => !span.text.includes('${'))).toBe(true);
  });

  it('ranks equally relevant primary-authority spans ahead of established-source spans', () => {
    const sharedContent = [
      'La Alcazaba de Málaga conserva una torre visible junto a la muralla principal.',
      'La Alcazaba de Málaga fue construida y transformada durante varias etapas históricas.',
      'La Alcazaba de Málaga sirvió como fortaleza y residencia de sus gobernadores.',
      'La Alcazaba de Málaga pasó del abandono histórico a una recuperación pública documentada.',
      'La Alcazaba de Málaga destaca por su sistema defensivo de doble muralla.',
    ].join('\n\n');
    const wiki = wikipediaSource('es-wiki', sharedContent);
    const official = officialSource('municipal', sharedContent);
    const packet = buildCuratorPacketV8({
      stopId: 'Q1',
      stopName: 'Alcazaba de Málaga',
      language: 'es',
      captures: [wiki, official],
      spansBySource: new Map([
        [wiki.sourceId, segmentCaptureIntoSpansV7(wiki).spans],
        [official.sourceId, segmentCaptureIntoSpansV7(official).spans],
      ]),
      aliases: [],
    });

    expect(packet.spans[0]?.publisherKey).toBe('www.malaga.es');
  });

  it('records a 403 capture failure as an attempt with its status', async () => {
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: null,
        revision: null,
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => null,
      captureWikipedia: async () => null,
      search: async () => [{
        url: 'https://www.malaga.es/alcazaba',
        title: 'Alcazaba',
        description: 'Alcazaba de Málaga',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7],
      mapOfficialSite: async () => [],
      captureWeb: async () => {
        throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
      },
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);
    const failed = result.captureLog.find((entry) => entry.outcome === 'capture_failed');

    expect(failed).toBeDefined();
    expect(failed?.httpStatus).toBe(403);
    expect(result.stats.attemptedUrlCount).toBeGreaterThan(0);
    expect(result.stats.capturedSourceCount).toBe(0);
  });

  it('promotes a Wikimedia external-link domain to established_source when search returns it and identity matches', async () => {
    const wikiContent = [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
      '',
      'Enlaces externos',
      'www.museopicassomalaga.org',
    ].join('\n');
    const wiki = wikipediaSource('es-wiki', wikiContent);
    const externalUrl = 'https://www.museopicassomalaga.org/arquitectura';
    const externalSource: NarrativeCapturedSourceV8 = {
      sourceId: 'source-external',
      requestedUrl: externalUrl,
      finalUrl: externalUrl,
      title: 'Alcazaba de Málaga - Patrimonio',
      capturedAt: '2026-08-01T10:00:00Z',
      content: [
        'La Alcazaba de Málaga permite observar el recinto amurallado.',
        'La construcción de la Alcazaba de Málaga comenzó en el siglo XI.',
        'Los gobernadores musulmanes habitaron la Alcazaba de Málaga.',
        'La transformación posterior contrasta con su origen defensivo.',
        'El sistema de doble muralla es un rasgo distintivo del monumento.',
      ].join('\n\n'),
      fingerprint: 'f-external',
      authority: { tier: 'discovery_only', publisherKey: 'museopicassomalaga.org', rule: 'unregistered' },
      containsInstructionLikeText: false,
      finalHttpStatus: 200,
      sourceKind: 'other_web',
      entityQid: null,
      publisherKey: 'museopicassomalaga.org',
    };
    const searchCalls: Array<{ query: string; limit: number }> = [];
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => ({
        authorities: [],
        aliases: ['Málaga'],
        labels: ['Málaga'],
      }),
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async (input) => {
        searchCalls.push({ query: input.query, limit: input.limit });
        if (input.query === 'site:museopicassomalaga.org Alcazaba de Málaga') {
          const unrelated = Array.from({ length: 6 }, (_, index) => ({
            url: `https://unrelated${index}.example/page${index}`,
            title: `Unrelated ${index}`,
            description: 'no autorizado',
            engine: 'searxng-json',
            authority: { tier: 'discovery_only', publisherKey: `unrelated${index}.example`, rule: 'unregistered' },
          } as NarrativeDiscoveryResultV7));
          return [...unrelated, {
            url: externalUrl,
            title: 'Alcazaba de Málaga',
            description: 'Patrimonio histórico',
            engine: 'searxng-json',
            authority: { tier: 'discovery_only', publisherKey: 'museopicassomalaga.org', rule: 'unregistered' },
          } as NarrativeDiscoveryResultV7];
        }
        return [];
      },
      mapOfficialSite: async () => [],
      captureWeb: async () => externalSource,
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    const siteCall = searchCalls.find((call) => call.query === 'site:museopicassomalaga.org Alcazaba de Málaga');
    expect(siteCall).toBeDefined();
    expect(siteCall?.limit).toBe(10);
    expect(result.stats.capturedSourceCount).toBe(2);
    const externalCapture = result.captures.find((capture) => capture.finalUrl === externalUrl);
    expect(externalCapture).toBeDefined();
    expect(externalCapture?.authority.tier).toBe('established_source');
    expect(externalCapture?.authority.rule).toBe('wikimedia_external_link_identity_verified');
    expect(result.status).toBe('sufficient');
  });

  it('does not accept a deterministic search result not in Wikimedia external links', async () => {
    const wikiContent = [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
      '',
      '== Enlaces externos ==',
      '* [https://www.patrimonioandaluz.es/alcazaba] Página oficial del patrimonio',
    ].join('\n');
    const wiki = wikipediaSource('es-wiki', wikiContent);
    const unlinkedUrl = 'https://www.unlinked-site.com/alcazaba';
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => ({
        authorities: [],
        aliases: ['Málaga'],
        labels: ['Málaga'],
      }),
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => [{
        url: unlinkedUrl,
        title: 'Alcazaba de Málaga',
        description: 'Patrimonio histórico',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'unlinked-site.com', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7],
      mapOfficialSite: async () => [],
      captureWeb: jest.fn(async (): Promise<NarrativeCapturedSourceV8> => ({
        sourceId: 'source-unlinked',
        requestedUrl: unlinkedUrl,
        finalUrl: unlinkedUrl,
        title: 'Alcazaba de Málaga',
        capturedAt: '2026-08-01T10:00:00Z',
        content: 'La Alcazaba de Málaga es un monumento histórico.',
        fingerprint: 'f-unlinked',
        authority: { tier: 'discovery_only', publisherKey: 'unlinked-site.com', rule: 'unregistered' },
        containsInstructionLikeText: false,
        finalHttpStatus: 200,
        sourceKind: 'other_web',
        entityQid: null,
        publisherKey: 'unlinked-site.com',
      })),
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.stats.capturedSourceCount).toBe(1);
    expect(result.captures.every((capture) => capture.finalUrl !== unlinkedUrl)).toBe(true);
    expect(services.captureWeb).not.toHaveBeenCalledWith({ url: unlinkedUrl });
  });

  it('does not promote a Wikimedia external-link domain when captured content lacks identity', async () => {
    const wikiContent = [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
      '',
      '== Enlaces externos ==',
      '* [https://www.patrimonioandaluz.es/alcazaba] Página oficial del patrimonio',
    ].join('\n');
    const wiki = wikipediaSource('es-wiki', wikiContent);
    const externalUrl = 'https://www.patrimonioandaluz.es/alcazaba';
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => ({
        authorities: [],
        aliases: ['Málaga'],
        labels: ['Málaga'],
      }),
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => [{
        url: externalUrl,
        title: 'Alcazaba de Málaga',
        description: 'Patrimonio histórico',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'patrimonioandaluz.es', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7],
      mapOfficialSite: async () => [],
      captureWeb: async () => ({
        sourceId: 'source-no-identity',
        requestedUrl: externalUrl,
        finalUrl: externalUrl,
        title: 'Portal de patrimonio',
        capturedAt: '2026-08-01T10:00:00Z',
        content: 'Este sitio contiene información general sobre monumentos andaluces.',
        fingerprint: 'f-no-identity',
        authority: { tier: 'discovery_only', publisherKey: 'patrimonioandaluz.es', rule: 'unregistered' },
        containsInstructionLikeText: false,
        finalHttpStatus: 200,
        sourceKind: 'other_web',
        entityQid: null,
        publisherKey: 'patrimonioandaluz.es',
      }),
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.stats.capturedSourceCount).toBe(1);
    expect(result.captures.every((capture) => capture.finalUrl !== externalUrl)).toBe(true);
  });

  it('returns evidence_review_required with tier D when dossier covers only visible_observation', async () => {
    const wiki = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => [],
      mapOfficialSite: async () => [],
      captureWeb: async () => officialSource('x', 'Contenido.'),
      curate: async (packet) => {
        const span = packet.spans[0];
        return {
          propositions: [{
            text: `Proposición de visible_observation basada en el fragmento ${span.evidenceSpanId}.`,
            role: 'visible_observation',
            certainty: 'high' as const,
            interpretation: 'direct' as const,
            supports: [{
              sourceId: span.sourceId,
              evidenceSpanIds: [span.evidenceSpanId],
            }],
          }],
          authorizedNames: [],
          authorizedNumbers: [],
          discrepancies: [],
          limits: [],
        };
      },
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('evidence_review_required');
    if (result.status !== 'evidence_review_required') return;
    expect(result.evidenceTier).toBe('D');
    expect(result.routeEligible).toBe(false);
    expect(result.gates.minimumEvidenceReady).toBe(false);
    expect(result.stats.curationCount).toBeGreaterThanOrEqual(1);
    expect(result.reasons.some((reason) => reason.includes('evidence tier D'))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('minimum evidence'))).toBe(true);
  });

  it('returns evidence_review_required with null tier when curator throws a deterministic error', async () => {
    const wiki = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => REGISTRY,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async () => [],
      mapOfficialSite: async () => [],
      captureWeb: async () => officialSource('x', 'Contenido.'),
      curate: async () => {
        throw new Error('deterministic curator failure');
      },
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('evidence_review_required');
    if (result.status !== 'evidence_review_required') return;
    expect(result.evidenceTier).toBeNull();
    expect(result.routeEligible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('curator_contract_failed'))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('deterministic curator failure'))).toBe(true);
    expect(result.reasons.every((reason) => !reason.includes('evidence tier D'))).toBe(true);
    expect(result.reasons.every((reason) => !reason.includes('authority_insufficient'))).toBe(true);
  });

  it('acquires the missing official source adaptively between curator rounds when P856 URL is null', async () => {
    const wiki = wikipediaSource('es-wiki', [
      'Se observa la torre y el lienzo de la muralla.',
      'Construida en el siglo XI sobre una fortificación anterior.',
      'Fue residencia de los gobernadores musulmanes.',
      'Contrasta con la Alcazaba de Granada.',
      'Su rasgo distintivo son los jardines de acceso.',
    ].join('\n\n'));
    const official = officialSource('municipal', [
      'La visita permite observar el recinto amurallado.',
      'Las obras comenzaron en el siglo XI.',
      'El ayuntamiento gestiona el uso público del recinto.',
      'El contraste con el puerto es evidente.',
      'El rasgo único es su sistema de doble muralla.',
    ].join('\n\n'));
    const nullUrlRegistry: NarrativeAuthorityRegistryV7 = {
      authorities: [{
        domain: 'www.malaga.es',
        origin: 'city_p856',
        qid: 'Q10',
        wikidataRevision: null,
        url: null,
      }],
      aliases: ['Málaga'],
      labels: ['Málaga'],
    };
    const adaptiveQuery = 'Alcazaba de Málaga rasgo distintivo doble muralla';
    const adaptiveMissingRoles: NarrativeRoleV8[] = [];
    const eventOrder: string[] = [];
    const services: NarrativeResearchServicesV8 = {
      resolveIdentity: async () => ({
        qid: 'Q1',
        labels: ['Alcazaba'],
        aliases: [],
        wikipediaTitle: 'Alcazaba de Málaga',
        revision: null,
      }),
      resolveAuthorities: async () => nullUrlRegistry,
      resolveQidFromWikipedia: async () => 'Q1',
      captureWikipedia: async () => wiki,
      search: async (input) => {
        if (input.query === adaptiveQuery) {
          return [{
            url: 'https://www.malaga.es/alcazaba',
            title: 'Alcazaba de Málaga',
            description: 'Patrimonio histórico',
            engine: 'searxng-json',
            authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
          } as NarrativeDiscoveryResultV7];
        }
        return [];
      },
      mapOfficialSite: async () => [],
      captureWeb: async () => {
        eventOrder.push('capture');
        return official;
      },
      curate: async (packet) => {
        eventOrder.push(`curate${eventOrder.filter((e) => e.startsWith('curate')).length + 1}`);
        if (eventOrder.filter((e) => e.startsWith('curate')).length === 1) {
          const roles: NarrativeRoleV8[] = ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function'];
          const used = new Set<string>();
          const propositions = roles.map((role) => {
            const span = packet.spans.find((candidate) => !used.has(candidate.evidenceSpanId))!;
            used.add(span.evidenceSpanId);
            return {
              text: `Proposición de ${role} basada en el fragmento ${span.evidenceSpanId}.`,
              role,
              certainty: 'high' as const,
              interpretation: 'direct' as const,
              supports: [{
                sourceId: span.sourceId,
                evidenceSpanIds: [span.evidenceSpanId],
              }],
            };
          });
          return {
            propositions,
            authorizedNames: [],
            authorizedNumbers: [],
            discrepancies: [],
            limits: [],
          };
        }
        return curatorFromSpans(packet);
      },
      proposeAdaptiveQueries: async (input) => {
        eventOrder.push('adaptive');
        adaptiveMissingRoles.push(...input.missingRoles);
        return [adaptiveQuery];
      },
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    if (result.status !== 'sufficient') return;
    expect(result.stats.curationCount).toBe(2);
    expect(result.evidenceTier).toBe('A');
    expect(result.routeEligible).toBe(true);
    expect(adaptiveMissingRoles).toEqual(['tension_or_contrast', 'distinctive_trait']);
    expect(eventOrder).toEqual(['curate1', 'adaptive', 'capture', 'curate2']);
    expect(result.captures.some((capture) => capture.sourceId === 'municipal')).toBe(true);
  });

  it('returns failed with a null tier when every external provider operation is unavailable', async () => {
    const unavailable = () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    };
    const services = baselineServicesV8({
      search: async () => unavailable(),
      mapOfficialSite: async () => unavailable(),
      captureWeb: async () => unavailable(),
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.failure.code).toBe('research_infrastructure_unavailable');
    expect(result.evidenceTier).toBeNull();
    expect(result.routeEligible).toBe(false);
    expect(result.stats.searchQueryAttempts).toBeGreaterThan(0);
    expect(result.stats.searchQuerySuccesses).toBe(0);
    expect(result.stats.mapAttempts).toBe(1);
    expect(result.stats.mapSuccesses).toBe(0);
    expect(result.stats.webCaptureAttempts).toBe(1);
    expect(result.stats.webCaptureResponses).toBe(0);
    expect(result.stats.infrastructureFailureCount).toBeGreaterThan(0);
    expect(result.captureLog.some((entry) => entry.outcome === 'provider_failed')).toBe(true);
    expect(result.captureLog.every((entry) => entry.outcome !== 'discovered')).toBe(true);
  });

  it('invalidates a Wikipedia-only tier when a provider dies after an earlier successful query', async () => {
    const registryWithoutUrl: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({ ...authority, url: null })),
    };
    let searchCalls = 0;
    const services = baselineServicesV8({
      resolveAuthorities: async () => registryWithoutUrl,
      search: async () => {
        searchCalls += 1;
        if (searchCalls === 1) return [];
        throw Object.assign(new Error('provider stopped'), { code: 'ECONNREFUSED' });
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.failure.code).toBe('research_infrastructure_unavailable');
    expect(result.stats.searchQuerySuccesses).toBe(1);
    expect(result.stats.infrastructureFailureCount).toBeGreaterThan(0);
  });

  it('keeps a legitimate full C when providers respond without additional results and skips adaptive planning', async () => {
    const healthyRegistry: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({ ...authority, url: null })),
    };
    let adaptiveCalls = 0;
    const services = baselineServicesV8({
      resolveAuthorities: async () => healthyRegistry,
      proposeAdaptiveQueries: async () => {
        adaptiveCalls += 1;
        return [];
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    if (result.status !== 'sufficient') return;
    expect(result.evidenceTier).toBe('C');
    expect(result.gates.writerReady).toBe(true);
    expect(adaptiveCalls).toBe(0);
    expect(result.stats.searchQueryAttempts).toBe(result.stats.searchQuerySuccesses);
    expect(result.stats.mapAttempts).toBe(result.stats.mapSuccesses);
    expect(result.stats.infrastructureFailureCount).toBe(0);
  });

  it('repairs missing roles in a second curation over the same captures', async () => {
    const registryWithoutUrl: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({ ...authority, url: null })),
    };
    const packets: NarrativeCuratorPacketV8[] = [];
    const services = baselineServicesV8({
      resolveAuthorities: async () => registryWithoutUrl,
      curate: async (packet) => {
        packets.push(packet);
        return packets.length === 1
          ? curatorForRoles(packet, [
            'visible_observation',
            'chronology_or_transformation',
            'human_agency_or_lived_function',
          ])
          : curatorFromSpans(packet);
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    if (result.status !== 'sufficient') return;
    expect(result.gates.writerReady).toBe(true);
    expect(result.stats.curationCount).toBe(2);
    expect(packets).toHaveLength(2);
    expect(packets[0].priorityRoles).toEqual([]);
    expect(packets[1].priorityRoles).toEqual(['tension_or_contrast', 'distinctive_trait']);
    expect(new Set(packets[1].spans.map((span) => span.sourceId))).toEqual(new Set(['es-wiki']));
  });

  it('drives targeted second-round role repair from a safely splittable first curator round', async () => {
    const registryWithoutUrl: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({ ...authority, url: null })),
    };
    const packets: NarrativeCuratorPacketV8[] = [];
    const services = baselineServicesV8({
      resolveAuthorities: async () => registryWithoutUrl,
      curate: async (packet) => {
        packets.push(packet);
        if (packets.length === 1) {
          const output = curatorForRoles(packet, [
            'visible_observation',
            'chronology_or_transformation',
            'human_agency_or_lived_function',
            'distinctive_trait',
          ]);
          const firstProposition = output.propositions[0];
          const span0 = packet.spans[0];
          const span2 = packet.spans[2];
          firstProposition.supports = [{
            sourceId: span0.sourceId,
            evidenceSpanIds: [span0.evidenceSpanId, span2.evidenceSpanId],
          }];
          return output;
        }
        return curatorFromSpans(packet);
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    if (result.status !== 'sufficient') return;
    expect(result.gates.writerReady).toBe(true);
    expect(result.stats.curationCount).toBe(2);
    expect(packets).toHaveLength(2);
    expect(packets[1].priorityRoles).toEqual(['tension_or_contrast']);
  });

  it('preserves the first valid C when the repair curation fails', async () => {
    const registryWithoutUrl: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({ ...authority, url: null })),
    };
    let curatorCalls = 0;
    const services = baselineServicesV8({
      resolveAuthorities: async () => registryWithoutUrl,
      curate: async (packet) => {
        curatorCalls += 1;
        if (curatorCalls === 2) throw new Error('repair contract failed');
        return curatorForRoles(packet, [
          'visible_observation',
          'chronology_or_transformation',
          'human_agency_or_lived_function',
        ]);
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    if (result.status !== 'sufficient') return;
    expect(result.evidenceTier).toBe('C');
    expect(result.gates.minimumEvidenceReady).toBe(true);
    expect(result.gates.writerReady).toBe(false);
    expect(result.stats.curationCount).toBe(2);
  });

  it('canonicalizes HTTP and HTTPS before consuming capture budget', async () => {
    const httpRegistry: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({
        ...authority,
        url: 'http://www.malaga.es/alcazaba',
      })),
    };
    let captureCalls = 0;
    const services = baselineServicesV8({
      resolveAuthorities: async () => httpRegistry,
      captureWeb: async () => {
        captureCalls += 1;
        return officialSource('municipal', [
          'La visita permite observar el recinto amurallado.',
          'Las obras comenzaron en el siglo XI.',
          'El ayuntamiento gestiona el uso público del recinto.',
        ].join('\n\n'));
      },
      search: async () => [{
        url: 'https://www.malaga.es/alcazaba',
        title: 'Alcazaba de Málaga',
        description: 'Patrimonio histórico',
        engine: 'searxng-json',
        authority: { tier: 'discovery_only', publisherKey: 'www.malaga.es', rule: 'unregistered' },
      } as NarrativeDiscoveryResultV7],
      curate: async (packet) => curatorForRoles(packet, [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
      ]),
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(captureCalls).toBe(1);
    expect(result.stats.webCaptureAttempts).toBe(1);
  });

  it('never normalizes unknown curator evidence into acceptance', async () => {
    const registryWithoutUrl: NarrativeAuthorityRegistryV7 = {
      ...REGISTRY,
      authorities: REGISTRY.authorities.map((authority) => ({ ...authority, url: null })),
    };
    const services = baselineServicesV8({
      resolveAuthorities: async () => registryWithoutUrl,
      curate: async (packet) => {
        const output = curatorFromSpans(packet);
        const firstProposition = output.propositions[0];
        firstProposition.supports = [{
          sourceId: packet.spans[0].sourceId,
          evidenceSpanIds: ['unknown:span:9999'],
        }];
        return output;
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('evidence_review_required');
    if (result.status !== 'evidence_review_required') return;
    expect(result.routeEligible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('curator_contract_failed') && reason.includes('unknown span'))).toBe(true);
  });

  it('recognizes official identity after the first 500 captured characters', async () => {
    const navigation = 'Navegación institucional accesibilidad menú principal. '.repeat(14);
    const lateIdentity = officialSource('late-identity', [
      navigation,
      'La Alcazaba de Málaga conserva un recinto amurallado visitable.',
      'Las obras del conjunto comenzaron durante el siglo XI.',
      'Los gobernadores musulmanes utilizaron el recinto como fortaleza y residencia.',
      'El abandono histórico contrasta con la recuperación iniciada en el siglo XX.',
      'La doble muralla constituye un rasgo distintivo.',
    ].join('\n\n'));
    lateIdentity.title = 'Portal institucional';
    let captured: NarrativeCapturedSourceV8 | undefined;
    const services = baselineServicesV8({
      captureWeb: async () => lateIdentity,
      curate: async (packet) => {
        captured = lateIdentity;
        return curatorFromSpans(packet);
      },
    });

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(result.status).toBe('sufficient');
    expect(captured).toBeDefined();
    expect(result.captures.find((source) => source.sourceId === 'late-identity')?.authority.tier)
      .toBe('primary_authority');
  });
});
