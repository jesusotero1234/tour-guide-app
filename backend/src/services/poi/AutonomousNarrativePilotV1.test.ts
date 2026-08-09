import { readFileSync } from 'fs';
import { join } from 'path';
import {
  autonomousNarrativePilotFingerprintsV1,
  changedAutonomousNarrativePilotComponentsV1,
  replayAutonomousNarrativePilotArtifactV1,
  runAutonomousNarrativePilotV1,
  serializeMachineApprovedNarrativePilotArtifactV1,
} from './AutonomousNarrativePilotV1';
import { NarrativeCriticReportV1 } from './NarrativePilotCriticV1';
import { NARRATIVE_CRITIC_MODEL_V1 } from './NarrativePilotGemmaV1';
import { NarrativeScriptResponseV1 } from './NarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const DIGEST = '4eb23ef187e2c5462566d6a1d3bbbc2f1346d0b4327cbb66d58fffbcc9b2b05c';

function load<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

function fixture() {
  const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
  const response = load<NarrativeScriptResponseV1>(
    'narrative-pilot-v1', 'paris-premium-es.response.json'
  );
  return { request: buildParisNarrativeScriptRequestV1(route), response };
}

function report(verdict: 'approve' | 'reject' = 'approve'): NarrativeCriticReportV1 {
  const rejected = verdict === 'reject';
  return {
    schemaVersion: 'narrative-critic-report-v1',
    verdict,
    unsupportedClaims: rejected ? [{
      sceneId: 'louvre', severity: 'critical', claim: 'Atribución inventada.',
      detail: 'No aparece en la evidencia permitida.',
    }] : [],
    misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: [
        { sceneId: 'notre-dame', score: 4, rationale: 'Clara.' },
        { sceneId: 'louvre', score: 4, rationale: 'Clara.' },
        { sceneId: 'palais-royal', score: 4, rationale: 'Clara.' },
      ],
    },
    premiumReadiness: 4,
    repairInstructions: rejected ? ['Eliminar la atribución no sustentada del Louvre.'] : [],
  };
}

function tags() {
  return { data: { models: [{
    name: NARRATIVE_CRITIC_MODEL_V1,
    digest: DIGEST,
    size: 7_556_508_396,
    details: { parameter_size: '11.9B', quantization_level: 'Q4_K_M' },
  }] } };
}

function deepSeekResponse(value: unknown): { data: unknown } {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: 'submit_narrative_pilot_v1', arguments: JSON.stringify(value),
  } }] } }] } };
}

function ollamaResponse(value: unknown, raw = false): { data: unknown } {
  return { data: { message: { content: raw ? String(value) : JSON.stringify(value) } } };
}

function options(generatorValues: unknown[], criticValues: Array<unknown | Error>) {
  const generator = [...generatorValues];
  const critic = [...criticValues];
  const post = jest.fn(async (url: string, _body: Record<string, unknown>) => {
    if (url.includes('deepseek')) return deepSeekResponse(generator.shift());
    const next = critic.shift();
    if (next instanceof Error) throw next;
    return ollamaResponse(next, next === '{');
  });
  return {
    post,
    value: {
      generator: { apiKey: 'test-key', post },
      critic: { ollamaHost: 'http://ollama:11434', get: jest.fn(async () => tags()), post },
    },
  };
}

