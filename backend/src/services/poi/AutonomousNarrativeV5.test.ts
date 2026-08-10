import {
  AutonomousNarrativeServicesV5,
  runAutonomousNarrativeV5,
} from './AutonomousNarrativeV5';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import {
  NarrativeCriticReportV4,
  NarrativeGroundingCriticReportV4,
} from './NarrativeCriticV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

function call<T>(value: T): EditorialCallResultV6<T> {
  return {
    callId: 'test', status: 'valid', value,
    attempts: [{ attempt: 1, status: 'valid', latencyMs: 10, rawOutput: '{}', error: null }],
    model: 'test', promptFingerprint: 'a'.repeat(64), responseFingerprint: 'b'.repeat(64),
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: '{}',
  };
}

function semanticFailure(issues: Array<{ path: string; message: string }>):
EditorialCallResultV6<NarrativeTourTextV4> {
  const expanded = issues.map((issue) => ({
    code: 'word_count', sceneId: null, ...issue,
  }));
  return {
    callId: 'test', status: 'semantic_error', value: null,
    attempts: [{
      attempt: 1, status: 'semantic_error', latencyMs: 10,
      rawOutput: '{"draft":"first"}',
      error: `narrative_prose_validation_v5:${JSON.stringify(expanded)}`,
    }],
    model: 'test', promptFingerprint: 'a'.repeat(64), responseFingerprint: 'b'.repeat(64),
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: '{"draft":"first"}',
  };
}

function grounding(): NarrativeGroundingCriticReportV4 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v4',
    unsupportedClaims: [], improperCausality: [], unsupportedInterpretations: [],
    meaningChangingOmissions: [],
  };
}

function report(score = 4): NarrativeCriticReportV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v4',
    newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: score, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Escena fiel y natural.',
      })),
    },
  };
}

function text(marker: string): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4',
    introduction: `Introducción ${marker}.`,
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId,
        kind: block.kind,
        text: `Texto ${marker} para ${block.kind}.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition,
      bodyWordCount: 175,
    })),
    totalWordCount: 1300,
    durationSeconds: 3600,
    durationMinutes: 60,
  };
}

function services(prose: EditorialCallResultV6<NarrativeTourTextV4>[], final = [call(report())]):
AutonomousNarrativeServicesV5 & { generateProse: jest.Mock; critiqueFinal: jest.Mock } {
  const proseQueue = [...prose];
  const finalQueue = [...final];
  return {
    critiqueGrounding: async () => call(grounding()),
    generateProse: jest.fn(async () => proseQueue.shift()!),
    critiqueFinal: jest.fn(async () => finalQueue.shift()!),
  };
}

describe('AutonomousNarrativeV5', () => {
  it('repairs one complete route with every deterministic error and then approves it', async () => {
    const first = semanticFailure([
      { path: 'introduction', message: 'introduction must contain 45 to 75 Unicode words' },
      { path: 'scripts[0]', message: 'palace body must contain 160 to 200 Unicode words' },
      { path: 'scripts[6]', message: 'unknown proper noun: Aurelio Valdés' },
    ]);
    const mocks = services([first, call(text('repaired'))]);

    const artifact = await runAutonomousNarrativeV5({
      evidence: loadMadridNarrativeEvidenceCaseV4(),
      variant: 'on_site',
    }, mocks);

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.text?.introduction).toContain('repaired');
    expect(mocks.generateProse).toHaveBeenCalledTimes(2);
    expect(mocks.generateProse.mock.calls[1][3]).toEqual({
      previousCandidate: { draft: 'first' },
      instructions: [
        'Corrige introduction: introduction must contain 45 to 75 Unicode words',
        'Corrige scripts[0]: palace body must contain 160 to 200 Unicode words',
        'Corrige scripts[6]: unknown proper noun: Aurelio Valdés',
      ],
    });
  });

  it('exposes concrete validation errors when the complete repair still fails', async () => {
    const failure = semanticFailure([
      { path: 'scripts[1]', message: 'look block does not develop the official visual cue' },
      { path: 'scripts[4]', message: 'unknown number: 2048' },
    ]);
    const artifact = await runAutonomousNarrativeV5({
      evidence: loadMadridNarrativeEvidenceCaseV4(),
      variant: 'curiosity',
    }, services([failure, failure]));

    expect(artifact).toMatchObject({ status: 'rejected', text: null });
    expect(artifact.failure?.message).toContain('scripts[1]');
    expect(artifact.failure?.message).toContain('unknown number: 2048');
  });

  it('uses the same single repair budget for a factual critic rejection', async () => {
    const mocks = services(
      [call(text('first')), call(text('critic-repaired'))],
      [call(report(3)), call(report(4))]
    );
    const artifact = await runAutonomousNarrativeV5({
      evidence: loadMadridNarrativeEvidenceCaseV4(),
      variant: 'documentary',
    }, mocks);

    expect(artifact.status).toBe('machine_approved');
    expect(mocks.generateProse.mock.calls[1][3].instructions)
      .toEqual(expect.arrayContaining([expect.stringContaining('curiosity')]));
  });
});
