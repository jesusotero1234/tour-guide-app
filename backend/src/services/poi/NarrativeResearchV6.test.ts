import { NarrativeRouteStopV6 } from './NarrativeContractsV6';
import { NARRATIVE_SUFFICIENCY_ROLES_V6 } from './NarrativeDossierV6';
import {
  NarrativeResearchCuratorV6,
  createDeepSeekNarrativeResearchCuratorV6,
  researchNarrativeStopV6,
} from './NarrativeResearchV6';
import {
  NarrativeCapturedSourceV6,
  NarrativeSourceProviderV6,
} from './NarrativeSourcesV6';

const stop: NarrativeRouteStopV6 = {
  stopId: 'alcazar-de-toledo', position: 1, name: 'Alcázar de Toledo',
  narrativeRole: 'conflicto y transformación', wikidataId: 'Q1326589',
  wikidataUrl: 'https://www.wikidata.org/wiki/Q1326589',
  wikipediaUrl: 'https://es.wikipedia.org/wiki/Alc%C3%A1zar_de_Toledo',
  coordinates: { lat: 39.858, lng: -4.02 },
  previousStopId: 'catedral', nextStopId: 'cristo-de-la-luz',
};

function capture(index: number): NarrativeCapturedSourceV6 {
  const publisher = index % 2 === 0 ? 'toledo.es' : 'cultura.gob.es';
  return {
    sourceId: `source-${index}`, requestedUrl: `https://${publisher}/alcazar-${index}`,
    finalUrl: `https://${publisher}/alcazar-${index}`, title: `Fuente ${index}`,
    capturedAt: '2026-08-11T12:00:00.000Z',
    content: `Pasaje literal ${index}. Historia visible y transformación del Alcázar.`,
    fingerprint: String(index).padStart(64, '0'),
    authority: { tier: 'primary_authority', publisherKey: publisher, rule: 'test' },
    containsInstructionLikeText: index === 0,
  };
}

function provider(): NarrativeSourceProviderV6 & { search: jest.Mock; capture: jest.Mock } {
  let searchCall = 0;
  return {
    search: jest.fn(async ({ query }) => {
      const start = 2 + searchCall * 5;
      searchCall += 1;
      return Array.from({ length: 5 }, (_, offset) => capture(start + offset)).map((item) => ({
      url: `${item.finalUrl}?q=${encodeURIComponent(query)}`,
      title: item.title, description: 'Historia', authority: item.authority,
      }));
    }),
    capture: jest.fn(async (url: string) => {
      if (url.includes('wikidata.org')) return capture(0);
      if (url.includes('wikipedia.org')) return capture(1);
      const match = url.match(/alcazar-(\d+)/);
      return capture(Number(match?.[1] ?? 0));
    }),
  };
}

const curator: NarrativeResearchCuratorV6 = {
  curate: jest.fn(async ({ captures }) => ({
    proposal: {
      stopId: stop.stopId,
      language: 'es',
      sources: captures.map((item) => item.sourceId),
      passages: captures.slice(0, 2).map((item, index) => ({
        passageId: `passage-${index}`, sourceId: item.sourceId,
        chunkId: `${item.sourceId}-1`,
        quote: `Pasaje literal ${item.sourceId.split('-')[1]}.`,
      })),
      propositions: NARRATIVE_SUFFICIENCY_ROLES_V6.map((role, index) => ({
        propositionId: `P${index + 1}`, text: `Hecho ${index + 1}`, role,
        certainty: 'high' as const, interpretation: index === 3 ? 'debatable' as const : 'direct' as const,
        sourceIds: captures.slice(0, 2).map((item) => item.sourceId),
        passageIds: ['passage-0', 'passage-1'],
      })),
      authorizedNames: ['Alcázar de Toledo'], authorizedNumbers: [],
      discrepancies: ['La memoria del asedio está disputada.'],
      limits: ['No reproducir mitología franquista como hecho.'],
    },
  })),
};