describe('autonomous Paris narrative pilot v1', () => {
  it('machine-approves one valid candidate after one joint generation and critique', async () => {
    const { request, response } = fixture();
    const mock = options([response], [report()]);

    const artifact = await runAutonomousNarrativePilotV1(request, mock.value);

    expect(artifact).toMatchObject({
      status: 'machine_approved',
      failure: null,
      scripts: response.scripts,
      attempts: [{ attempt: 1, critique: { report: { verdict: 'approve' } } }],
    });
    expect(mock.post).toHaveBeenCalledTimes(2);
    expect(artifact.fingerprints.models.critic).toBeTruthy();
  });

  it('regenerates all scenes once from the first repair report and then approves', async () => {
    const { request, response } = fixture();
    const mock = options([response, response], [report('reject'), report()]);

    const artifact = await runAutonomousNarrativePilotV1(request, mock.value);

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.attempts).toHaveLength(2);
    expect(artifact.attempts[1].repairInstructions).toEqual([
      'Eliminar la atribución no sustentada del Louvre.',
    ]);
    const secondGeneratorBody = mock.post.mock.calls.filter(([url]) => url.includes('deepseek'))[1][1];
    expect(JSON.stringify(secondGeneratorBody)).toContain('Eliminar la atribución');
    expect(JSON.stringify(secondGeneratorBody)).toContain('previousCandidate');
    expect(JSON.stringify(secondGeneratorBody)).toContain(response.scripts[0].blocks[0].text);
  });

  it('regenerates all scenes once after deterministic semantic validation fails', async () => {
    const { request, response } = fixture();
    const invalid = structuredClone(response);
    invalid.scripts[0].transition.targetSceneId = 'louvre';
    const mock = options([invalid, response], [report()]);

    const artifact = await runAutonomousNarrativePilotV1(request, mock.value);

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.attempts).toHaveLength(2);
    expect(artifact.attempts[0]).toMatchObject({
      generation: { status: 'semantic_error' }, critique: null,
    });
    expect(artifact.attempts[1].repairInstructions[0]).toContain('validación determinista');
    expect(artifact.attempts[1].repairInstructions).toEqual(expect.arrayContaining([
      expect.stringContaining('Conteos reales del candidato anterior'),
      expect.stringContaining('Conserva notre-dame'),
      expect.stringContaining('Conserva louvre'),
      expect.stringContaining('Conserva palais-royal'),
    ]));
    const secondGeneratorBody = mock.post.mock.calls.filter(([url]) => url.includes('deepseek'))[1][1];
    expect(JSON.stringify(secondGeneratorBody)).toContain('previousCandidate');
    expect(JSON.stringify(secondGeneratorBody)).toContain(invalid.scripts[0].blocks[0].text);
  });

  it('rejects after a second critic rejection even when style scores pass', async () => {
    const { request, response } = fixture();
    const mock = options([response, response], [report('reject'), report('reject')]);

    const artifact = await runAutonomousNarrativePilotV1(request, mock.value);

    expect(artifact).toMatchObject({
      status: 'rejected',
      failure: { stage: 'critique', code: 'critic_rejected', attempt: 2 },
    });
    expect(artifact.attempts).toHaveLength(2);
  });

  it.each([
    ['persistent transport failure', [new Error('Ollama down'), new Error('Ollama down')]],
    ['persistent malformed JSON', ['{', '{']],
  ])('rejects closed when the critic has %s', async (_label, criticValues) => {
    const { request, response } = fixture();
    const mock = options([response], criticValues);

    const artifact = await runAutonomousNarrativePilotV1(request, mock.value);

    expect(artifact.status).toBe('rejected');
    expect(artifact.failure).toMatchObject({ stage: 'critique', attempt: 1 });
    expect(artifact.attempts).toHaveLength(1);
    expect(artifact.attempts[0].critique?.report).toBeNull();
  });

  it('fingerprints route, evidence, text, prompts, models, parameters, and critique independently', () => {
    const { request, response } = fixture();
    const saved = autonomousNarrativePilotFingerprintsV1({
      request,
      scripts: response.scripts,
      report: report(),
      criticModelDigest: DIGEST,
    });
    expect(changedAutonomousNarrativePilotComponentsV1(saved, structuredClone(saved))).toEqual([]);

    for (const component of [
      'route', 'evidence', 'text', 'prompts.generator', 'prompts.critic',
      'models.generator', 'models.critic', 'parameters.generator',
      'parameters.critic', 'critique',
    ] as const) {
      const changed = structuredClone(saved);
      const [group, child] = component.split('.') as [string, string | undefined];
      if (child) {
        (changed[group as keyof typeof changed] as Record<string, string>)[child] = `changed-${component}`;
      } else {
        (changed as unknown as Record<string, string>)[group] = `changed-${component}`;
      }
      expect(changedAutonomousNarrativePilotComponentsV1(saved, changed)).toEqual([component]);
    }
  });

  it('contains no human review state in its public artifact', async () => {
    const { request, response } = fixture();
    const artifact = await runAutonomousNarrativePilotV1(
      request, options([response], [report()]).value
    );
    const keys = JSON.stringify(artifact);

    expect(keys).not.toContain('review_required');
    expect(keys).not.toContain('reviewerId');
    expect(keys).not.toContain('wouldPay');
    expect(keys).not.toContain('nextRevisionLayer');
    expect(keys).not.toContain('"reviews"');
  });

  it('serializes only machine-approved artifacts for offline replay', async () => {
    const { request, response } = fixture();
    const approved = await runAutonomousNarrativePilotV1(
      request, options([response], [report()]).value
    );
    const serialized = serializeMachineApprovedNarrativePilotArtifactV1(approved);
    const replayed = replayAutonomousNarrativePilotArtifactV1(
      JSON.parse(serialized), request
    );
    expect(replayed.status).toBe('machine_approved');

    const changedRequest = structuredClone(approved);
    changedRequest.request.promise = `${changedRequest.request.promise} cambiado`;
    expect(() => replayAutonomousNarrativePilotArtifactV1(changedRequest, request))
      .toThrow('original request');

    const malformedReport = structuredClone(approved);
    const savedReport = malformedReport.attempts[0].critique?.report;
    if (!savedReport) throw new Error('approved fixture requires a critic report');
    savedReport.scores.scenes[0].score = 6;
    expect(() => replayAutonomousNarrativePilotArtifactV1(malformedReport, request))
      .toThrow('integer from 1 to 5');

    const humanState = { ...structuredClone(approved), reviews: [] };
    expect(() => replayAutonomousNarrativePilotArtifactV1(humanState, request))
      .toThrow('unexpected or missing fields');

    const rejected = await runAutonomousNarrativePilotV1(
      request, options([response, response], [report('reject'), report('reject')]).value
    );
    expect(() => serializeMachineApprovedNarrativePilotArtifactV1(rejected))
      .toThrow('only machine-approved');
  });
});
