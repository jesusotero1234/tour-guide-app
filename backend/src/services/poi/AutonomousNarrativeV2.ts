import { EditorialAttemptV6, EditorialCallResultV6, EditorialRequestOptionsV6 } from './EditorialStructuredLlmV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeBenchmarkCaseV2,
  NarrativeSourceFactV2,
  buildNarrativeScriptRequestFromCaseV2,
  narrativeEvidenceProvenanceFingerprintV2,
  validateNarrativeBenchmarkCaseV2,
} from './NarrativeBenchmarkCaseV2';
import {
  NarrativeClaimPlanV1,
  validateNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import {
  NARRATIVE_GENERATOR_MODEL_V2,
  NARRATIVE_GENERATOR_PARAMETERS_V2,
  NarrativeStageRepairV2,
  generateNarrativeClaimPlanV2,
  generateNarrativeProseV2,
  narrativePlanGeneratorPromptFingerprintV2,
  narrativeProseGeneratorPromptFingerprintV2,
} from './NarrativePilotDeepSeekV2';
import {
  NarrativeCriticReportV2,
  NarrativeGroundingCriticReportV1,
  buildNarrativeCriticRequestV2,
  buildNarrativeGroundingCriticRequestV1,
  evaluateNarrativeCriticGateV2,
  evaluateNarrativeGroundingGateV1,
  validateNarrativeCriticReportV2,
  validateNarrativeGroundingCriticReportV1,
} from './NarrativePilotCriticV2';
import {
  NARRATIVE_CRITIC_MODEL_V2,
  NARRATIVE_CRITIC_PARAMETERS_V2,
  NarrativeCriticModelInfoV2,
  NarrativeCriticOptionsV2,
  inspectNarrativeCriticModelV2,
  narrativeFinalCriticPromptFingerprintV2,
  narrativeGroundingCriticPromptFingerprintV2,
  requestNarrativeFinalCritiqueV2,
  requestNarrativeGroundingCritiqueV2,
} from './NarrativePilotGemmaV2';
import {
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
  narrativeContentFingerprintsV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';

export const AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V2 =
  'autonomous-narrative-artifact-v2' as const;

export const AUTONOMOUS_NARRATIVE_POLICIES_V2 = {
  planContentRepairs: 1,
  proseContentRepairs: 1,
  invalidCriticReportProtocolRetries: 1,
  blockSpaceTokens: { minimum: 42, maximum: 45 },
  transitionSpaceTokens: { minimum: 22, maximum: 25 },
  sceneUnicodeWords: { minimum: 220, maximum: 260 },
  finalGate: {
    maximumFactualFindings: 0,
    minimumDimensionScore: 4,
    minimumSceneScore: 3,
    minimumPremiumReadiness: 4,
  },
  statuses: ['machine_approved', 'rejected'],
} as const;

export interface AutonomousNarrativeFingerprintsV2 {
  route: string;
  evidence: string;
  evidenceProvenance: string;
  plan: string;
  text: string;
  prompts: {
    planGenerator: string;
    groundingCritic: string;
    proseGenerator: string;
    finalCritic: string;
  };
  models: {
    planGenerator: string;
    groundingCritic: string;
    proseGenerator: string;
    finalCritic: string;
  };
  parameters: {
    planGenerator: string;
    groundingCritic: string;
    proseGenerator: string;
    finalCritic: string;
  };
  policies: string;
  critiques: { grounding: string; final: string };
}

export interface AutonomousNarrativeCallRecordV2<T> {
  status: EditorialAttemptV6['status'];
  attempts: EditorialAttemptV6[];
  promptFingerprint: string;
  responseFingerprint: string | null;
  protocolCallCount: number;
  report: T | null;
}

export interface AutonomousNarrativeGenerationRecordV2 {
  status: EditorialAttemptV6['status'];
  attempts: EditorialAttemptV6[];
  promptFingerprint: string;
  responseFingerprint: string | null;
}

export interface AutonomousNarrativePlanAttemptV2 {
  contentAttempt: number;
  repairInstructions: string[];
  plan: NarrativeClaimPlanV1 | null;
  generation: AutonomousNarrativeGenerationRecordV2;
  grounding: AutonomousNarrativeCallRecordV2<NarrativeGroundingCriticReportV1> | null;
}

export interface AutonomousNarrativeProseAttemptV2 {
  contentAttempt: number;
  repairInstructions: string[];
  scripts: SceneNarrativeScriptV1[];
  generation: AutonomousNarrativeGenerationRecordV2;
  critique: AutonomousNarrativeCallRecordV2<NarrativeCriticReportV2> | null;
}

export interface AutonomousNarrativeFailureV2 {
  stage:
    | 'critic_preflight'
    | 'plan_generation'
    | 'plan_validation'
    | 'grounding_critique'
    | 'prose_generation'
    | 'prose_validation'
    | 'final_critique';
  code:
    | 'model_unavailable'
    | 'transport_error'
    | 'malformed_response'
    | 'semantic_error'
    | 'protocol_failed'
    | 'critic_rejected'
    | 'internal_error';
  contentAttempt: number | null;
  message: string;
}

export interface AutonomousNarrativeArtifactV2 {
  schemaVersion: typeof AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V2;
  caseId: string;
  request: NarrativeScriptRequestV1;
  sourceEvidence: Array<{ sceneId: string; evidenceFacts: NarrativeSourceFactV2[] }>;
  plan: NarrativeClaimPlanV1 | null;
  scripts: SceneNarrativeScriptV1[];
  planAttempts: AutonomousNarrativePlanAttemptV2[];
  proseAttempts: AutonomousNarrativeProseAttemptV2[];
  criticModel: NarrativeCriticModelInfoV2 | null;
  status: 'machine_approved' | 'rejected';
  failure: AutonomousNarrativeFailureV2 | null;
  fingerprints: AutonomousNarrativeFingerprintsV2;
}

export interface AutonomousNarrativeServicesV2 {
  inspectCriticModel: (
    options?: NarrativeCriticOptionsV2
  ) => Promise<NarrativeCriticModelInfoV2>;
  generatePlan: (
    request: NarrativeScriptRequestV1,
    options?: EditorialRequestOptionsV6,
    repair?: NarrativeStageRepairV2
  ) => Promise<EditorialCallResultV6<NarrativeClaimPlanV1>>;
  critiquePlan: (
    request: ReturnType<typeof buildNarrativeGroundingCriticRequestV1>,
    model: NarrativeCriticModelInfoV2,
    options?: NarrativeCriticOptionsV2
  ) => Promise<EditorialCallResultV6<NarrativeGroundingCriticReportV1>>;
  generateProse: (
    request: NarrativeScriptRequestV1,
    plan: NarrativeClaimPlanV1,
    options?: EditorialRequestOptionsV6,
    repair?: NarrativeStageRepairV2
  ) => Promise<EditorialCallResultV6<SceneNarrativeScriptV1[]>>;
  critiqueProse: (
    request: ReturnType<typeof buildNarrativeCriticRequestV2>,
    model: NarrativeCriticModelInfoV2,
    options?: NarrativeCriticOptionsV2
  ) => Promise<EditorialCallResultV6<NarrativeCriticReportV2>>;
}

export interface AutonomousNarrativeOptionsV2 {
  generator?: EditorialRequestOptionsV6;
  critic?: NarrativeCriticOptionsV2;
  services?: AutonomousNarrativeServicesV2;
}

const DEFAULT_SERVICES: AutonomousNarrativeServicesV2 = {
  inspectCriticModel: inspectNarrativeCriticModelV2,
  generatePlan: generateNarrativeClaimPlanV2,
  critiquePlan: requestNarrativeGroundingCritiqueV2,
  generateProse: generateNarrativeProseV2,
  critiqueProse: requestNarrativeFinalCritiqueV2,
};

function sourceEvidence(testCase: NarrativeBenchmarkCaseV2) {
  return testCase.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    evidenceFacts: scene.evidenceFacts.map((fact) => ({ ...fact })),
  }));
}

