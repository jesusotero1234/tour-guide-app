import { NarrativeRouteStopV6 } from './NarrativeContractsV6';
import { createHash } from 'crypto';
import { NARRATIVE_SUFFICIENCY_ROLES_V6 } from './NarrativeDossierV6';
import {
  NarrativeCuratorIndicatorsV6,
  NarrativeResearchCuratorV6,
  createDeepSeekNarrativeResearchCuratorV6,
  researchNarrativeStopV6,
} from './NarrativeResearchV6';
import {
  NarrativeCapturedSourceV6,
  NarrativeSourceProviderV6,
  classifyNarrativeSourceAuthorityV6,
} from './NarrativeSourcesV6';
import {
  createNarrativeResearchSnapshotBundleV6,
  preflightNarrativeResearchSnapshotV6,
  replayNarrativeResearchSnapshotV6,
} from './NarrativeResearchSnapshotV6';
import palaceSnapshot from '../../../fixtures/narrative-madrid-v6/research-snapshots/palace.manifest.json';
import palaceSnapshotV2 from '../../../fixtures/narrative-madrid-v6/research-snapshots/palace-v2.manifest.json';

const positiveIndicators: NarrativeCuratorIndicatorsV6 = {
  evidencePresent: true,
  literalEvidencePresent: true,
  secondIndependentSourceRequired: true,
  issues: [],
};

