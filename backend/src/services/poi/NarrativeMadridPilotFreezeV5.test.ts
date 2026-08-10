import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AutonomousNarrativeArtifactV5 } from './AutonomousNarrativeV5';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { buildNarrativeClaimPlanV4, narrativeClaimPlanFingerprintV4 } from './NarrativeClaimPlanV4';
import { NarrativeCriticReportV4, NarrativeGroundingCriticReportV4 } from './NarrativeCriticV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NARRATIVE_CRITIC_DIGEST_V4,
  NARRATIVE_CRITIC_MODEL_V4,
  NarrativeCriticModelInfoV4,
} from './NarrativePilotGemmaV4';
import {
  NarrativePilotFreezePathsV5,
  freezeNarrativeMadridPilotV5,
  readNarrativePilotFreezeDocumentsV5,
  replayNarrativePilotFreezeDocumentsV5,
} from './NarrativeMadridPilotFreezeV5';
import { runNarrativeMadridPilotQualificationV5 } from './NarrativeMadridPilotQualificationV5';
import { NarrativeVariantV5 } from './NarrativePilotWriterV5';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

const MODEL: NarrativeCriticModelInfoV4 = {
  name: NARRATIVE_CRITIC_MODEL_V4,
  digest: NARRATIVE_CRITIC_DIGEST_V4,
  parameterSize: '12B', quantizationLevel: 'Q4_K_M',
  sizeBytes: 8_500, sizeVramBytes: 8_500, fullyGpu: true,
};

function call<T>(value: T): EditorialCallResultV6<T> {
  return {
    callId: 'test', status: 'valid', value,
    attempts: [{ attempt: 1, status: 'valid', latencyMs: 1, rawOutput: '{}', error: null }],
    model: 'test', promptFingerprint: 'a'.repeat(64), responseFingerprint: 'b'.repeat(64),
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: '{}',
  };
}

function grounding(): NarrativeGroundingCriticReportV4 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v4',
    unsupportedClaims: [], improperCausality: [], unsupportedInterpretations: [],
    meaningChangingOmissions: [],
  };
}

function report(factual = false): NarrativeCriticReportV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v4',
    newClaims: factual ? [{
      sceneId: 'palace', location: 'opening', severity: 'critical',
      claim: 'El incendio causó por sí solo toda la transformación política posterior',
      detail: 'No está respaldado.',
    }] : [],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple plenamente.',
      })),
    },
  };
}

function text(): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4', introduction: 'Introducción validada del piloto V5.',
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId, name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId, kind: block.kind,
        text: `Narración validada de ${scene.name} para ${block.kind}.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition, bodyWordCount: 175,
    })),
    totalWordCount: 1300, durationSeconds: 3600, durationMinutes: 60,
  };
}

function artifact(variant: NarrativeVariantV5, approved: boolean): AutonomousNarrativeArtifactV5 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  const tourText = text();
  return {
    schemaVersion: 'autonomous-narrative-v5', status: approved ? 'machine_approved' : 'rejected',
    variant, evidenceFingerprint: evidence.fingerprint,
    plan, planFingerprint: narrativeClaimPlanFingerprintV4(plan),
    text: approved ? tourText : null,
    grounding: call(grounding()),
    proseAttempts: approved ? [call(tourText)] : [],
    finalCritiques: approved ? [call(report())] : [],
    failure: approved ? null : { code: 'content_rejected', message: 'Rejected.' },
  };
}

function paths(root: string): NarrativePilotFreezePathsV5 {
  return {
    qualificationPath: join(root, 'private', 'qualification.json'),
    artifactPath: join(root, 'private', 'artifact.json'),
    previewPath: join(root, 'public', 'preview.json'),
    manifestPath: join(root, 'private', 'manifest.json'),
  };
}

describe('NarrativeMadridPilotFreezeV5', () => {
  it('writes a linked prepared freeze without diagnostics in the public preview', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const candidates = new Map([
      ['on_site', artifact('on_site', true)],
      ['curiosity', artifact('curiosity', false)],
      ['documentary', artifact('documentary', false)],
    ] as const);
    const critiques = [call(report()), ...Array.from({ length: 4 }, () => call(report(true)))];
    const qualification = await runNarrativeMadridPilotQualificationV5(evidence, {
      criticModel: MODEL,
      runCandidate: async (variant) => candidates.get(variant)!,
      critique: async () => critiques.shift()!,
    });
    const outputPaths = paths(mkdtempSync(join(tmpdir(), 'narrative-v5-freeze-')));

    const expected = freezeNarrativeMadridPilotV5(qualification, evidence, outputPaths);
    const restored = readNarrativePilotFreezeDocumentsV5(outputPaths);

    expect(replayNarrativePilotFreezeDocumentsV5(restored, evidence)).toEqual(expected);
    expect(Object.values(outputPaths).every(existsSync)).toBe(true);
    expect(restored.manifest.payload.state).toBe('prepared');
    expect(restored.artifact.payload.publicTourStatus).toBe('review');
    const publicPreview = readFileSync(outputPaths.previewPath, 'utf8');
    expect(publicPreview).not.toMatch(/rawOutput|proseAttempts|diagnosticBundle|repairInstructions/);
  });
});
