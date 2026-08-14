import {
  NarrativeCanaryServicesV8,
  runNarrativeCanaryV8,
} from './NarrativeCanaryV8';
import {
  NarrativeCapturedSourceV7,
  NarrativeDiscoveryResultV7,
} from './NarrativeSourcesV7';
import { NarrativeAuthorityRegistryV7 } from './NarrativeAuthoritiesV7';
import { EssentialRouteCandidateV8 } from './EssentialRouteSelectionV8';
import { NarrativeCuratorOutputV8, NARRATIVE_ROLES_V8 } from './NarrativeDossierV8';
import { NarrativeCuratorPacketV8 } from './NarrativeResearchV8';

function candidate(
  name: string,
  wikidataId: string,
  lat: number,
  lng: number,
  category = 'other',
  options: Partial<EssentialRouteCandidateV8> = {}
): EssentialRouteCandidateV8 & { name: string } {
  return {
    name,
    wikidataId,
    coordinates: { lat, lng },
    category,
    ...options,
  };
}

function captured(content: string, url: string, title: string): NarrativeCapturedSourceV7 {
  return {
    sourceId: `source-${url.replace(/[^a-z0-9]/gi, '').slice(-24)}`,
    requestedUrl: url,
    finalUrl: url,
    title,
    capturedAt: '2026-08-01T10:00:00Z',
    content,
    fingerprint: `f-${url}`,
    authority: {
      tier: 'discovery_only',
      publisherKey: 'example.org',
      rule: 'unregistered_awaiting_registry',
    },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
  };
}