function modelFingerprint(provider: string, model: string, stage: string, digest?: string): string {
  return editorialFingerprintV7({ provider, model, stage, ...(digest ? { digest } : {}) });
}

export function autonomousNarrativeFingerprintsV2(input: {
  testCase: NarrativeBenchmarkCaseV2;
  request: NarrativeScriptRequestV1;
  plan: NarrativeClaimPlanV1 | null;
  scripts: SceneNarrativeScriptV1[];
  groundingReport: NarrativeGroundingCriticReportV1 | null;
  finalReport: NarrativeCriticReportV2 | null;
  criticModelDigest: string;
  prompts?: AutonomousNarrativeFingerprintsV2['prompts'];
}): AutonomousNarrativeFingerprintsV2 {
  const prompts = input.prompts ?? {
    planGenerator: narrativePlanGeneratorPromptFingerprintV2(),
    groundingCritic: narrativeGroundingCriticPromptFingerprintV2(),
    proseGenerator: narrativeProseGeneratorPromptFingerprintV2(),
    finalCritic: narrativeFinalCriticPromptFingerprintV2(),
  };
  const content = narrativeContentFingerprintsV1(input.request, input.scripts);
  return {
    route: input.request.routeFingerprint,
    evidence: content.evidence,
    evidenceProvenance: narrativeEvidenceProvenanceFingerprintV2(input.testCase),
    plan: editorialFingerprintV7(input.plan),
    text: editorialFingerprintV7(input.scripts),
    prompts,
    models: {
      planGenerator: modelFingerprint('deepseek', NARRATIVE_GENERATOR_MODEL_V2, 'plan'),
      groundingCritic: modelFingerprint(
        'ollama', NARRATIVE_CRITIC_MODEL_V2, 'grounding', input.criticModelDigest
      ),
      proseGenerator: modelFingerprint('deepseek', NARRATIVE_GENERATOR_MODEL_V2, 'prose'),
      finalCritic: modelFingerprint(
        'ollama', NARRATIVE_CRITIC_MODEL_V2, 'final', input.criticModelDigest
      ),
    },
    parameters: {
      planGenerator: editorialFingerprintV7({ stage: 'plan', ...NARRATIVE_GENERATOR_PARAMETERS_V2 }),
      groundingCritic: editorialFingerprintV7({ stage: 'grounding', ...NARRATIVE_CRITIC_PARAMETERS_V2 }),
      proseGenerator: editorialFingerprintV7({ stage: 'prose', ...NARRATIVE_GENERATOR_PARAMETERS_V2 }),
      finalCritic: editorialFingerprintV7({ stage: 'final', ...NARRATIVE_CRITIC_PARAMETERS_V2 }),
    },
    policies: editorialFingerprintV7(AUTONOMOUS_NARRATIVE_POLICIES_V2),
    critiques: {
      grounding: editorialFingerprintV7(input.groundingReport),
      final: editorialFingerprintV7(input.finalReport),
    },
  };
}

