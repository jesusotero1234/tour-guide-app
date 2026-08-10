import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AutonomousNarrativeArtifactV4 } from './AutonomousNarrativeV4';
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
  NarrativePilotFreezePathsV4,
  freezeNarrativeMadridPilotV4,
  readNarrativePilotFreezeDocumentsV4,
  replayNarrativePilotFreezeDocumentsV4,
} from './NarrativeMadridPilotFreezeV4';
import { runNarrativeMadridPilotQualificationV4 } from './NarrativeMadridPilotQualificationV4';
import { NarrativeVariantV4 } from './NarrativePilotWriterV4';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

const MODEL: NarrativeCriticModelInfoV4 = {
  name: NARRATIVE_CRITIC_MODEL_V4,
  digest: NARRATIVE_CRITIC_DIGEST_V4,
  parameterSize: '12B',
  quantizationLevel: 'Q4_K_M',
  sizeBytes: 8_500,
  sizeVramBytes: 8_500,
  fullyGpu: true,
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
      claim: 'Mutación.', detail: 'Hallazgo factual.',
    }] : [],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Escena válida.',
      })),
    },
  };
}

function text(): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4', introduction: 'Introducción congelada.',
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId, name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId, kind: block.kind,
        text: `Texto validado para ${scene.name} y ${block.kind}.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition, bodyWordCount: 170,
    })),
    totalWordCount: 1250, durationSeconds: 3600, durationMinutes: 60,
  };
}

function artifact(variant: NarrativeVariantV4, approved: boolean): AutonomousNarrativeArtifactV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  const tourText = text();
  return {
    schemaVersion: 'autonomous-narrative-v4',
    status: approved ? 'machine_approved' : 'rejected', variant,
    evidenceFingerprint: evidence.fingerprint,
    plan, planFingerprint: narrativeClaimPlanFingerprintV4(plan),
    text: approved ? tourText : null,
    grounding: call(grounding()),
    proseAttempts: approved ? [call(tourText)] : [],
    finalCritiques: approved ? [call(report())] : [],
    failure: approved ? null : { code: 'content_rejected', message: 'Rejected.' },
  };
}

async function qualification() {
  const candidates = new Map([
    ['on_site', artifact('on_site', true)],
    ['curiosity', artifact('curiosity', false)],
    ['documentary', artifact('documentary', false)],
  ] as const);
  const critiques = [call(report()), ...Array.from({ length: 4 }, () => call(report(true)))];
  return runNarrativeMadridPilotQualificationV4(loadMadridNarrativeEvidenceCaseV4(), {
    criticModel: MODEL,
    runCandidate: async (variant) => candidates.get(variant)!,
    critique: async () => critiques.shift()!,
  });
}

function paths(root: string): NarrativePilotFreezePathsV4 {
  return {
    qualificationPath: join(root, 'private', 'qualification.json'),
    artifactPath: join(root, 'private', 'artifact.json'),
    previewPath: join(root, 'public', 'preview.json'),
    manifestPath: join(root, 'private', 'manifest.json'),
  };
}

describe('NarrativeMadridPilotFreezeV4', () => {
  it('atomically writes four mutually linked replayable outputs', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const result = await qualification();
    const root = mkdtempSync(join(tmpdir(), 'narrative-v4-freeze-'));
    const outputPaths = paths(root);
    const expected = freezeNarrativeMadridPilotV4(result, evidence, outputPaths);
    const restored = readNarrativePilotFreezeDocumentsV4(outputPaths);

    expect(replayNarrativePilotFreezeDocumentsV4(restored, evidence)).toEqual(expected);
    expect(Object.values(outputPaths).every(existsSync)).toBe(true);
    expect(restored.manifest.payload).toMatchObject({
      state: 'prepared',
      machineApprovalMeans: 'safe_to_test',
      machineApprovalIsDemandEvidence: false,
      participantsRecorded: false,
      demandDemonstrated: false,
    });
    const publicPreview = readFileSync(outputPaths.previewPath, 'utf8');
    expect(publicPreview).not.toMatch(/rawOutput|apiKey|systemPrompt|DEEPSEEK_API_KEY/);
  });

  it('detects changed cross fingerprints during replay', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const result = await qualification();
    const root = mkdtempSync(join(tmpdir(), 'narrative-v4-replay-'));
    const documents = freezeNarrativeMadridPilotV4(result, evidence, paths(root));
    documents.preview.freezeLinks.artifact = 'f'.repeat(64);
    expect(() => replayNarrativePilotFreezeDocumentsV4(documents, evidence))
      .toThrow('cross fingerprints changed');
  });

  it('does not overwrite or partially publish when staging fails', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const result = await qualification();
    const root = mkdtempSync(join(tmpdir(), 'narrative-v4-failure-'));
    const outputPaths = paths(root);
    mkdirSync(join(root, 'private'));
    writeFileSync(outputPaths.qualificationPath.replace('/private/qualification.json', '/blocker'), 'file');
    outputPaths.previewPath = join(root, 'blocker', 'preview.json');
    writeFileSync(outputPaths.qualificationPath, 'old qualification', { flag: 'wx' });

    expect(() => freezeNarrativeMadridPilotV4(result, evidence, outputPaths)).toThrow();
    expect(readFileSync(outputPaths.qualificationPath, 'utf8')).toBe('old qualification');
    expect(existsSync(outputPaths.artifactPath)).toBe(false);
    expect(existsSync(outputPaths.manifestPath)).toBe(false);
  });
});
