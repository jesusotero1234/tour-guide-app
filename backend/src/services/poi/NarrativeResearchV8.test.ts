import {
  NarrativeCuratorOutputV8,
  NARRATIVE_ROLES_V8,
} from './NarrativeDossierV8';
import {
  NarrativeCuratorPacketV8,
  NarrativeResearchServicesV8,
  researchNarrativeStopV8,
} from './NarrativeResearchV8';
import { NarrativeCapturedSourceV8, NarrativeDiscoveryResultV7 } from './NarrativeSourcesV7';
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
      curate: async (packet) => curatorFromSpans(packet),
      proposeAdaptiveQueries: async () => [],
    };

    const result = await researchNarrativeStopV8(BASE_INPUT, services);

    expect(webCaptureCalls).toBe(1);
    expect(searchCalls).toBeGreaterThan(0);
    expect(result.stats.capturedSourceCount).toBe(1);
    expect(result.captures.every((capture) => capture.sourceKind === 'wikipedia_api')).toBe(true);
    expect(result.status).toBe('evidence_review_required');
    if (result.status === 'evidence_review_required') {
      expect(result.reasons.join(' ')).toContain('authority_insufficient');
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
});