function stopNameFromQuery(query: string): string {
  const token = query.replace(/^site:\S+\s*/u, '').trim().split(/\s+/)[0] ?? '';
  return token.replace(/^["']|["']$/gu, '');
}

function titled(results: NarrativeDiscoveryResultV7[], name: string): NarrativeDiscoveryResultV7[] {
  return results.map((result) => ({
    ...result,
    title: `${name} ${result.title}`,
    description: `${name} ${result.description}`,
  }));
}

function curatorFromSpans(packet: NarrativeCuratorPacketV8): NarrativeCuratorOutputV8 {
  const used = new Set<string>();
  const propositions = NARRATIVE_ROLES_V8.map((role, index) => {
    const span = packet.spans.find((item) => !used.has(item.evidenceSpanId))!;
    used.add(span.evidenceSpanId);
    return {
      text: `Proposición de ${role} basada en ${span.evidenceSpanId}.`,
      role,
      certainty: 'high' as const,
      interpretation: 'direct' as const,
      supports: [{ sourceId: span.sourceId, evidenceSpanIds: [span.evidenceSpanId] }],
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

function servicesOver(options: {
  requiredIds?: string[];
  disagreement?: boolean;
  emptyForStopName?: string;
  redirectFinalUrl?: string;
} = {}): NarrativeCanaryServicesV8 {
  const contentByUrl: Record<string, string> = {
    'https://www.a.example/identidad': 'El lugar tiene identidad confirmada oficialmente.',
    'https://www.a.example/arquitectura': 'La arquitectura observable destaca por su estructura.',
    'https://www.a.example/historia': 'Su historia y contribución al desarrollo urbano es notable.',
    'https://www.a.example/funcion': 'Su función actual es pública y su rasgo distintivo es único.',
  };
  const results = Object.keys(contentByUrl).map((url) => ({
    url,
    title: url,
    description: 'result',
    engine: 'searxng-json',
    authority: {
      tier: 'discovery_only' as const,
      publisherKey: 'example.org',
      rule: 'unregistered_awaiting_registry',
    },
  }));
  results.push(
    ...[
      'https://www.b.example/historia',
      'https://www.b.example/funcion',
      'https://www.b.example/arquitectura',
      'https://www.b.example/identidad',
    ].map((url) => ({
      url,
      title: url,
      description: 'result',
      engine: 'searxng-json',
      authority: {
        tier: 'discovery_only' as const,
        publisherKey: 'example.org',
        rule: 'unregistered_awaiting_registry',
      },
    }))
  );
  let lastStopName = '';
  const discovery = {
    search: async ({ query }: { query: string }) => {
      lastStopName = stopNameFromQuery(query);
      if (options.emptyForStopName && lastStopName === options.emptyForStopName) return [];
      return titled(results, lastStopName).slice(0, 5);
    },
    mapOfficialSite: async () => [],
  };
  return {
    resolveCore: async () => ({
      requiredIds: options.requiredIds ?? ['Q48435'],
      disagreement: options.disagreement ?? false,
    }),
    resolveIdentity: async ({ qid }) => ({
      qid,
      labels: [],
      aliases: [],
      wikipediaTitle: null,
      revision: null,
    }),
    resolveAuthorities: async (): Promise<NarrativeAuthorityRegistryV7> => ({
      authorities: [
        { domain: 'www.a.example', origin: 'place_p856', qid: 'Q1', wikidataRevision: null, url: null },
        { domain: 'www.b.example', origin: 'place_p856', qid: 'Q1', wikidataRevision: null, url: null },
      ],
      aliases: [],
      labels: [],
    }),
    captureWikipedia: async () => null,
    discovery,
    captureProvider: async ({ url }) => ({
      ...captured(
        contentByUrl[url]
          ?? 'Contenido de respaldo con identidad, arquitectura, historia, función y rasgo distintivo.',
        url,
        lastStopName
      ),
      ...(options.redirectFinalUrl ? { finalUrl: options.redirectFinalUrl } : {}),
    }),
    curate: async (packet) => curatorFromSpans(packet),
  };
}

const baseInput = {
  runId: 'canary-test',
  city: 'Test City',
  cityQid: 'Q10',
  country: 'ES',
  language: 'es',
  theme: 'history',
  durationMinutes: 120,
  candidates: [
    candidate('Anchor', 'Q48435', 41.38, 2.17, 'religious', { landmarkTier: 'flagship' }),
    candidate('Market', 'Q222', 41.382, 2.172, 'market', { landmarkTier: 'supporting' }),
  ],
  maxStops: 3,
};

describe('runNarrativeCanaryV8', () => {
  it('approves when every final stop is writerReady', async () => {
    const result = await runNarrativeCanaryV8(baseInput, servicesOver());

    expect(result.status).toBe('ready_for_human_gate');
    expect(result.reasons).toEqual([]);
    expect(result.stops.every((stop) => stop.gates.writerReady)).toBe(true);
    expect(result.geometry?.status).toBe('walkable');
  });

  it('blocks a required stop that is not writerReady and never substitutes it', async () => {
    const result = await runNarrativeCanaryV8(
      baseInput,
      servicesOver({ emptyForStopName: 'Anchor' })
    );

    expect(result.status).toBe('review_required');
    expect(result.reasons).toContain('evidence_review_required');
    expect(result.stops.map((stop) => stop.stopId)).toContain('Q48435');
    expect(result.reserveAttempts.length).toBe(0);
  });

  it('substitutes an optional stop with one unused reserve and rebuilds route, stops and geometry', async () => {
    const services = servicesOver({ emptyForStopName: 'Market' });
    const input = {
      ...baseInput,
      maxStops: 3,
      candidates: [
        candidate('Anchor', 'Q48435', 41.38, 2.17, 'religious', { landmarkTier: 'flagship' }),
        candidate('Market', 'Q222', 41.382, 2.172, 'market', { landmarkTier: 'supporting' }),
        candidate('Second', 'Q333', 41.381, 2.173, 'museum', { landmarkTier: 'supporting' }),
        candidate('Reserve', 'Q555', 41.383, 2.175, 'market', { landmarkTier: 'supporting' }),
      ],
    };
    const result = await runNarrativeCanaryV8(input, services);

    expect(result.reserveAttempts.length).toBe(1);
    expect(result.reserveAttempts[0]).toMatchObject({
      originalStopId: 'Q222',
      reserveStopId: 'Q555',
      sufficient: true,
    });
    const stopIds = result.stops.map((stop) => stop.stopId);
    expect(stopIds).not.toContain('Q222');
    expect(stopIds).toContain('Q555');
    expect(result.selection?.route.map((item) => item.wikidataId)).toEqual(stopIds);
    const geometryStopIds = result.geometry?.blocks.flatMap((block) => block.stopIds) ?? [];
    expect(geometryStopIds).toContain('Q555');
    expect(result.status).toBe('ready_for_human_gate');
  });

  it('reports too_many_self_transfers when a substitution breaks walkability', async () => {
    const input = {
      ...baseInput,
      maxStops: 3,
      candidates: [
        candidate('Anchor', 'Q48435', 41.38, 2.17, 'religious', { landmarkTier: 'flagship' }),
        candidate('Market', 'Q222', 41.382, 2.172, 'market', { landmarkTier: 'supporting' }),
        candidate('FarSecond', 'Q333', 41.70, 2.50, 'museum', { landmarkTier: 'supporting' }),
        candidate('FarReserve', 'Q555', 41.80, 2.60, 'market', { landmarkTier: 'supporting' }),
      ],
    };
    const result = await runNarrativeCanaryV8(input, servicesOver({ emptyForStopName: 'Market' }));

    expect(result.status).toBe('review_required');
    expect(result.reasons).toContain('too_many_self_transfers');
  });

  it('blocks an empty tour as no_results instead of approving it', async () => {
    const result = await runNarrativeCanaryV8(
      { ...baseInput, candidates: [] },
      servicesOver({ requiredIds: [] })
    );

    expect(result.status).toBe('failed');
    expect(result.reasons).toContain('no_results');
    expect(result.stops).toEqual([]);
  });

  it('degrades a redirected capture and blocks the stop', async () => {
    const result = await runNarrativeCanaryV8(
      baseInput,
      servicesOver({ redirectFinalUrl: 'https://evil.example/redirected' })
    );

    expect(result.status).toBe('review_required');
    expect(result.reasons).toContain('evidence_review_required');
    expect(result.stops[0].capturedSources).toEqual([]);
  });
});
