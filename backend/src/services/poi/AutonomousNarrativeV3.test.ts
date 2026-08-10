import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AutonomousNarrativeServicesV3,
  replayAutonomousNarrativeArtifactV3,
  runAutonomousNarrativeV3,
  serializeMachineApprovedNarrativeArtifactV3,
} from './AutonomousNarrativeV3';
import {
  NarrativeClaimPlanV3,
  NarrativeScriptRequestV3,
  buildNarrativeScriptRequestV3,
  canonicalizeNarrativeClaimPlanV3,
  materializeNarrativeScriptsV3,
} from './NarrativeContractsV3';
import {
  NarrativeCriticReportV3,
  NarrativeGroundingCriticReportV3,
} from './NarrativeCriticV3';
import {
  NarrativeEvidenceCaseV3,
  buildNarrativeEvidenceCaseFromWorkbenchV3,
} from './NarrativeEvidenceV3';
import { NarrativeCriticModelInfoV3 } from './NarrativePilotGemmaV3';
import { NarrativeBlockKindV1, SceneNarrativeScriptV1 } from './NarrativePilotV1';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';
import { PoiEnrichmentSnapshot } from './PoiEnrichmentSnapshot';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

function evidenceCase(): NarrativeEvidenceCaseV3 {
  const root = join(__dirname, '..', '..', '..');
  const workbench = JSON.parse(readFileSync(join(
    root, 'fixtures', 'editorial-v7', 'madrid-history-es-120.json'
  ), 'utf8')) as EditorialWorkbenchV7;
  const sources = JSON.parse(readFileSync(join(
    root, 'fixtures', 'sources', 'madrid-history-es.json'
  ), 'utf8')) as PoiEnrichmentSnapshot;
  const core = JSON.parse(readFileSync(join(
    root, 'fixtures', 'editorial-v6', 'core', 'editorial-core-v6-madrid-20260807-e',
    'madrid-history-es-120.json'
  ), 'utf8')) as { prominence: WikimediaProminenceSnapshotV6 };
  return buildNarrativeEvidenceCaseFromWorkbenchV3(workbench, sources, core.prominence);
}

function approvedPlan(request: NarrativeScriptRequestV3): NarrativeClaimPlanV3 {
  return canonicalizeNarrativeClaimPlanV3({
    schemaVersion: 'narrative-claim-plan-draft-v3',
    scenes: request.scenes.map((scene) => {
      const byRole = new Map(scene.evidenceFacts.map((fact) => [fact.role, fact]));
      const historical = byRole.get('historical')!;
      return {
        sceneId: scene.sceneId,
        openingType: 'architectural_reversal',
        blocks: BLOCKS.map((kind) => ({
          kind,
          purpose: `Propósito ${kind}`,
          claims: kind === 'opening' ? [{
            text: 'Cambio histórico sustentado.',
            relation: historical.relationSupport.includes('chronology') ? 'chronology' : 'direct',
            evidenceFactIds: [historical.factId],
          }] : kind === 'look' ? [{
            text: 'Detalle visible sustentado.', relation: 'direct',
            evidenceFactIds: [byRole.get('observable')!.factId],
          }] : kind === 'human_conflict' ? [{
            text: 'Decisión humana sustentada.', relation: 'direct',
            evidenceFactIds: [byRole.get('human')!.factId],
          }] : [],
        })),
      };
    }),
  }, request);
}

function approvedScripts(
  request: NarrativeScriptRequestV3,
  plan: NarrativeClaimPlanV3
): SceneNarrativeScriptV1[] {
  const vocabulary = ['la', 'historia', 'de', 'este', 'lugar', 'se', 'entiende', 'con', 'una', 'mirada'];
  return materializeNarrativeScriptsV3({
    schemaVersion: 'narrative-prose-draft-v3',
    scripts: request.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, blockIndex) => {
        const count = blockIndex === 0 ? 25 : 45;
        const words = Array.from({ length: count }, (_, index) => (
          kind === 'look' && index === 0 ? 'Mira' : vocabulary[index % vocabulary.length]
        ));
        words[0] = `${words[0][0].toUpperCase()}${words[0].slice(1)}`;
        words[words.length - 1] += '.';
        return { kind, text: words.join(' ') };
      }),
    })),
  }, request, plan);
}