function generationRecord<T>(result: EditorialCallResultV6<T>): AutonomousNarrativeGenerationRecordV2 {
  return {
    status: result.status,
    attempts: result.attempts,
    promptFingerprint: result.promptFingerprint,
    responseFingerprint: result.responseFingerprint,
  };
}

function lastError(result: EditorialCallResultV6<unknown>): string {
  return result.attempts.at(-1)?.error ?? 'unknown model failure';
}

function parsedCandidate(result: EditorialCallResultV6<unknown>): unknown {
  if (!result.rawOutput) return null;
  try {
    return JSON.parse(result.rawOutput);
  } catch {
    return result.rawOutput;
  }
}

function contentRepair(stage: 'plan' | 'prose', error: string): string[] {
  return [
    `Regenera las tres escenas completas y corrige el ${stage} para superar la validación: ${error}`,
  ];
}

async function criticWithProtocolRetry<T>(
  invoke: () => Promise<EditorialCallResultV6<T>>
): Promise<{ result: EditorialCallResultV6<T>; record: AutonomousNarrativeCallRecordV2<T> }> {
  const calls: EditorialCallResultV6<T>[] = [];
  let result = await invoke();
  calls.push(result);
  if (result.status === 'semantic_error' && !result.value) {
    result = await invoke();
    calls.push(result);
  }
  return {
    result,
    record: {
      status: result.status,
      attempts: calls.flatMap((call) => call.attempts),
      promptFingerprint: result.promptFingerprint,
      responseFingerprint: result.responseFingerprint,
      protocolCallCount: calls.length,
      report: result.value,
    },
  };
}

function statusCode(status: EditorialAttemptV6['status']): AutonomousNarrativeFailureV2['code'] {
  if (status === 'valid') return 'internal_error';
  return status;
}

