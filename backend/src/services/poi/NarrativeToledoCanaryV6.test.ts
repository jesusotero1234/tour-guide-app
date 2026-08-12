import { NarrativeEditorialRunV6, buildNarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeResearchStopResultV6 } from './NarrativeResearchV6';
import {
  NarrativeToledoCanaryServicesV6,
  runNarrativeToledoCanaryV6,
} from './NarrativeToledoCanaryV6';
import candidates from '../../../fixtures/candidates/toledo-history.json';
import oracle from '../../../fixtures/oracle/toledo-history-es-120.json';
import sources from '../../../fixtures/sources/toledo-history-es.json';

const route = buildNarrativeRouteBriefV6({ candidates, oracle, sources, country: 'España' });

function enough(stopId: string): NarrativeResearchStopResultV6 {
  return {
    status: 'sufficient', stopId,
    stats: { searchQueries: 6, totalResults: 30, capturedPages: 8, authorityPages: 4, captureFailures: 0 },
    searchResultsByQuery: [],
    captures: [],
    captureErrors: [],
    dossier: {
      stopId, language: 'es', sources: [], passages: [], propositions: [],
      authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [],
      sufficiency: {
        isSufficient: true, missingRoles: [], authoritySourceCount: 2, independentPublisherCount: 2,
      },
      fingerprint: stopId.padEnd(64, '0').slice(0, 64),
    },
  };
}

function readyRun(): NarrativeEditorialRunV6 {
  return {
    schemaVersion: 'narrative-editorial-run-v6', runId: 'toledo-run', caseId: route.caseId,
    createdAt: '2026-08-11T12:00:00.000Z', status: 'ready_for_human_gate',
    tourFingerprint: 'f'.repeat(64),
    stopReviews: route.stops.map((stop) => ({ stopId: stop.stopId, decision: 'pending' })),
    diagnostics: { privateArtifactPath: '/private/toledo-run.json' },
  };
}

describe('narrative v6 Toledo canary', () => {
  it('researches Alcázar first and treats a cautious stop as pending human evidence review', async () => {
    const research = jest.fn(async (stop) => ({
      ...enough(stop.stopId),
      status: 'evidence_review_required' as const,
      stopIds: [stop.stopId], reasons: ['historia controvertida'],
    }));
    const services = {
      research,
      buildArc: jest.fn(),
      runEditorial: jest.fn(),
    } as unknown as NarrativeToledoCanaryServicesV6;

    const result = await runNarrativeToledoCanaryV6({
      runId: 'toledo-run', createdAt: '2026-08-11T12:00:00.000Z', route,
      privateArtifactPath: '/private/toledo-run.json', voiceProfile: ['Voz Madrid'],
    }, services);

    expect(research).toHaveBeenCalledTimes(1);
    expect(research.mock.calls[0][0].stopId).toBe('alcazar-de-toledo');
    expect(result.canaryVerdict).toBe('principled_refusal_pending_human');
    expect(result.run.status).toBe('evidence_review_required');
  });

  it('continues automatically through all six stops only after Alcázar is sufficient', async () => {
    const research = jest.fn(async (stop) => enough(stop.stopId));
    const services: NarrativeToledoCanaryServicesV6 = {
      research,
      buildArc: async ({ route: brief }) => ({
        promise: 'Comprender Toledo', centralQuestion: '¿Cómo cambió?',
        stops: brief.stops.map((stop) => ({
          stopId: stop.stopId, contribution: stop.name, bridge: 'Continúa',
        })),
      }),
      runEditorial: async () => ({ run: readyRun() } as never),
    };

    const result = await runNarrativeToledoCanaryV6({
      runId: 'toledo-run', createdAt: '2026-08-11T12:00:00.000Z', route,
      privateArtifactPath: '/private/toledo-run.json', voiceProfile: ['Voz Madrid'],
    }, services);

    expect(research).toHaveBeenCalledTimes(6);
    expect(research.mock.calls.map((call) => call[0].stopId)[0]).toBe('alcazar-de-toledo');
    expect(result.canaryVerdict).toBe('ready_for_human_gate');
    expect(result.run).toMatchObject({
      status: 'ready_for_human_gate', stopReviews: expect.arrayContaining([
        { stopId: 'alcazar-de-toledo', decision: 'pending' },
      ]),
    });
  });
});