function call<T>(
  value: T | null,
  status: 'valid' | 'transport_error' | 'malformed_response' | 'semantic_error' = 'valid',
  error: string | null = null
): EditorialCallResultV6<T> {
  return {
    callId: 'test-call', status, value,
    attempts: [{
      attempt: 1, status, latencyMs: 10,
      rawOutput: value ? JSON.stringify(value) : '{}', error,
    }],
    model: 'test-model', promptFingerprint: 'a'.repeat(64),
    responseFingerprint: value ? 'b'.repeat(64) : null,
    inputCharacters: 1, schemaCharacters: 1, input: {},
    rawOutput: value ? JSON.stringify(value) : '{}',
  };
}

function grounding(plan: NarrativeClaimPlanV3, clean = true): NarrativeGroundingCriticReportV3 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v3',
    unsupportedClaims: clean ? [] : [{
      sceneId: plan.scenes[0].sceneId,
      claimId: plan.scenes[0].blocks[0].claims[0].claimId,
      severity: 'critical',
      detail: 'La evidencia no respalda esa formulación.',
    }],
    improperCausality: [],
    misleadingOmissions: [],
  };
}

function finalReport(request: NarrativeScriptRequestV3, clean = true): NarrativeCriticReportV3 {
  return {
    schemaVersion: 'narrative-critic-report-v3',
    newClaims: clean ? [] : [{
      sceneId: request.scenes[1].sceneId,
      location: 'interpretation',
      severity: 'critical',
      claim: 'Hecho nuevo.',
      detail: 'No aparece en el plan.',
    }],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: request.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple.',
      })),
    },
  };
}

const MODEL: NarrativeCriticModelInfoV3 = {
  name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
  quantizationLevel: 'Q4_K_M', sizeBytes: 8_000, sizeVramBytes: 8_000, fullyGpu: true,
};

function services(input: {
  plans?: Array<EditorialCallResultV6<NarrativeClaimPlanV3>>;
  grounding?: Array<EditorialCallResultV6<NarrativeGroundingCriticReportV3>>;
  prose?: Array<EditorialCallResultV6<SceneNarrativeScriptV1[]>>;
  final?: Array<EditorialCallResultV6<NarrativeCriticReportV3>>;
  preflightError?: Error;
} = {}): AutonomousNarrativeServicesV3 {
  const request = buildNarrativeScriptRequestV3(evidenceCase());
  const plan = approvedPlan(request);
  const scripts = approvedScripts(request, plan);
  const take = <T>(values: EditorialCallResultV6<T>[] | undefined, fallback: T) => (
    async () => values?.shift() ?? call(fallback)
  );
  return {
    inspectCriticModel: jest.fn(async () => {
      if (input.preflightError) throw input.preflightError;
      return MODEL;
    }),
    generatePlan: jest.fn(take(input.plans, plan)),
    critiquePlan: jest.fn(take(input.grounding, grounding(plan))),
    generateProse: jest.fn(take(input.prose, scripts)),
    critiqueProse: jest.fn(take(input.final, finalReport(request))),
  };
}