function artifact(input: {
  testCase: NarrativeBenchmarkCaseV2;
  request: NarrativeScriptRequestV1;
  plan: NarrativeClaimPlanV1 | null;
  scripts: SceneNarrativeScriptV1[];
  planAttempts: AutonomousNarrativePlanAttemptV2[];
  proseAttempts: AutonomousNarrativeProseAttemptV2[];
  criticModel: NarrativeCriticModelInfoV2 | null;
  status: AutonomousNarrativeArtifactV2['status'];
  failure: AutonomousNarrativeFailureV2 | null;
}): AutonomousNarrativeArtifactV2 {
  const groundingReport = input.planAttempts.at(-1)?.grounding?.report ?? null;
  const finalReport = input.proseAttempts.at(-1)?.critique?.report ?? null;
  return {
    schemaVersion: AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V2,
    caseId: input.testCase.caseId,
    request: input.request,
    sourceEvidence: sourceEvidence(input.testCase),
    plan: input.plan,
    scripts: input.scripts,
    planAttempts: input.planAttempts,
    proseAttempts: input.proseAttempts,
    criticModel: input.criticModel,
    status: input.status,
    failure: input.failure,
    fingerprints: autonomousNarrativeFingerprintsV2({
      testCase: input.testCase,
      request: input.request,
      plan: input.plan,
      scripts: input.scripts,
      groundingReport,
      finalReport,
      criticModelDigest: input.criticModel?.digest ?? 'unresolved',
    }),
  };
}