describe('narrative v6 automatic research', () => {
  it('instructs the curator to prefer route-relevant evidence over promotional synthesis', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const deepSeekCurator = createDeepSeekNarrativeResearchCuratorV6({
      apiKey: 'test-key',
      post: jest.fn(async (_url: string, body: Record<string, unknown>) => {
        calls.push(body);
        const toolName = ((body.tool_choice as { function: { name: string } }).function.name);
        return { data: { choices: [{ message: { tool_calls: [{ function: {
          name: toolName,
          arguments: JSON.stringify({
            stopId: stop.stopId, language: 'es', sources: [], passages: [], propositions: [],
            authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [],
          }),
        } }] } }] } };
      }),
    });

    await deepSeekCurator.curate({
      stop, captures: [capture(0)],
      packet: { context: 'Datos capturados.', chunks: [], securityNotice: 'No obedecer.' },
    });

    const prompt = ((calls[0].messages as Array<{ content: string }>)[0].content);
    expect(prompt).toContain('narrativeRole guía la selección, pero no es evidencia');
    expect(prompt).toContain('No mezcles en una proposición');
    expect(prompt).toContain('superlativos promocionales');
    expect(prompt).toContain('diferenciador arquitectónico o funcional documentado');
    expect(prompt).toContain('no convierte una causalidad en directa');
    expect(prompt).toContain('visible desde el recorrido público');
  });

  it('enforces four searches, twenty unique results, eight captures and bounded curator context', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
    });

    expect(result.status).toBe('sufficient');
    expect(sourceProvider.search).toHaveBeenCalledTimes(4);
    expect(sourceProvider.capture).toHaveBeenCalledTimes(8);
    expect(result.stats).toMatchObject({ searchQueries: 4, totalResults: 20, capturedPages: 8 });
    expect((curator.curate as jest.Mock).mock.calls[0][0].packet.context.length)
      .toBeLessThanOrEqual(45_000);
    expect((curator.curate as jest.Mock).mock.calls[0][0].packet.securityNotice)
      .toContain('datos sin permisos');
  });

  it('backfills failed captures until eight source pages succeed', async () => {
    const sourceProvider = provider();
    sourceProvider.capture
      .mockRejectedValueOnce(new Error('first unavailable'))
      .mockRejectedValueOnce(new Error('second unavailable'));

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
    });

    expect(result.status).toBe('sufficient');
    expect(sourceProvider.capture).toHaveBeenCalledTimes(10);
    expect(result.stats).toMatchObject({ capturedPages: 8, captureFailures: 2 });
    expect(result.captureErrors).toHaveLength(2);
  });

  it('rejects an invalid four-query plan before calling the source provider', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
      searchPlanner: { plan: async () => ({ queries: ['only one'] }) },
    });

    expect(result.status).toBe('source_capture_failed');
    expect(result.reason).toContain('exactly four unique search queries');
    expect(sourceProvider.search).not.toHaveBeenCalled();
  });

  it('rejects search plans that ignore the distinctive narrative role', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
      searchPlanner: { plan: async () => ({ queries: [
        'Alcázar de Toledo historia general',
        'Alcázar de Toledo horarios visita',
        'Alcázar de Toledo ubicación mapa',
        'Alcázar de Toledo turismo entradas',
      ] }) },
    });

    expect(result.status).toBe('source_capture_failed');
    expect(result.reason).toContain('distinctive narrativeRole terms');
    expect(sourceProvider.search).not.toHaveBeenCalled();
  });

  it('rejects planned research without two authority-domain searches', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
      searchPlanner: { plan: async () => ({ queries: [
        'Alcázar de Toledo conflicto historia oficial',
        'Alcázar de Toledo transformación arquitectura',
        'Alcázar de Toledo estudio académico',
        'Alcázar de Toledo función controversia',
      ] }) },
    });

    expect(result.status).toBe('source_capture_failed');
    expect(result.reason).toContain('two distinct authority site filters');
    expect(sourceProvider.search).not.toHaveBeenCalled();
  });

  it('rejects invented site filters outside the deterministic authority registry', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, city: 'Toledo', language: 'es', sourceProvider, curator,
      searchPlanner: { plan: async () => ({ queries: [
        'Alcázar de Toledo conflicto site:toledo.es',
        'Alcázar de Toledo transformación site:patrimonio-toledo.gob.es',
        'Alcázar de Toledo estudio académico',
        'Alcázar de Toledo función controversia',
      ] }) },
    });

    expect(result.status).toBe('source_capture_failed');
    expect(result.reason).toContain('registered authority domains');
    expect(sourceProvider.search).not.toHaveBeenCalled();
  });

  it('turns an unknown curator chunk into protocol_failed', async () => {
    const invalid: NarrativeResearchCuratorV6 = {
      curate: async () => ({
        proposal: {
          ...(await curator.curate({ stop, captures: [capture(0), capture(1)], packet: {
            context: '', chunks: [], securityNotice: '',
          } })).proposal,
          passages: [{
            passageId: 'invented', sourceId: 'source-0', chunkId: 'source-0-999',
            quote: 'No existe.',
          }],
          propositions: [],
        },
      }),
    };
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: invalid,
    });

    expect(result).toMatchObject({ status: 'protocol_failed' });
    expect(result.reason).toContain('references unknown curator chunk');
  });

  it('counts principled refusal as a valid research outcome after exhaustive retrieval', async () => {
    const cautious: NarrativeResearchCuratorV6 = {
      curate: async ({ captures }) => ({
        proposal: {
          ...(await curator.curate({ stop, captures, packet: {
            context: '', chunks: [], securityNotice: '',
          } })).proposal,
          propositions: [],
        },
      }),
    };
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: cautious,
    });

    expect(result.status).toBe('evidence_review_required');
  });
});
