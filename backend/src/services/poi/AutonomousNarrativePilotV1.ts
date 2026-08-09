import {
  EditorialAttemptV6,
  EditorialRequestOptionsV6,
} from './EditorialStructuredLlmV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  generateNarrativeCandidateV1,
  NARRATIVE_GENERATOR_PARAMETERS_V1,
} from './NarrativePilotDeepSeekV1';
import {
  buildNarrativeCriticRequestV1,
  evaluateNarrativeCriticGateV1,
  NarrativeCriticReportV1,
  validateNarrativeCriticReportV1,
} from './NarrativePilotCriticV1';
import {
  inspectNarrativeCriticModelV1,
  NarrativeCriticOptionsV1,
  NARRATIVE_CRITIC_MODEL_V1,
  NARRATIVE_CRITIC_PARAMETERS_V1,
  narrativeCriticPromptFingerprintV1,
  requestNarrativeCritiqueV1,
} from './NarrativePilotGemmaV1';
import {
  NarrativeScriptRequestV1,
  NARRATIVE_PILOT_MODEL_V1,
  narrativeContentFingerprintsV1,
  narrativePilotPromptFingerprintV1,
  SceneNarrativeScriptV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';

export const AUTONOMOUS_NARRATIVE_PILOT_ARTIFACT_SCHEMA_VERSION_V1 =
  'autonomous-narrative-pilot-artifact-v1' as const;

export interface AutonomousNarrativePilotFingerprintsV1 {
  route: string;
  evidence: string;
  text: string;
  prompts: { generator: string; critic: string };
  models: { generator: string; critic: string };
  parameters: { generator: string; critic: string };
  critique: string;
}

export type AutonomousNarrativePilotComponentV1 =
  | 'route'
  | 'evidence'
  | 'text'
  | 'prompts.generator'
  | 'prompts.critic'
  | 'models.generator'
  | 'models.critic'
  | 'parameters.generator'
  | 'parameters.critic'
  | 'critique';

export interface AutonomousNarrativePilotFailureV1 {
  stage: 'critic_preflight' | 'generation' | 'deterministic_validation' | 'critique';
  code:
    | 'model_unavailable'
    | 'transport_error'
    | 'malformed_response'
    | 'semantic_error'
    | 'critic_rejected'
    | 'internal_error';
  attempt: number | null;
  message: string;
}

export interface AutonomousNarrativePilotAttemptV1 {
  attempt: number;
  repairInstructions: string[];
  scripts: SceneNarrativeScriptV1[];
  generation: {
    provider: 'deepseek';
    model: typeof NARRATIVE_PILOT_MODEL_V1;
    status: EditorialAttemptV6['status'];
    attempts: EditorialAttemptV6[];
    promptFingerprint: string;
    responseFingerprint: string | null;
    parameters: typeof NARRATIVE_GENERATOR_PARAMETERS_V1;
  };
  critique: null | {
    provider: 'ollama';
    model: typeof NARRATIVE_CRITIC_MODEL_V1;
    modelDigest: string;
    status: EditorialAttemptV6['status'];
    attempts: EditorialAttemptV6[];
    promptFingerprint: string;
    responseFingerprint: string | null;
    parameters: typeof NARRATIVE_CRITIC_PARAMETERS_V1;
    report: NarrativeCriticReportV1 | null;
  };
}

export interface AutonomousNarrativePilotArtifactV1 {
  schemaVersion: typeof AUTONOMOUS_NARRATIVE_PILOT_ARTIFACT_SCHEMA_VERSION_V1;
  request: NarrativeScriptRequestV1;
  scripts: SceneNarrativeScriptV1[];
  attempts: AutonomousNarrativePilotAttemptV1[];
  status: 'machine_approved' | 'rejected';
  failure: AutonomousNarrativePilotFailureV1 | null;
  fingerprints: AutonomousNarrativePilotFingerprintsV1;
}

export interface AutonomousNarrativePilotOptionsV1 {
  generator?: EditorialRequestOptionsV6;
  critic?: NarrativeCriticOptionsV1;
}

function modelFingerprint(provider: string, model: string, digest?: string): string {
  return editorialFingerprintV7({ provider, model, ...(digest ? { digest } : {}) });
}

export function autonomousNarrativePilotFingerprintsV1(input: {
  request: NarrativeScriptRequestV1;
  scripts: SceneNarrativeScriptV1[];
  report: NarrativeCriticReportV1 | null;
  criticModelDigest: string;
  generatorPromptFingerprint?: string;
  criticPromptFingerprint?: string;
}): AutonomousNarrativePilotFingerprintsV1 {
  const content = narrativeContentFingerprintsV1(input.request, input.scripts);
  return {
    route: content.route,
    evidence: content.evidence,
    text: content.text,
    prompts: {
      generator: input.generatorPromptFingerprint ?? narrativePilotPromptFingerprintV1(),
      critic: input.criticPromptFingerprint ?? narrativeCriticPromptFingerprintV1(),
    },
    models: {
      generator: modelFingerprint('deepseek', NARRATIVE_PILOT_MODEL_V1),
      critic: modelFingerprint('ollama', NARRATIVE_CRITIC_MODEL_V1, input.criticModelDigest),
    },
    parameters: {
      generator: editorialFingerprintV7(NARRATIVE_GENERATOR_PARAMETERS_V1),
      critic: editorialFingerprintV7(NARRATIVE_CRITIC_PARAMETERS_V1),
    },
    critique: editorialFingerprintV7(input.report),
  };
}

const COMPONENTS: AutonomousNarrativePilotComponentV1[] = [
  'route', 'evidence', 'text', 'prompts.generator', 'prompts.critic',
  'models.generator', 'models.critic', 'parameters.generator',
  'parameters.critic', 'critique',
];

function componentValue(
  fingerprints: AutonomousNarrativePilotFingerprintsV1,
  component: AutonomousNarrativePilotComponentV1
): string {
  const [root, child] = component.split('.') as [keyof AutonomousNarrativePilotFingerprintsV1, string?];
  const value = fingerprints[root];
  return child ? (value as Record<string, string>)[child] : value as string;
}

export function changedAutonomousNarrativePilotComponentsV1(
  saved: AutonomousNarrativePilotFingerprintsV1,
  current: AutonomousNarrativePilotFingerprintsV1
): AutonomousNarrativePilotComponentV1[] {
  return COMPONENTS.filter((component) => (
    componentValue(saved, component) !== componentValue(current, component)
  ));
}

function lastError(attempts: EditorialAttemptV6[]): string {
  return attempts[attempts.length - 1]?.error ?? 'unknown model failure';
}

function candidateSceneWordCounts(candidate: unknown): Array<{ sceneId: string; count: number }> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
  const scripts = (candidate as Record<string, unknown>).scripts;
  if (!Array.isArray(scripts)) return [];
  return scripts.flatMap((script) => {
    if (!script || typeof script !== 'object' || Array.isArray(script)) return [];
    const value = script as Record<string, unknown>;
    if (typeof value.sceneId !== 'string' || !Array.isArray(value.blocks)
      || !value.transition || typeof value.transition !== 'object'
      || Array.isArray(value.transition)) return [];
    const blockTexts = value.blocks.map((block) => (
      block && typeof block === 'object' && !Array.isArray(block)
        ? (block as Record<string, unknown>).text
        : null
    ));
    const transitionText = (value.transition as Record<string, unknown>).text;
    if (blockTexts.some((text) => typeof text !== 'string')
      || typeof transitionText !== 'string') return [];
    const text = [...blockTexts as string[], transitionText].join(' ');
    return [{
      sceneId: value.sceneId,
      count: text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0,
    }];
  });
}