export async function runAutonomousNarrativeV2(
  rawCase: NarrativeBenchmarkCaseV2,
  options: AutonomousNarrativeOptionsV2 = {}
): Promise<AutonomousNarrativeArtifactV2> {
  const testCase = validateNarrativeBenchmarkCaseV2(rawCase);
  const request = buildNarrativeScriptRequestFromCaseV2(testCase);
  const services = options.services ?? DEFAULT_SERVICES;
  const planAttempts: AutonomousNarrativePlanAttemptV2[] = [];
  const proseAttempts: AutonomousNarrativeProseAttemptV2[] = [];
  let criticModel: NarrativeCriticModelInfoV2;
  try {
    criticModel = await services.inspectCriticModel(options.critic);
  } catch (error) {
    return artifact({
      testCase, request, plan: null, scripts: [], planAttempts, proseAttempts,
      criticModel: null, status: 'rejected',
      failure: {
        stage: 'critic_preflight', code: 'model_unavailable', contentAttempt: null,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  let approvedPlan: NarrativeClaimPlanV1 | null = null;
  let planRepairInstructions: string[] = [];
  let previousPlan: unknown = null;
  for (let contentAttempt = 1; contentAttempt <= 2; contentAttempt += 1) {
    let generation: EditorialCallResultV6<NarrativeClaimPlanV1>;
    try {
      generation = await services.generatePlan(
        request,
        options.generator,
        planRepairInstructions.length > 0
          ? { instructions: planRepairInstructions, previousCandidate: previousPlan }
          : undefined
      );
    } catch (error) {
      return artifact({
        testCase, request, plan: approvedPlan, scripts: [], planAttempts, proseAttempts,
        criticModel, status: 'rejected', failure: {
          stage: 'plan_generation', code: 'internal_error', contentAttempt,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    const attempt: AutonomousNarrativePlanAttemptV2 = {
      contentAttempt,
      repairInstructions: [...planRepairInstructions],
      plan: generation.value,
      generation: generationRecord(generation),
      grounding: null,
    };
    if (!generation.value) {
      planAttempts.push(attempt);
      if (generation.status === 'semantic_error' && contentAttempt === 1) {
        previousPlan = parsedCandidate(generation);
        planRepairInstructions = contentRepair('plan', lastError(generation));
        continue;
      }
      return artifact({
        testCase, request, plan: approvedPlan, scripts: [], planAttempts, proseAttempts,
        criticModel, status: 'rejected', failure: {
          stage: generation.status === 'semantic_error' ? 'plan_validation' : 'plan_generation',
          code: statusCode(generation.status), contentAttempt, message: lastError(generation),
        },
      });
    }
    const candidatePlan = generation.value;
    let critique;
    try {
      critique = await criticWithProtocolRetry(() => services.critiquePlan(
        buildNarrativeGroundingCriticRequestV1(request, candidatePlan),
        criticModel,
        options.critic
      ));
    } catch (error) {
      planAttempts.push(attempt);
      return artifact({
        testCase, request, plan: candidatePlan, scripts: [], planAttempts, proseAttempts,
        criticModel, status: 'rejected', failure: {
          stage: 'grounding_critique', code: 'internal_error', contentAttempt,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    attempt.grounding = critique.record;
    planAttempts.push(attempt);
    if (!critique.result.value) {
      return artifact({
        testCase, request, plan: candidatePlan, scripts: [], planAttempts, proseAttempts,
        criticModel, status: 'rejected', failure: {
          stage: 'grounding_critique', code: statusCode(critique.result.status), contentAttempt,
          message: lastError(critique.result),
        },
      });
    }
    const gate = evaluateNarrativeGroundingGateV1(critique.result.value);
    if (gate.passed) {
      approvedPlan = candidatePlan;
      break;
    }
    if (contentAttempt === 1) {
      previousPlan = candidatePlan;
      planRepairInstructions = [...critique.result.value.repairInstructions];
      continue;
    }
    return artifact({
      testCase, request, plan: candidatePlan, scripts: [], planAttempts, proseAttempts,
      criticModel, status: 'rejected', failure: {
        stage: 'grounding_critique', code: 'critic_rejected', contentAttempt,
        message: `grounding critic rejected plan: ${gate.reasons.join(', ')}`,
      },
    });
  }

  if (!approvedPlan) throw new Error('autonomous narrative v2 exhausted plan attempts unexpectedly');
  let approvedScripts: SceneNarrativeScriptV1[] = [];
  let proseRepairInstructions: string[] = [];
  let previousProse: unknown = null;
  for (let contentAttempt = 1; contentAttempt <= 2; contentAttempt += 1) {
    let generation: EditorialCallResultV6<SceneNarrativeScriptV1[]>;
    try {
      generation = await services.generateProse(
        request,
        approvedPlan,
        options.generator,
        proseRepairInstructions.length > 0
          ? { instructions: proseRepairInstructions, previousCandidate: previousProse }
          : undefined
      );
    } catch (error) {
      return artifact({
        testCase, request, plan: approvedPlan, scripts: approvedScripts,
        planAttempts, proseAttempts, criticModel, status: 'rejected', failure: {
          stage: 'prose_generation', code: 'internal_error', contentAttempt,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    const attempt: AutonomousNarrativeProseAttemptV2 = {
      contentAttempt,
      repairInstructions: [...proseRepairInstructions],
      scripts: generation.value ?? [],
      generation: generationRecord(generation),
      critique: null,
    };
    if (!generation.value) {
      proseAttempts.push(attempt);
      if (generation.status === 'semantic_error' && contentAttempt === 1) {
        previousProse = parsedCandidate(generation);
        proseRepairInstructions = contentRepair('prose', lastError(generation));
        continue;
      }
      return artifact({
        testCase, request, plan: approvedPlan, scripts: approvedScripts,
        planAttempts, proseAttempts, criticModel, status: 'rejected', failure: {
          stage: generation.status === 'semantic_error' ? 'prose_validation' : 'prose_generation',
          code: statusCode(generation.status), contentAttempt, message: lastError(generation),
        },
      });
    }
    const candidateScripts = generation.value;
    let critique;
    try {
      critique = await criticWithProtocolRetry(() => services.critiqueProse(
        buildNarrativeCriticRequestV2(request, approvedPlan, candidateScripts),
        criticModel,
        options.critic
      ));
    } catch (error) {
      proseAttempts.push(attempt);
      return artifact({
        testCase, request, plan: approvedPlan, scripts: candidateScripts,
        planAttempts, proseAttempts, criticModel, status: 'rejected', failure: {
          stage: 'final_critique', code: 'internal_error', contentAttempt,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    attempt.critique = critique.record;
    proseAttempts.push(attempt);
    if (!critique.result.value) {
      return artifact({
        testCase, request, plan: approvedPlan, scripts: candidateScripts,
        planAttempts, proseAttempts, criticModel, status: 'rejected', failure: {
          stage: 'final_critique', code: statusCode(critique.result.status), contentAttempt,
          message: lastError(critique.result),
        },
      });
    }
    const gate = evaluateNarrativeCriticGateV2(critique.result.value);
    if (gate.passed) {
      approvedScripts = candidateScripts;
      return artifact({
        testCase, request, plan: approvedPlan, scripts: approvedScripts,
        planAttempts, proseAttempts, criticModel, status: 'machine_approved', failure: null,
      });
    }
    if (contentAttempt === 1) {
      previousProse = candidateScripts;
      proseRepairInstructions = [...critique.result.value.repairInstructions];
      continue;
    }
    return artifact({
      testCase, request, plan: approvedPlan, scripts: candidateScripts,
      planAttempts, proseAttempts, criticModel, status: 'rejected', failure: {
        stage: 'final_critique', code: 'critic_rejected', contentAttempt,
        message: `final critic rejected prose: ${gate.reasons.join(', ')}`,
      },
    });
  }
  throw new Error('autonomous narrative v2 exhausted prose attempts unexpectedly');
}

function changedFingerprintComponents(
  saved: AutonomousNarrativeFingerprintsV2,
  current: AutonomousNarrativeFingerprintsV2
): string[] {
  const result: string[] = [];
  for (const key of ['route', 'evidence', 'evidenceProvenance', 'plan', 'text', 'policies'] as const) {
    if (saved[key] !== current[key]) result.push(key);
  }
  for (const group of ['prompts', 'models', 'parameters', 'critiques'] as const) {
    for (const key of Object.keys(saved[group]) as Array<keyof typeof saved[typeof group]>) {
      if (saved[group][key] !== current[group][key]) result.push(`${group}.${String(key)}`);
    }
  }
  return result;
}

export function replayAutonomousNarrativeArtifactV2(
  value: AutonomousNarrativeArtifactV2,
  rawCase: NarrativeBenchmarkCaseV2
): AutonomousNarrativeArtifactV2 {
  const testCase = validateNarrativeBenchmarkCaseV2(rawCase);
  const request = buildNarrativeScriptRequestFromCaseV2(testCase);
  if (!value || typeof value !== 'object'
    || value.schemaVersion !== AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V2) {
    throw new Error('invalid autonomous narrative artifact v2');
  }
  if (value.caseId !== testCase.caseId
    || editorialFingerprintV7(value.request) !== editorialFingerprintV7(request)
    || editorialFingerprintV7(value.sourceEvidence) !== editorialFingerprintV7(sourceEvidence(testCase))) {
    throw new Error('autonomous narrative v2 case changed');
  }
  if (value.status !== 'machine_approved' && value.status !== 'rejected') {
    throw new Error('autonomous narrative v2 status is invalid');
  }
  if (value.plan) validateNarrativeClaimPlanV1(value.plan, request);
  if (value.scripts.length > 0) validateNarrativeScriptsV1(value.scripts, request);
  const groundingReport = value.planAttempts.at(-1)?.grounding?.report ?? null;
  const finalReport = value.proseAttempts.at(-1)?.critique?.report ?? null;
  if (groundingReport && value.plan) {
    validateNarrativeGroundingCriticReportV1(
      groundingReport,
      buildNarrativeGroundingCriticRequestV1(request, value.plan)
    );
  }
  if (finalReport && value.plan && value.scripts.length > 0) {
    validateNarrativeCriticReportV2(
      finalReport,
      buildNarrativeCriticRequestV2(request, value.plan, value.scripts)
    );
  }
  const current = autonomousNarrativeFingerprintsV2({
    testCase,
    request,
    plan: value.plan,
    scripts: value.scripts,
    groundingReport,
    finalReport,
    criticModelDigest: value.criticModel?.digest ?? 'unresolved',
    prompts: value.fingerprints.prompts,
  });
  const changed = changedFingerprintComponents(value.fingerprints, current);
  if (changed.length > 0) {
    throw new Error(`autonomous narrative v2 changed components: ${changed.join(', ')}`);
  }
  if (value.status === 'machine_approved') {
    if (!value.plan || value.scripts.length !== request.scenes.length || !groundingReport
      || !finalReport || !evaluateNarrativeGroundingGateV1(groundingReport).passed
      || !evaluateNarrativeCriticGateV2(finalReport).passed || value.failure !== null) {
      throw new Error('machine-approved autonomous narrative v2 does not pass all gates');
    }
  } else if (!value.failure) {
    throw new Error('rejected autonomous narrative v2 requires a structured failure');
  }
  return value;
}

export function serializeMachineApprovedNarrativeArtifactV2(
  artifactValue: AutonomousNarrativeArtifactV2,
  testCase: NarrativeBenchmarkCaseV2
): string {
  if (artifactValue.status !== 'machine_approved') {
    throw new Error('only machine-approved autonomous narrative v2 artifacts can be frozen');
  }
  replayAutonomousNarrativeArtifactV2(artifactValue, testCase);
  return `${JSON.stringify(artifactValue, null, 2)}\n`;
}
