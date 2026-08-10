import {
  AutonomousNarrativeArtifactV3,
  AutonomousNarrativeServicesV3,
  runAutonomousNarrativeV3,
} from './AutonomousNarrativeV3';
import {
  NarrativeClaimPlanV3,
  buildNarrativeScriptRequestV3,
  canonicalizeNarrativeClaimPlanV3,
  materializeNarrativeScriptsV3,
} from './NarrativeContractsV3';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import {
  buildNarrativeDiagnosticBundleV3,
} from './NarrativeDiagnosticsV3';
import {
  buildNarrativeFieldPilotManifestV3,
  evaluateNarrativeFieldPilotV3,
} from './NarrativeFieldPilotV3';
import {
  NarrativeEvidenceCaseV3,
  buildNarrativeEvidenceCaseFromOfficialFactsV3,
} from './NarrativeEvidenceV3';
import { loadNarrativeBenchmarkCaseV2 } from './NarrativeBenchmarkCaseV2';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';
import { join } from 'path';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

let madrid: NarrativeEvidenceCaseV3;
let replayableApproved: AutonomousNarrativeArtifactV3;

function validCall<T>(value: T): EditorialCallResultV6<T> {
  return {
    callId: 'field-pilot-v3-test', status: 'valid', value,
    attempts: [{
      attempt: 1, status: 'valid', latencyMs: 10,
      rawOutput: JSON.stringify(value), error: null,
    }],
    model: 'test-model', promptFingerprint: 'a'.repeat(64),
    responseFingerprint: 'b'.repeat(64), inputCharacters: 1, schemaCharacters: 1,
    input: {}, rawOutput: JSON.stringify(value),
  };
}