function deterministicRepairInstructions(error: string, candidate: unknown): string[] {
  const instructions = [
    `Corrige las tres escenas para superar la validación determinista: ${error}`,
  ];
  const counts = candidateSceneWordCounts(candidate);
  if (counts.length > 0) {
    instructions.push(
      `Conteos reales del candidato anterior: ${counts.map(({ sceneId, count }) => `${sceneId}=${count}`).join(', ')}. Recuenta el texto de los cinco bloques y la transición.`
    );
    for (const { sceneId, count } of counts) {
      if (count < 220) {
        instructions.push(`En ${sceneId}, añade aproximadamente ${245 - count} palabras sustentadas hasta acercarte a 245.`);
      } else if (count > 260) {
        instructions.push(`En ${sceneId}, reduce aproximadamente ${count - 245} palabras hasta acercarte a 245.`);
      } else {
        instructions.push(`Conserva ${sceneId} entre 220 y 260 palabras; no lo acortes ni lo alargues al reparar otra escena.`);
      }
    }
    return instructions;
  }
  const wordCount = error.match(/scene ([\w-]+) contains (\d+) actual words/);
  if (wordCount) {
    const sceneId = wordCount[1];
    const count = Number(wordCount[2]);
    const delta = Math.abs(count - 245);
    instructions.push(
      count > 245
        ? `En ${sceneId}, reduce aproximadamente ${delta} palabras hacia 245; conserva la estructura y no acortes más de lo necesario.`
        : `En ${sceneId}, añade aproximadamente ${delta} palabras sustentadas hacia 245; conserva la estructura y no alargues más de lo necesario.`
    );
  }
  return instructions;
}

