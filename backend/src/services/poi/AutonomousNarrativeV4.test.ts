import {
  AutonomousNarrativeServicesV4,
  runAutonomousNarrativeV4,
} from './AutonomousNarrativeV4';
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

function failed<T>(status: 'transport_error' | 'malformed_response' | 'semantic_error'):
EditorialCallResultV6<T> {
  return {
    callId: 'test', status, value: null,
    attempts: [{ attempt: 1, status, latencyMs: 10, rawOutput: null, error: status }],
    model: 'test', promptFingerprint: 'a'.repeat(64), responseFingerprint: null,
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: null,
  };
}

function grounding(clean = true): NarrativeGroundingCriticReportV4 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v4',
    unsupportedClaims: clean ? [] : [{
      sceneId: 'palace',
      claimId: 'palace:opening:palace-contrast',
      severity: 'critical',
      detail: 'No está respaldado.',
    }],
    improperCausality: [],
    unsupportedInterpretations: [],
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
        sceneId: scene.sceneId, score: 4, rationale: 'Escena clara y fiel.',
      })),
    },
  };
}

function text(marker = 'original'): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4', introduction: `Introducción ${marker}`,
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId, kind: block.kind, text: `Texto ${marker} para ${block.kind}.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition,
      bodyWordCount: 170,
    })),
    totalWordCount: 1250, durationSeconds: 3600, durationMinutes: 60,
  };
}

function services(options: {
  grounding?: EditorialCallResultV6<NarrativeGroundingCriticReportV4>;
  prose?: EditorialCallResultV6<NarrativeTourTextV4>[];
  final?: EditorialCallResultV6<NarrativeCriticReportV4>[];
} = {}): AutonomousNarrativeServicesV4 & {
  critiqueGrounding: jest.Mock;
  generateProse: jest.Mock;
  critiqueFinal: jest.Mock;
} {
  const prose = [...(options.prose ?? [call(text())])];
  const final = [...(options.final ?? [call(report())])];
  return {
    critiqueGrounding: jest.fn(async () => options.grounding ?? call(grounding())),
    generateProse: jest.fn(async () => (
      prose.shift() ?? failed<NarrativeTourTextV4>('semantic_error')
    )),
    critiqueFinal: jest.fn(async () => (
      final.shift() ?? failed<NarrativeCriticReportV4>('semantic_error')
    )),
  };
}

describe('AutonomousNarrativeV4', () => {
  it('approves only after the deterministic plan grounding and final gates pass', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const mocks = services();
    const artifact = await runAutonomousNarrativeV4({ evidence, variant: 'on_site' }, mocks);

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.text).not.toBeNull();
    expect(artifact.plan).toEqual(buildNarrativeClaimPlanV4(evidence));
    expect(mocks.critiqueGrounding.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.generateProse.mock.invocationCallOrder[0]);
  });

  it('rejects a failed deterministic plan grounding without asking a model to repair evidence', async () => {
    const mocks = services({ grounding: call(grounding(false)) });
    const artifact = await runAutonomousNarrativeV4({
      evidence: loadMadridNarrativeEvidenceCaseV4(), variant: 'curiosity',
    }, mocks);

    expect(artifact).toMatchObject({
      status: 'rejected', text: null,
      failure: { code: 'evidence_grounding_failed' },
    });
    expect(mocks.generateProse).not.toHaveBeenCalled();
  });

  it('allows one complete prose repair and approves the repaired route', async () => {
    const mocks = services({
      prose: [call(text('first')), call(text('repaired'))],
      final: [call(report(3)), call(report(4))],
    });
    const artifact = await runAutonomousNarrativeV4({
      evidence: loadMadridNarrativeEvidenceCaseV4(), variant: 'documentary',
    }, mocks);

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.text?.introduction).toContain('repaired');
    expect(mocks.generateProse).toHaveBeenCalledTimes(2);
    expect(mocks.generateProse.mock.calls[1][3]).toMatchObject({
      previousCandidate: expect.anything(),
      instructions: expect.arrayContaining([expect.stringContaining('curiosity')]),
    });
  });

  it('rejects a second content failure and never retains text as approved', async () => {
    const mocks = services({
      prose: [call(text('first')), call(text('second'))],
      final: [call(report(3)), call(report(3))],
    });
    const artifact = await runAutonomousNarrativeV4({
      evidence: loadMadridNarrativeEvidenceCaseV4(), variant: 'on_site',
    }, mocks);

    expect(artifact).toMatchObject({ status: 'rejected', text: null });
    expect(artifact.failure?.code).toBe('content_rejected');
    expect(artifact.proseAttempts).toHaveLength(2);
  });

  it('does not consume the content repair when one writer call recovered at protocol level', async () => {
    const recovered = call(text('recovered'));
    recovered.attempts.unshift({
      attempt: 1, status: 'transport_error', latencyMs: 5, rawOutput: null, error: 'temporary',
    });
    recovered.attempts[1].attempt = 2;
    const mocks = services({ prose: [recovered] });
    const artifact = await runAutonomousNarrativeV4({
      evidence: loadMadridNarrativeEvidenceCaseV4(), variant: 'on_site',
    }, mocks);

    expect(artifact.status).toBe('machine_approved');
    expect(mocks.generateProse).toHaveBeenCalledTimes(1);
    expect(artifact.proseAttempts).toHaveLength(1);
  });

  it('fails closed on exhausted protocol errors and critiques taking 180 seconds', async () => {
    const protocol = services({ prose: [failed<NarrativeTourTextV4>('transport_error')] });
    const protocolArtifact = await runAutonomousNarrativeV4({
      evidence: loadMadridNarrativeEvidenceCaseV4(), variant: 'on_site',
    }, protocol);
    expect(protocolArtifact).toMatchObject({
      status: 'rejected', text: null, failure: { code: 'writer_protocol_failed' },
    });

    const slow = call(report());
    slow.attempts[0].latencyMs = 180_000;
    const slowArtifact = await runAutonomousNarrativeV4({
      evidence: loadMadridNarrativeEvidenceCaseV4(), variant: 'on_site',
    }, services({ final: [slow] }));
    expect(slowArtifact).toMatchObject({
      status: 'rejected', text: null, failure: { code: 'critic_timeout' },
    });
  });
});