async function createReplayableApproved(): Promise<AutonomousNarrativeArtifactV3> {
  const request = buildNarrativeScriptRequestV3(madrid);
  const plan: NarrativeClaimPlanV3 = canonicalizeNarrativeClaimPlanV3({
    schemaVersion: 'narrative-claim-plan-draft-v3',
    scenes: request.scenes.map((scene) => {
      const byRole = new Map(scene.evidenceFacts.map((fact) => [fact.role, fact]));
      return {
        sceneId: scene.sceneId,
        openingType: 'architectural_reversal',
        blocks: BLOCKS.map((kind) => ({
          kind,
          purpose: `Propósito ${kind}`,
          claims: kind === 'opening' ? [{
            text: 'Hecho histórico.', relation: 'direct',
            evidenceFactIds: [byRole.get('historical')!.factId],
          }] : kind === 'look' ? [{
            text: 'Detalle observable.', relation: 'direct',
            evidenceFactIds: [byRole.get('observable')!.factId],
          }] : kind === 'human_conflict' ? [{
            text: 'Acción humana.', relation: 'direct',
            evidenceFactIds: [byRole.get('human')!.factId],
          }] : [],
        })),
      };
    }),
  }, request);
  const vocabulary = ['la', 'historia', 'de', 'este', 'lugar', 'se', 'entiende', 'con', 'una', 'mirada'];
  const scripts = materializeNarrativeScriptsV3({
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
  const services: AutonomousNarrativeServicesV3 = {
    inspectCriticModel: async () => ({
      name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
      quantizationLevel: 'Q4_K_M', sizeBytes: 8_000, sizeVramBytes: 8_000, fullyGpu: true,
    }),
    generatePlan: async () => validCall(plan),
    critiquePlan: async () => validCall({
      schemaVersion: 'narrative-grounding-critic-report-v3',
      unsupportedClaims: [], improperCausality: [], misleadingOmissions: [],
    }),
    generateProse: async () => validCall(scripts),
    critiqueProse: async () => validCall({
      schemaVersion: 'narrative-critic-report-v3',
      newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
      scores: {
        dimensions: {
          curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4,
          progression: 4,
        },
        scenes: request.scenes.map((scene) => ({
          sceneId: scene.sceneId, score: 4, rationale: 'Cumple.',
        })),
      },
    }),
  };
  return runAutonomousNarrativeV3(madrid, { services });
}

function approved(): AutonomousNarrativeArtifactV3 {
  return structuredClone(replayableApproved);
}

describe('Narrative field pilot V3', () => {
  beforeAll(async () => {
    const root = join(__dirname, '..', '..', '..');
    madrid = buildNarrativeEvidenceCaseFromOfficialFactsV3(loadNarrativeBenchmarkCaseV2(join(
      root, 'fixtures', 'narrative-benchmark-v2', 'cases', 'madrid-history-es.json'
    )));
    replayableApproved = await createReplayableApproved();
  });

  it('prepares a real purchase-intent experiment without claiming human approval', () => {
    const manifest = buildNarrativeFieldPilotManifestV3(approved(), madrid);

    expect(manifest.state).toBe('prepared');
    expect(manifest.machineApprovalIsDemandEvidence).toBe(false);
    expect(manifest.checkout.status).toBe('required_before_pilot');
    expect(manifest.successGate.minimumCompletedParticipants).toBe(15);
    expect(manifest.successGate.minimumPaidPurchases).toBe(3);
    expect(JSON.stringify(manifest)).not.toMatch(/passed|human_approved/);
  });

  it('requires observed completions and real paid purchases before product validation', () => {
    const manifest = buildNarrativeFieldPilotManifestV3(approved(), madrid);
    expect(evaluateNarrativeFieldPilotV3(manifest, {
      invitedParticipants: 20,
      startedParticipants: 18,
      completedParticipants: 15,
      paidPurchases: 3,
      refundedPurchases: 0,
      criticalFactualComplaints: 0,
      averageExperienceScore: 4.2,
    })).toMatchObject({ passed: true, reasons: [] });

    expect(evaluateNarrativeFieldPilotV3(manifest, {
      invitedParticipants: 20,
      startedParticipants: 18,
      completedParticipants: 15,
      paidPurchases: 0,
      refundedPurchases: 0,
      criticalFactualComplaints: 0,
      averageExperienceScore: 4.8,
    })).toMatchObject({ passed: false, reasons: ['paid_purchases_below_3'] });
  });

  it('refuses to prepare the pilot from rejected machine output', () => {
    const rejected = approved();
    rejected.outcome = { type: 'rejected', failure: {
      stage: 'final_critique', code: 'critic_rejected', contentAttempt: 2, message: 'failed',
    } };
    expect(() => buildNarrativeFieldPilotManifestV3(rejected, madrid))
      .toThrow('machine-approved');
  });

  it('refuses an approved-looking artifact whose fingerprints were changed', () => {
    const tampered = approved();
    tampered.fingerprints.text = '0'.repeat(64);
    expect(() => buildNarrativeFieldPilotManifestV3(tampered, madrid))
      .toThrow('changed components');
  });

  it('emits redacted diagnostics without prompts, raw output, or credentials', () => {
    const rejected = approved();
    const fakeProviderToken = ['sk', 'fake-test-token-1234567890'].join('-');
    const fakeBearerToken = ['fake', 'bearer', 'token'].join('-');
    rejected.outcome = { type: 'rejected', failure: {
      stage: 'plan_generation', code: 'transport_error', contentAttempt: 1,
      message: `Bearer ${fakeBearerToken} and ${fakeProviderToken}`,
    } };
    rejected.planAttempts = [{
      contentAttempt: 1, repairSceneIds: [], repairInstructions: [], plan: null,
      generation: {
        status: 'transport_error', model: 'writer', promptFingerprint: 'a'.repeat(64),
        responseFingerprint: null,
        attempts: [{
          attempt: 1, status: 'transport_error', latencyMs: 10,
          rawOutput: 'private prompt and candidate', error: 'api_key=top-secret',
        }],
      },
      grounding: null,
    }];

    const diagnostics = buildNarrativeDiagnosticBundleV3(rejected);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('top-secret');
    expect(serialized).not.toContain('private prompt');
    expect(serialized).not.toContain('rawOutput');
    expect(serialized).toContain('[REDACTED]');
  });
});