function parsedCandidate(rawOutput: string | null): unknown {
  if (!rawOutput) return null;
  try {
    return JSON.parse(rawOutput);
  } catch {
    return null;
  }
}

function failedArtifact(
  request: NarrativeScriptRequestV1,
  scripts: SceneNarrativeScriptV1[],
  attempts: AutonomousNarrativePilotAttemptV1[],
  failure: AutonomousNarrativePilotFailureV1,
  criticModelDigest: string,
  report: NarrativeCriticReportV1 | null
): AutonomousNarrativePilotArtifactV1 {
  const last = attempts[attempts.length - 1];
  return {
    schemaVersion: AUTONOMOUS_NARRATIVE_PILOT_ARTIFACT_SCHEMA_VERSION_V1,
    request,
    scripts,
    attempts,
    status: 'rejected',
    failure,
    fingerprints: autonomousNarrativePilotFingerprintsV1({
      request,
      scripts,
      report,
      criticModelDigest,
      generatorPromptFingerprint: last?.generation.promptFingerprint,
      criticPromptFingerprint: last?.critique?.promptFingerprint,
    }),
  };
}

export async function runAutonomousNarrativePilotV1(
  request: NarrativeScriptRequestV1,
  options: AutonomousNarrativePilotOptionsV1 = {}
): Promise<AutonomousNarrativePilotArtifactV1> {
  validateNarrativeScriptRequestV1(request);
  let model;
  try {
    model = await inspectNarrativeCriticModelV1(options.critic);
  } catch (error) {
    return failedArtifact(request, [], [], {
      stage: 'critic_preflight', code: 'model_unavailable', attempt: null,
      message: error instanceof Error ? error.message : String(error),
    }, 'unresolved', null);
  }

  const attempts: AutonomousNarrativePilotAttemptV1[] = [];
  let repairInstructions: string[] = [];
  let previousCandidate: unknown = null;
  let scripts: SceneNarrativeScriptV1[] = [];
  let report: NarrativeCriticReportV1 | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let generation;
    try {
      generation = await generateNarrativeCandidateV1(
        request,
        options.generator,
        repairInstructions.length > 0 ? {
          instructions: repairInstructions,
          previousCandidate,
        } : undefined
      );
    } catch (error) {
      return failedArtifact(request, scripts, attempts, {
        stage: 'generation', code: 'internal_error', attempt,
        message: error instanceof Error ? error.message : String(error),
      }, model.digest, report);
    }
    const generationRecord: AutonomousNarrativePilotAttemptV1['generation'] = {
      provider: 'deepseek', model: NARRATIVE_PILOT_MODEL_V1,
      status: generation.status, attempts: generation.attempts,
      promptFingerprint: generation.promptFingerprint,
      responseFingerprint: generation.responseFingerprint,
      parameters: NARRATIVE_GENERATOR_PARAMETERS_V1,
    };
    if (!generation.value) {
      attempts.push({
        attempt, repairInstructions: [...repairInstructions], scripts: [],
        generation: generationRecord, critique: null,
      });
      if (generation.status === 'semantic_error' && attempt === 1) {
        previousCandidate = parsedCandidate(generation.rawOutput);
        repairInstructions = deterministicRepairInstructions(
          lastError(generation.attempts), previousCandidate
        );
        continue;
      }
      return failedArtifact(request, scripts, attempts, {
        stage: generation.status === 'semantic_error' ? 'deterministic_validation' : 'generation',
        code: generation.status === 'valid' ? 'internal_error' : generation.status,
        attempt,
        message: lastError(generation.attempts),
      }, model.digest, report);
    }
    scripts = generation.value;
    const criticRequest = buildNarrativeCriticRequestV1(request, scripts);
    let critique;
    try {
      critique = await requestNarrativeCritiqueV1(criticRequest, model, options.critic);
    } catch (error) {
      attempts.push({
        attempt, repairInstructions: [...repairInstructions], scripts,
        generation: generationRecord, critique: null,
      });
      return failedArtifact(request, scripts, attempts, {
        stage: 'critique', code: 'internal_error', attempt,
        message: error instanceof Error ? error.message : String(error),
      }, model.digest, report);
    }
    report = critique.value;
    const critiqueRecord: NonNullable<AutonomousNarrativePilotAttemptV1['critique']> = {
      provider: 'ollama', model: NARRATIVE_CRITIC_MODEL_V1, modelDigest: model.digest,
      status: critique.status, attempts: critique.attempts,
      promptFingerprint: critique.promptFingerprint,
      responseFingerprint: critique.responseFingerprint,
      parameters: NARRATIVE_CRITIC_PARAMETERS_V1,
      report,
    };
    attempts.push({
      attempt, repairInstructions: [...repairInstructions], scripts,
      generation: generationRecord, critique: critiqueRecord,
    });
    if (!report) {
      return failedArtifact(request, scripts, attempts, {
        stage: 'critique',
        code: critique.status === 'valid' ? 'internal_error' : critique.status,
        attempt,
        message: lastError(critique.attempts),
      }, model.digest, null);
    }
    const gate = evaluateNarrativeCriticGateV1(report);
    if (gate.passed) {
      return {
        schemaVersion: AUTONOMOUS_NARRATIVE_PILOT_ARTIFACT_SCHEMA_VERSION_V1,
        request,
        scripts,
        attempts,
        status: 'machine_approved',
        failure: null,
        fingerprints: autonomousNarrativePilotFingerprintsV1({
          request, scripts, report, criticModelDigest: model.digest,
          generatorPromptFingerprint: generation.promptFingerprint,
          criticPromptFingerprint: critique.promptFingerprint,
        }),
      };
    }
    if (attempt === 1) {
      previousCandidate = {
        schemaVersion: 'narrative-script-response-v1',
        scripts,
      };
      repairInstructions = [...report.repairInstructions];
      continue;
    }
    return failedArtifact(request, scripts, attempts, {
      stage: 'critique', code: 'critic_rejected', attempt,
      message: `critic rejected candidate: ${gate.reasons.join(', ')}`,
    }, model.digest, report);
  }
  throw new Error('autonomous narrative pilot exhausted attempts unexpectedly');
}