describe('AutonomousNarrativeV3', () => {
  it('approves only after plan grounding and final prose gates pass', async () => {
    const mocks = services();
    const artifact = await runAutonomousNarrativeV3(evidenceCase(), { services: mocks });

    expect(artifact.outcome).toEqual({ type: 'machine_approved' });
    expect(artifact.planAttempts).toHaveLength(1);
    expect(artifact.proseAttempts).toHaveLength(1);
    expect(mocks.generatePlan).toHaveBeenCalledTimes(1);
    expect(mocks.critiquePlan).toHaveBeenCalledTimes(1);
    expect(mocks.generateProse).toHaveBeenCalledTimes(1);
    expect(mocks.critiqueProse).toHaveBeenCalledTimes(1);
  });

  it('derives a scene-scoped plan repair locally from critic findings', async () => {
    const request = buildNarrativeScriptRequestV3(evidenceCase());
    const plan = approvedPlan(request);
    const mocks = services({ grounding: [call(grounding(plan, false)), call(grounding(plan))] });
    const artifact = await runAutonomousNarrativeV3(evidenceCase(), { services: mocks });

    expect(artifact.outcome.type).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(2);
    expect(artifact.planAttempts[1].repairSceneIds).toEqual([request.scenes[0].sceneId]);
    expect(artifact.planAttempts[1].repairInstructions[0]).toContain(':claim:01');
  });

  it('repairs prose once and rejects a second factual failure', async () => {
    const request = buildNarrativeScriptRequestV3(evidenceCase());
    const rejected = finalReport(request, false);
    const artifact = await runAutonomousNarrativeV3(evidenceCase(), {
      services: services({ final: [call(rejected), call(rejected)] }),
    });

    expect(artifact.outcome).toMatchObject({
      type: 'rejected', failure: { stage: 'final_critique', code: 'critic_rejected' },
    });
    expect(artifact.proseAttempts).toHaveLength(2);
    expect(artifact.proseAttempts[1].repairSceneIds).toEqual([request.scenes[1].sceneId]);
  });

  it('retries invalid critic protocol without consuming a content repair', async () => {
    const request = buildNarrativeScriptRequestV3(evidenceCase());
    const plan = approvedPlan(request);
    const mocks = services({ grounding: [
      call<NarrativeGroundingCriticReportV3>(null, 'semantic_error', 'invalid claim reference'),
      call(grounding(plan)),
    ] });
    const artifact = await runAutonomousNarrativeV3(evidenceCase(), { services: mocks });

    expect(artifact.outcome.type).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(1);
    expect(artifact.planAttempts[0].grounding?.protocolCallCount).toBe(2);
  });

  it('uses one content repair for deterministic prose validation', async () => {
    const mocks = services({ prose: [
      call<SceneNarrativeScriptV1[]>(null, 'semantic_error', 'requires 220 to 260 words'),
    ] });
    const artifact = await runAutonomousNarrativeV3(evidenceCase(), { services: mocks });

    expect(artifact.outcome.type).toBe('machine_approved');
    expect(artifact.proseAttempts).toHaveLength(2);
    expect(artifact.proseAttempts[1].repairSceneIds).toHaveLength(3);
    expect(artifact.proseAttempts[1].repairInstructions.join(' ')).toContain('220 to 260');
  });

  it('fails closed when the critic is unavailable', async () => {
    const artifact = await runAutonomousNarrativeV3(evidenceCase(), {
      services: services({ preflightError: new Error('Gemma unavailable') }),
    });
    expect(artifact.outcome).toEqual({
      type: 'rejected',
      failure: expect.objectContaining({ stage: 'critic_preflight', code: 'model_unavailable' }),
    });
    expect(artifact.scripts).toEqual([]);
  });

  it('replays fingerprints and serializes approved artifacts only', async () => {
    const testCase = evidenceCase();
    const approved = await runAutonomousNarrativeV3(testCase, { services: services() });
    expect(replayAutonomousNarrativeArtifactV3(approved, testCase)).toEqual(approved);
    expect(serializeMachineApprovedNarrativeArtifactV3(approved, testCase))
      .toContain('machine_approved');
    expect(JSON.stringify(approved)).not.toMatch(/human_review|pending_review|premiumReadiness/);

    const changed = structuredClone(approved);
    changed.fingerprints.text = '0'.repeat(64);
    expect(() => replayAutonomousNarrativeArtifactV3(changed, testCase)).toThrow('changed components');

    const rejected = await runAutonomousNarrativeV3(testCase, {
      services: services({ preflightError: new Error('offline') }),
    });
    expect(() => serializeMachineApprovedNarrativeArtifactV3(rejected, testCase))
      .toThrow('only machine-approved');
  });
});
