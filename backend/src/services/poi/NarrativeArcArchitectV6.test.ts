import { buildNarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { buildNarrativeDossierV6, NarrativeDossierV6 } from './NarrativeDossierV6';
import { createNarrativeArcArchitectV6, validateNarrativeArcV6 } from './NarrativeArcArchitectV6';
import { NarrativeCapturedSourceV6 } from './NarrativeSourcesV6';
import candidates from '../../../fixtures/candidates/toledo-history.json';
import oracle from '../../../fixtures/oracle/toledo-history-es-120.json';
import sources from '../../../fixtures/sources/toledo-history-es.json';

jest.mock('./EditorialStructuredLlmV6', () => ({
  requestEditorialStructuredV6: jest.fn(),
}));

import { requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';

const roles = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'tension_or_contrast',
  'distinctive_trait',
] as const;

function source(input: {
  sourceId: string;
  finalUrl: string;
  publisherKey: string;
  content: string;
}): NarrativeCapturedSourceV6 {
  return {
    sourceId: input.sourceId,
    requestedUrl: input.finalUrl,
    finalUrl: input.finalUrl,
    title: input.sourceId,
    capturedAt: '2026-08-11T12:00:00.000Z',
    content: input.content,
    fingerprint: input.sourceId.padEnd(64, '0').slice(0, 64),
    authority: {
      tier: 'primary_authority',
      publisherKey: input.publisherKey,
      rule: 'test_registry',
    },
    containsInstructionLikeText: false,
  };
}

function proposal(stopId: string, sourceIds = ['museum', 'archive']) {
  return {
    stopId,
    language: 'es',
    sources: sourceIds,
    passages: sourceIds.map((sourceId) => ({
      passageId: `passage-${sourceId}`,
      sourceId,
      quote: sourceId === 'museum'
        ? 'La fachada conserva cuatro torres visibles.'
        : 'El edificio cambió de función a lo largo de los siglos.',
    })),
    propositions: roles.map((role, index) => ({
      propositionId: `P${index + 1}`,
      text: `Proposición atómica ${index + 1}`,
      role,
      certainty: 'high' as const,
      interpretation: index === 3 ? 'debatable' as const : 'direct' as const,
      sourceIds,
      passageIds: sourceIds.map((sourceId) => `passage-${sourceId}`),
    })),
    authorizedNames: ['Alcázar de Toledo'],
    authorizedNumbers: ['cuatro'],
    discrepancies: [],
    limits: ['No atribuir motivaciones a los protagonistas.'],
  };
}

describe('narrative v6 arc architect', () => {
  const route = buildNarrativeRouteBriefV6({ candidates, oracle, sources, country: 'España' });
  const captures = [
    source({
      sourceId: 'museum',
      finalUrl: 'https://museum.example/alcazar',
      publisherKey: 'museum.example',
      content: 'La fachada conserva cuatro torres visibles. Contexto adicional.',
    }),
    source({
      sourceId: 'archive',
      finalUrl: 'https://archive.example/alcazar',
      publisherKey: 'archive.example',
      content: 'El edificio cambió de función a lo largo de los siglos. Archivo.',
    }),
  ];

  it('requires one exclusive contribution and bridge for every route stop', () => {
    const arc = validateNarrativeArcV6({
      promise: 'Comprender cómo Toledo reutilizó sus lugares de poder.',
      centralQuestion: '¿Cómo cambió cada espacio?',
      stops: route.stops.map((stop) => ({
        stopId: stop.stopId,
        contribution: `Función exclusiva de ${stop.name}`,
        bridge: stop.nextStopId ? `Prepara ${stop.nextStopId}` : 'Resuelve la pregunta central',
      })),
    }, route, route.stops.map((stop) => ({ stopId: stop.stopId } as NarrativeDossierV6)));

    expect(arc.stops).toHaveLength(6);
    expect(() => validateNarrativeArcV6({
      ...arc, stops: arc.stops.slice(1),
    }, route, route.stops.map((stop) => ({ stopId: stop.stopId } as NarrativeDossierV6))))
      .toThrow('arc must cover every route stop exactly once');
  });

  it('rejects insufficient dossier before calling the structured requester', async () => {
    const insufficientDossiers: NarrativeDossierV6[] = route.stops.map((stop) => (
      buildNarrativeDossierV6({
        ...proposal(stop.stopId),
        propositions: proposal(stop.stopId).propositions.filter((item) => item.role !== 'distinctive_trait'),
      }, captures)
    ));

    const requesterMock = requestEditorialStructuredV6 as jest.Mock;
    requesterMock.mockReset();
    const architect = createNarrativeArcArchitectV6({});

    await expect(architect.build({ route, dossiers: insufficientDossiers }))
      .rejects.toThrow('arc cannot be built from an insufficient dossier');
    expect(requesterMock).not.toHaveBeenCalled();
  });

  it('builds a valid arc from sufficient dossiers and calls requester once', async () => {
    const sufficientDossiers: NarrativeDossierV6[] = route.stops.map((stop) => (
      buildNarrativeDossierV6(proposal(stop.stopId), captures)
    ));

    const mockArc = {
      promise: 'Comprender cómo Toledo reutilizó sus lugares de poder.',
      centralQuestion: '¿Cómo cambió cada espacio?',
      stops: route.stops.map((stop) => ({
        stopId: stop.stopId,
        contribution: `Función exclusiva de ${stop.name}`,
        bridge: stop.nextStopId ? `Prepara ${stop.nextStopId}` : 'Resuelve la pregunta central',
      })),
    };

    const requesterMock = requestEditorialStructuredV6 as jest.Mock;
    requesterMock.mockReset();
    requesterMock.mockResolvedValue({ status: 'valid' as const, value: mockArc });
    const architect = createNarrativeArcArchitectV6({});

    const result = await architect.build({ route, dossiers: sufficientDossiers });
    expect(requesterMock).toHaveBeenCalledTimes(1);
    expect(result.arc.promise).toBe(mockArc.promise);
    expect(result.arc.centralQuestion).toBe(mockArc.centralQuestion);
    expect(result.arc.stops).toHaveLength(route.stops.length);
  });
});