export function replayAutonomousNarrativePilotArtifactV1(
  value: unknown,
  currentRequest: NarrativeScriptRequestV1
): AutonomousNarrativePilotArtifactV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('autonomous narrative pilot artifact must be an object');
  }
  const root = value as Record<string, unknown>;
  const expectedRootKeys = [
    'schemaVersion', 'request', 'scripts', 'attempts', 'status', 'failure', 'fingerprints',
  ];
  if (Object.keys(root).sort().join(',') !== expectedRootKeys.sort().join(',')) {
    throw new Error('autonomous narrative pilot artifact has unexpected or missing fields');
  }
  const artifact = root as unknown as AutonomousNarrativePilotArtifactV1;
  if (artifact.schemaVersion !== AUTONOMOUS_NARRATIVE_PILOT_ARTIFACT_SCHEMA_VERSION_V1) {
    throw new Error('invalid autonomous narrative pilot artifact schemaVersion');
  }
  validateNarrativeScriptRequestV1(currentRequest);
  if (!artifact.request || typeof artifact.request !== 'object'
    || !Array.isArray(artifact.request.scenes) || !Array.isArray(artifact.request.routeSceneIds)) {
    throw new Error('autonomous narrative pilot original request is invalid');
  }
  validateNarrativeScriptRequestV1(artifact.request);
  if (editorialFingerprintV7(artifact.request) !== editorialFingerprintV7(currentRequest)) {
    throw new Error('autonomous narrative pilot original request changed');
  }
  if (!Array.isArray(artifact.attempts)
    || artifact.attempts.length < 1 || artifact.attempts.length > 2) {
    throw new Error('autonomous narrative pilot must contain one or two attempts');
  }
  if (artifact.status !== 'machine_approved' && artifact.status !== 'rejected') {
    throw new Error('autonomous narrative pilot status is invalid');
  }
  if (!Array.isArray(artifact.scripts)) {
    throw new Error('autonomous narrative pilot scripts must be an array');
  }
  if (artifact.scripts.length > 0) validateNarrativeScriptsV1(artifact.scripts, currentRequest);
  for (const [index, attempt] of artifact.attempts.entries()) {
    if (!attempt || typeof attempt !== 'object'
      || attempt.attempt !== index + 1
      || !Array.isArray(attempt.repairInstructions)
      || attempt.repairInstructions.some((instruction) => typeof instruction !== 'string')
      || !Array.isArray(attempt.scripts)
      || !attempt.generation || typeof attempt.generation !== 'object') {
      throw new Error(`autonomous narrative pilot attempt ${index + 1} is invalid`);
    }
    if (attempt.scripts.length > 0) validateNarrativeScriptsV1(attempt.scripts, artifact.request);
    if (attempt.generation.provider !== 'deepseek'
      || attempt.generation.model !== NARRATIVE_PILOT_MODEL_V1
      || !Array.isArray(attempt.generation.attempts)
      || typeof attempt.generation.promptFingerprint !== 'string') {
      throw new Error(`autonomous narrative pilot generation ${index + 1} is invalid`);
    }
    if (attempt.critique) {
      if (attempt.critique.provider !== 'ollama'
        || attempt.critique.model !== NARRATIVE_CRITIC_MODEL_V1
        || !/^[a-f0-9]{64}$/i.test(attempt.critique.modelDigest)
        || !Array.isArray(attempt.critique.attempts)
        || typeof attempt.critique.promptFingerprint !== 'string'
        || attempt.scripts.length === 0) {
        throw new Error(`autonomous narrative pilot critique ${index + 1} is invalid`);
      }
      if (attempt.critique.report) {
        validateNarrativeCriticReportV1(
          attempt.critique.report,
          buildNarrativeCriticRequestV1(artifact.request, attempt.scripts)
        );
      }
    }
  }
  const last = artifact.attempts[artifact.attempts.length - 1];
  const report = last.critique?.report ?? null;
  const fingerprints = artifact.fingerprints as unknown as Record<string, unknown> | null;
  const groupedFingerprintKeys = ['critic', 'generator'];
  const groupedFingerprintsValid = ['prompts', 'models', 'parameters'].every((key) => {
    const group = fingerprints?.[key];
    return !!group && typeof group === 'object' && !Array.isArray(group)
      && Object.keys(group).sort().join(',') === groupedFingerprintKeys.join(',')
      && Object.values(group).every((fingerprint) => (
        typeof fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(fingerprint)
      ));
  });
  if (!fingerprints
    || Object.keys(fingerprints).sort().join(',')
      !== ['critique', 'evidence', 'models', 'parameters', 'prompts', 'route', 'text'].join(',')
    || !['route', 'evidence', 'text', 'critique'].every((key) => (
      typeof fingerprints[key] === 'string' && /^[a-f0-9]{64}$/i.test(fingerprints[key] as string)
    ))
    || !groupedFingerprintsValid) {
    throw new Error('autonomous narrative pilot fingerprints are invalid');
  }
  const current = autonomousNarrativePilotFingerprintsV1({
    request: currentRequest,
    scripts: artifact.scripts,
    report,
    criticModelDigest: last.critique?.modelDigest ?? 'unresolved',
    generatorPromptFingerprint: last.generation.promptFingerprint,
    criticPromptFingerprint: last.critique?.promptFingerprint,
  });
  const changed = changedAutonomousNarrativePilotComponentsV1(artifact.fingerprints, current);
  if (changed.length > 0) {
    throw new Error(`autonomous narrative pilot changed components: ${changed.join(', ')}`);
  }
  if (artifact.status === 'machine_approved') {
    if (!report || !evaluateNarrativeCriticGateV1(report).passed || artifact.failure !== null
      || editorialFingerprintV7(artifact.scripts) !== editorialFingerprintV7(last.scripts)) {
      throw new Error('machine-approved narrative pilot does not pass the autonomous gate');
    }
  } else {
    const failure = artifact.failure as unknown as Record<string, unknown> | null;
    if (!failure
      || Object.keys(failure).sort().join(',') !== ['attempt', 'code', 'message', 'stage'].join(',')
      || typeof failure.message !== 'string' || !failure.message.trim()) {
      throw new Error('rejected narrative pilot requires a structured failure');
    }
  }
  return artifact;
}

export function serializeMachineApprovedNarrativePilotArtifactV1(
  artifact: AutonomousNarrativePilotArtifactV1
): string {
  if (artifact.status !== 'machine_approved') {
    throw new Error('only machine-approved narrative pilot artifacts can be frozen');
  }
  replayAutonomousNarrativePilotArtifactV1(artifact, artifact.request);
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
