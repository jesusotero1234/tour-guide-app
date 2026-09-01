import {
  NarrativeCuratorOutputV8,
  NarrativeRoleV8,
  NARRATIVE_ROLES_V8,
} from './NarrativeDossierV8';
import {
  NarrativeCuratorPacketV8,
  NarrativeResearchServicesV8,
  NARRATIVE_RESEARCH_BUDGET_V8,
  buildCuratorPacketV8,
  researchNarrativeStopV8,
} from './NarrativeResearchV8';
import { NarrativeCapturedSourceV8, NarrativeDiscoveryResultV7 } from './NarrativeSourcesV7';
import { NarrativeEvidenceSpanV7, segmentCaptureIntoSpansV7 } from './NarrativeSpansV7';
import { NarrativeAuthorityRegistryV7 } from './NarrativeAuthoritiesV7';

const REGISTRY: NarrativeAuthorityRegistryV7 = {
  authorities: [
    {
      domain: 'www.malaga.es',
      origin: 'city_p856',
      qid: 'Q10',
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
      rule: 'registered_p856:city_p856',
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
      captureWeb: async () => {
        webCaptureCalls += 1;
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
      expect(result.stats.curationCount).toBe(1);
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

  it('attempts deterministic search results before map links at equal priority', async () => {
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
    const alcazabaIndex = webCaptureUrls.findIndex((url) => url.includes('alcazaba'));
    const firstDelegationIndex = webCaptureUrls.findIndex((url) => url.includes('delegacion'));
    expect(alcazabaIndex).toBeGreaterThanOrEqual(0);
    expect(firstDelegationIndex).toBeGreaterThan(alcazabaIndex);
  });

  it('retries a registered URL once when a transient scrape misses the identity', async () => {
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

    expect(callsByUrl.get(alcazabaUrl)).toBe(2);
    expect(result.status).toBe('sufficient');
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
    expect(queries[0]).toBe('Alcazaba de Málaga');
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
});