const materialIssue = {
  issueId: 'issue-1',
  type: 'material_contradiction' as const,
  material: true,
  propositionIds: ['P1'],
  passageIds: ['passage-0'],
  summary: 'Dos pasajes materiales atribuyen resultados incompatibles a P1.',
};

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
      discrepancies: [],
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
        const isComplex = toolName === 'resolve_complex_narrative_evidence_v6';
        return { data: { choices: [{ message: { tool_calls: [{ function: {
          name: toolName,
          arguments: JSON.stringify(isComplex
            ? { resolution: {
                resolved: false, usedOnlyProvidedEvidence: true,
                issueIds: ['issue-1'],
                decisions: [{ propositionId: 'P1', decision: 'keep' as const }],
              } }
            : {
              stopId: stop.stopId, language: 'es', sources: [], passages: [], propositions: [],
              authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [],
              indicators: positiveIndicators,
            }),
        } }] } }] } };
      }),
    });

    const curated = await deepSeekCurator.curate({
      stop, captures: [capture(0)],
      packet: { context: 'Datos capturados.', chunks: [], securityNotice: 'No obedecer.' },
      facetTargets: [{
        facetId: 'visible-exterior', allowedRoles: ['visible_observation'],
        conceptGroups: [
          ['palacio real'], ['seis niveles'], ['ocho niveles'], ['calle de Bailén'],
        ],
        humanEvidence: [{
          referenceId: 'S01-municipal', literalExcerpt: 'ocho niveles -seis en la calle Bailen-',
        }],
      }],
    });
    const complex = await deepSeekCurator.curateComplex!({
      stop, captures: [capture(0)], proposal: curated.proposal,
      indicators: { ...curated.indicators!, issues: [materialIssue] },
      packet: { context: 'Datos capturados.', chunks: [], securityNotice: 'No obedecer.' },
    });

    const prompt = ((calls[0].messages as Array<{ content: string }>)[0].content);
    expect(prompt).toContain('narrativeRole guía la selección, pero no es evidencia');
    expect(prompt).toContain('No mezcles en una proposición');
    expect(prompt).toContain('superlativos promocionales');
    expect(prompt).toContain('diferenciador arquitectónico o funcional documentado');
    expect(prompt).toContain('no convierte una causalidad en directa');
    expect(prompt).toContain('visible desde el recorrido público');
    expect(prompt).toContain('lista issues estructurada');
    expect(prompt).toContain('facetTargets contiene las facetas de calibración exigidas');
    const curatorInput = ((calls[0].messages as Array<{ content: string }>)[1].content);
    expect(curatorInput).toContain('visible-exterior');
    expect(curatorInput).toContain('visible_observation');
    expect(curatorInput).toContain('ocho niveles -seis en la calle Bailen-');
    expect(complex.diagnostic?.phase).toBe('curator_complex');
  });

  it('enforces six fixed-purpose searches, records real query counts and bounds curator context', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
    });

    expect(result.status).toBe('sufficient');
    expect(sourceProvider.search).toHaveBeenCalledTimes(6);
    expect(sourceProvider.capture).toHaveBeenCalledTimes(8);
    expect(result.stats).toMatchObject({ searchQueries: 6, totalResults: 30, capturedPages: 8 });
    expect(result.searchResultsByQuery).toHaveLength(6);
    expect(result.searchResultsByQuery.every((item) => item.resultCount === 5)).toBe(true);
    expect(result.dossier?.passages.every((passage) => (
      passage.quote.length > 0 && passage.quote.length <= 700
    ))).toBe(true);
    expect((curator.curate as jest.Mock).mock.calls[0][0].packet.context.length)
      .toBeLessThanOrEqual(30_000);
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

  it('stops capture immediately when Firecrawl quota is exhausted', async () => {
    const sourceProvider = provider();
    const curatorCallsBefore = (curator.curate as jest.Mock).mock.calls.length;
    sourceProvider.capture.mockRejectedValue(
      new Error('Firecrawl quota or payment required (HTTP 402)')
    );

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
    });

    expect(result).toMatchObject({
      status: 'source_capture_failed',
      reason: 'Firecrawl quota or payment required (HTTP 402)',
    });
    expect(sourceProvider.capture).toHaveBeenCalledTimes(1);
    expect((curator.curate as jest.Mock).mock.calls).toHaveLength(curatorCallsBefore);
  });

  it('rejects an invalid six-query plan before calling the source provider', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
      searchPlanner: { plan: async () => ({ queries: ['only one'] }) },
    });

    expect(result.status).toBe('source_capture_failed');
    expect(result.reason).toContain('exactly six unique search queries');
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
        'Alcázar de Toledo fotos visitantes',
        'Alcázar de Toledo guía genérica',
      ] }) },
    });

    expect(result.status).toBe('source_capture_failed');
    expect(result.reason).toContain('distinctive narrativeRole terms');
    expect(sourceProvider.search).not.toHaveBeenCalled();
  });

  it('does not require generic product arc wording in research queries', async () => {
    const sourceProvider = provider();
    const result = await researchNarrativeStopV6({
      stop: {
        ...stop,
        narrativeRole: 'presentar el punto de partida y la tensión central: Alcázar de Toledo',
      },
      city: 'Toledo',
      language: 'es',
      sourceProvider,
      curator,
      searchPlanner: { plan: async () => ({ queries: [
        'site:toledo.es Alcázar de Toledo historia cronología oficial',
        'site:cultura.gob.es Alcázar de Toledo arquitectura observable',
        'Alcázar de Toledo función actual acceso museo actos',
        'Alcázar de Toledo publicación institucional arquitectura historia',
        'Alcázar de Toledo estudio académico proyecto autores',
        'Alcázar de Toledo corroboración controversia fuentes',
      ] }) },
    });

    expect(result.status).toBe('sufficient');
    expect(sourceProvider.search).toHaveBeenCalledTimes(6);
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
        'Alcázar de Toledo publicación institucional',
        'Alcázar de Toledo corroboración historia',
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
        'Alcázar de Toledo publicación institucional',
        'Alcázar de Toledo corroboración historia',
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

  it('rejects a literal excerpt cited against the wrong chunk of the same source', async () => {
    const sourceProvider = provider();
    sourceProvider.capture.mockImplementation(async (url: string) => {
      const match = url.match(/alcazar-(\d+)/);
      const index = url.includes('wikidata.org') ? 0
        : url.includes('wikipedia.org') ? 1 : Number(match?.[1] ?? 0);
      const original = capture(index);
      return {
        ...original,
        content: `${'Primer párrafo de historia visible. '.repeat(35)}\n\nEXTRACTO DEL SEGUNDO PÁRRAFO. ${'Transformación. '.repeat(60)}`,
      };
    });
    const invalid: NarrativeResearchCuratorV6 = {
      curate: async ({ packet }) => {
        const bySource = new Map<string, typeof packet.chunks>();
        for (const chunk of packet.chunks) {
          bySource.set(chunk.sourceId, [...(bySource.get(chunk.sourceId) ?? []), chunk]);
        }
        const chunks = [...bySource.values()].find((items) => items.length >= 2)!;
        return {
          proposal: {
            stopId: stop.stopId, language: 'es', sources: [chunks[0].sourceId],
            passages: [{
              passageId: 'passage-wrong-chunk', sourceId: chunks[0].sourceId,
              chunkId: chunks[0].chunkId,
              quote: 'EXTRACTO DEL SEGUNDO PÁRRAFO.',
            }],
            propositions: [], authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [],
          },
        };
      },
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator: invalid,
    });

    expect(result).toMatchObject({ status: 'protocol_failed' });
    expect(result.reason).toContain('excerpt is not literal in curator chunk');
  });

  it('returns reference_evidence_missing before planner or curator when direct preflight fails', async () => {
    const sourceProvider = provider();
    const planner = { plan: jest.fn(async () => ({ queries: [] })) };
    const curatorCallsBefore = (curator.curate as jest.Mock).mock.calls.length;
    sourceProvider.capture.mockRejectedValueOnce(new Error('local scrape unavailable'));

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator, searchPlanner: planner,
      requiredReferenceEvidence: [{
        referenceId: 'S01-municipal',
        url: 'https://toledo.es/patrimonio/alcazar',
      }],
    });

    expect(result).toMatchObject({
      status: 'reference_evidence_missing',
      missingReferenceIds: ['S01-municipal'],
      stats: { searchQueries: 0 },
    });
    expect(planner.plan).not.toHaveBeenCalled();
    expect((curator.curate as jest.Mock).mock.calls).toHaveLength(curatorCallsBefore);
  });

  it('injects directly captured reference evidence when search discovery omits it', async () => {
    const sourceProvider = provider();
    const referenceUrl = 'https://toledo.es/patrimonio/alcazar-reference';
    const reference = {
      ...capture(42), requestedUrl: referenceUrl, finalUrl: referenceUrl,
      content: `Pasaje literal 42. altura visible desde la plaza. ${'Historia arquitectura. '.repeat(50)}`,
    };
    sourceProvider.capture.mockImplementation(async (url: string) => {
      if (url === referenceUrl) return reference;
      if (url.includes('wikidata.org')) return capture(0);
      if (url.includes('wikipedia.org')) return capture(1);
      const match = url.match(/alcazar-(\d+)/);
      return capture(Number(match?.[1] ?? 0));
    });

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator,
      requiredReferenceEvidence: [{
        referenceId: 'S01-municipal', url: referenceUrl,
        literalAnchors: ['altura visible desde la plaza'],
        facetTargets: [{
          facetId: 'visible-exterior', allowedRoles: ['visible_observation'],
          conceptGroups: [['alcázar construido'], ['altura visible'], ['plaza']],
          humanEvidence: [{
            referenceId: 'S01-municipal', literalExcerpt: 'altura visible desde la plaza',
          }],
        }],
      }],
    });

    expect(result.status).toBe('sufficient');
    expect(result.captures.some((item) => item.finalUrl === referenceUrl)).toBe(true);
    expect(sourceProvider.search).toHaveBeenCalledTimes(6);
    const curatorInput = (curator.curate as jest.Mock).mock.calls.at(-1)![0];
    expect(curatorInput.facetTargets).toEqual([expect.objectContaining({
      facetId: 'visible-exterior', allowedRoles: ['visible_observation'],
    })]);
    expect(curatorInput.packet.context).toContain('altura visible desde la plaza');
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

  it('requires evidence review when deterministic authority is insufficient', async () => {
    const sourceProvider = provider();
    sourceProvider.capture.mockImplementation(async (url: string) => {
      const match = url.match(/alcazar-(\d+)/);
      const index = url.includes('wikidata.org') ? 0
        : url.includes('wikipedia.org') ? 1 : Number(match?.[1] ?? 0);
      return {
        ...capture(index),
        authority: {
          tier: 'discovery_only' as const,
          publisherKey: `weak-${index}.example`,
          rule: 'unregistered',
        },
      };
    });
    const optimistic: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => ({
        proposal: (await curator.curate({ stop, captures, packet: {
          context: '', chunks: [], securityNotice: '',
        } })).proposal,
        indicators: positiveIndicators,
      })),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider, curator: optimistic,
    });

    expect(result).toMatchObject({
      status: 'evidence_review_required',
      reasons: expect.arrayContaining(['fewer than two authority sources']),
    });
  });

  it('requires evidence review before dossier validation when a debated claim lacks a second publisher', async () => {
    const singlePublisherClaim: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => {
        const proposal = (await curator.curate({ stop, captures, packet: {
          context: '', chunks: [], securityNotice: '',
        } })).proposal;
        return {
          proposal: {
            ...proposal,
            propositions: proposal.propositions.map((item) => item.interpretation === 'debatable'
              ? {
                ...item,
                sourceIds: [proposal.passages[0].sourceId],
                passageIds: [proposal.passages[0].passageId],
              }
              : item),
          },
          indicators: positiveIndicators,
        };
      }),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: singlePublisherClaim,
    });

    expect(result).toMatchObject({
      status: 'evidence_review_required',
      reasons: expect.arrayContaining(['required second independent source is absent']),
    });
  });

  it('escalates a material contradiction exactly once and accepts an evidence-only resolution', async () => {
    const adaptive: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => ({
        proposal: (await curator.curate({ stop, captures, packet: {
          context: '', chunks: [], securityNotice: '',
        } })).proposal,
        indicators: { ...positiveIndicators, issues: [materialIssue] },
      })),
      curateComplex: jest.fn(async () => ({
        resolution: {
          resolved: true, usedOnlyProvidedEvidence: true, issueIds: ['issue-1'],
          decisions: [{ propositionId: 'P1', decision: 'keep' as const }],
        },
      })),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: adaptive,
    });

    expect(result.status).toBe('sufficient');
    expect(adaptive.curateComplex).toHaveBeenCalledTimes(1);
  });

  it('does not escalate a discrepancies note without a material structured issue', async () => {
    const adaptive: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => ({
        proposal: {
          ...(await curator.curate({ stop, captures, packet: {
            context: '', chunks: [], securityNotice: '',
          } })).proposal,
          discrepancies: ['La memoria del asedio está disputada.'],
        },
        indicators: positiveIndicators,
      })),
      curateComplex: jest.fn(async () => ({
        resolution: {
          resolved: true, usedOnlyProvidedEvidence: true, issueIds: [], decisions: [],
        },
      })),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: adaptive,
    });

    expect(result.status).toBe('sufficient');
    expect(adaptive.curateComplex).not.toHaveBeenCalled();
  });

  it('requires evidence review when the single complex escalation cannot resolve the issue', async () => {
    const adaptive: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => ({
        proposal: (await curator.curate({ stop, captures, packet: {
          context: '', chunks: [], securityNotice: '',
        } })).proposal,
        indicators: {
          ...positiveIndicators,
          issues: [{ ...materialIssue, type: 'unsupported_interpretation' as const }],
        },
      })),
      curateComplex: jest.fn(async () => ({
        resolution: {
          resolved: false, usedOnlyProvidedEvidence: true, issueIds: ['issue-1'],
          decisions: [{ propositionId: 'P1', decision: 'keep' as const }],
        },
      })),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: adaptive,
    });

    expect(result).toMatchObject({
      status: 'evidence_review_required',
      reasons: ['complex curator did not resolve the issue using only captured evidence'],
    });
    expect(adaptive.curateComplex).toHaveBeenCalledTimes(1);
  });

  it('merges a targeted complex delta without losing unaffected propositions prop-6 to prop-8', async () => {
    const adaptive: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => {
        const proposal = (await curator.curate({ stop, captures, packet: {
          context: '', chunks: [], securityNotice: '',
        } })).proposal;
        return {
          proposal: {
            ...proposal,
            propositions: proposal.propositions.map((item, index) => ({
              ...item, propositionId: `prop-${index + 4}`,
            })),
          },
          indicators: {
            ...positiveIndicators,
            issues: [{ ...materialIssue, propositionIds: ['prop-4'] }],
          },
        };
      }),
      curateComplex: jest.fn(async () => ({
        resolution: {
          resolved: true, usedOnlyProvidedEvidence: true, issueIds: ['issue-1'],
          decisions: [{ propositionId: 'prop-4', decision: 'keep' as const }],
        },
      })),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: adaptive,
    });

    expect(result.status).toBe('sufficient');
    expect(result.dossier?.propositions.map((item) => item.propositionId))
      .toEqual(['prop-4', 'prop-5', 'prop-6', 'prop-7', 'prop-8']);
  });

  it('rejects a complex delta that introduces a new passage as protocol_failed', async () => {
    const adaptive: NarrativeResearchCuratorV6 = {
      curate: jest.fn(async ({ captures }) => ({
        proposal: (await curator.curate({ stop, captures, packet: {
          context: '', chunks: [], securityNotice: '',
        } })).proposal,
        indicators: { ...positiveIndicators, issues: [materialIssue] },
      })),
      curateComplex: jest.fn(async () => ({
        resolution: {
          resolved: true, usedOnlyProvidedEvidence: true, issueIds: ['issue-1'],
          decisions: [{
            propositionId: 'P1', decision: 'replace' as const,
            replacement: {
              propositionId: 'P1', text: 'Reemplazo', role: 'visible_observation' as const,
              certainty: 'high' as const, interpretation: 'direct' as const,
              sourceIds: ['source-0'],
              passageIds: ['new-passage'],
            },
          }],
        },
      })),
    };

    const result = await researchNarrativeStopV6({
      stop, language: 'es', sourceProvider: provider(), curator: adaptive,
    });

    expect(result).toMatchObject({ status: 'protocol_failed' });
    expect(result.reason).toContain('cannot introduce new evidence');
  });

  it('freezes a shareable manifest without content and rejects tampered replay', async () => {
    const finalUrl = 'https://www.toledo.es/historia/alcazar';
    const content = 'El Alcázar conserva cuatro torres visibles desde la plaza.';
    const frozenCapture: NarrativeCapturedSourceV6 = {
      sourceId: 'toledo-official', requestedUrl: finalUrl, finalUrl,
      title: 'Historia del Alcázar', capturedAt: '2026-08-12T12:00:00.000Z', content,
      fingerprint: createHash('sha256').update(`${finalUrl}\n${content}`).digest('hex'),
      authority: classifyNarrativeSourceAuthorityV6(finalUrl),
      containsInstructionLikeText: false,
    };
    const bundle = createNarrativeResearchSnapshotBundleV6({
      captures: [frozenCapture],
      excerptsBySourceId: { 'toledo-official': ['conserva cuatro torres'] },
    });

    expect(JSON.stringify(bundle.manifest)).not.toContain(content);
    expect(bundle.manifest.sources[0].requestedUrlFingerprint).toHaveLength(64);
    await expect(replayNarrativeResearchSnapshotV6(
      bundle.manifest, bundle.privateArtifact
    ).capture(finalUrl)).resolves.toMatchObject({ fingerprint: frozenCapture.fingerprint });
    expect(() => replayNarrativeResearchSnapshotV6(
      { ...bundle.manifest, capturePolicy: 'changed' }, bundle.privateArtifact
    )).toThrow('protocol changed');
    expect(() => replayNarrativeResearchSnapshotV6(bundle.manifest, {
      ...bundle.privateArtifact,
      captures: [{ ...frozenCapture, requestedUrl: 'https://www.toledo.es/otra-ruta' }],
    })).toThrow('public manifest');
  });

  it('rejects the legacy Palace snapshot before it can be called v2-ready', () => {
    expect(() => preflightNarrativeResearchSnapshotV6({
      manifest: palaceSnapshot,
      requiredReferences: [
        {
          referenceId: 'S01-municipal',
          finalUrl: 'https://patrimonioypaisaje.madrid.es/portales/monumenta/es/Monumentos-y-Edificios-Singulares/Edificios-singulares/Palacio-Real-de-Madrid/',
          literalAnchors: ['ocho niveles, seis en la calle Bailén'],
        },
        {
          referenceId: 'S03-institutional',
          finalUrl: 'https://www.patrimonionacional.es/sites/default/files/2020-06/folleto_palacio_real_accesibilidad_para_pmr.pdf',
          literalAnchors: ['bóvedas sin madera en la estructura'],
        },
      ],
    })).toThrow('protocol changed');
  });

  it('preflights the immutable Palace v2 snapshot with the required S01/S03 anchors', () => {
    expect(preflightNarrativeResearchSnapshotV6({
      manifest: palaceSnapshotV2,
      requiredReferences: [
        {
          referenceId: 'S01-municipal',
          finalUrl: 'https://patrimonioypaisaje.madrid.es/portales/monumenta/es/Monumentos-y-Edificios-Singulares/Edificios-singulares/Palacio-Real-de-Madrid/?vgnextfmt=default&vgnextoid=2008f7d9560a4510f7d9560a45102e085a0aRCRD&vgnextchannel=83bc3cb702aa4510VgnVCM1000008a4a900aRCRD',
          literalAnchors: [
            'ocho niveles -seis en la calle Bailen-',
            'actualmente no se encuentra habitado',
          ],
        },
        {
          referenceId: 'S03-institutional',
          finalUrl: 'https://www.patrimonionacional.es/sites/default/files/2020-06/folleto_palacio_real_accesibilidad_para_pmr.pdf',
          literalAnchors: [
            'incendio, la Nochebuena de 1734',
            'toda la nueva estructura fuese de bóveda, sin más madera',
            'seis alturas donde menos, y ocho donde más',
          ],
        },
      ],
    })).toMatchObject({ status: 'ready' });
  });
});
