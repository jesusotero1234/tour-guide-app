import {
  EditorialAttemptV6,
  EditorialCallResultV6,
} from './EditorialStructuredLlmV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeClaimPlanV3,
  NarrativeScriptRequestV3,
  buildNarrativeScriptRequestV3,
  narrativeClaimPlanFingerprintV3,
  narrativeProseFingerprintV3,
  validateNarrativeClaimPlanV3,
} from './NarrativeContractsV3';
import {
  NarrativeCriticReportV3,
  NarrativeGroundingCriticReportV3,
  buildNarrativeCriticRequestV3,
  buildNarrativeGroundingCriticRequestV3,
  evaluateNarrativeCriticGateV3,
  evaluateNarrativeGroundingGateV3,
  narrativeRepairInstructionsV3,
  validateNarrativeCriticReportV3,
  validateNarrativeGroundingCriticReportV3,
} from './NarrativeCriticV3';
import { NarrativeEvidenceCaseV3 } from './NarrativeEvidenceV3';
import {
  NARRATIVE_CRITIC_MODEL_V3,
  NARRATIVE_CRITIC_PARAMETERS_V3,
  NarrativeCriticModelInfoV3,
  NarrativeCriticOptionsV3,
  inspectNarrativeCriticModelV3,
  narrativeFinalCriticPromptFingerprintV3,
  narrativeGroundingCriticPromptFingerprintV3,
  requestNarrativeFinalCritiqueV3,
  requestNarrativeGroundingCritiqueV3,
} from './NarrativePilotGemmaV3';
import {
  NARRATIVE_WRITER_MODEL_V3,
  NARRATIVE_WRITER_PARAMETERS_V3,
  NarrativeStageRepairV3,
  NarrativeWriterOptionsV3,
  generateNarrativeClaimPlanV3,
  generateNarrativeProseV3,
  narrativePlanGeneratorPromptFingerprintV3,
  narrativeProseGeneratorPromptFingerprintV3,
} from './NarrativePilotWriterV3';
import { SceneNarrativeScriptV1 } from './NarrativePilotV1';

export const AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V3 =
  'autonomous-narrative-artifact-v3' as const;

export const AUTONOMOUS_NARRATIVE_POLICIES_V3 = {
  planContentRepairs: 1,
  proseContentRepairs: 1,
  criticProtocolRetries: 1,
  selectedClaimsPerScene: { minimum: 3, maximum: 6 },
  sceneUnicodeWords: { minimum: 220, maximum: 260 },
  finalGate: {
    maximumFactualFindings: 0,
    minimumDimensionScore: 4,
    minimumSceneScore: 3,
  },
  outcomes: ['machine_approved', 'rejected'],
} as const;

export interface AutonomousNarrativeFailureV3 {
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

export type AutonomousNarrativeOutcomeV3 =
  | { type: 'machine_approved' }
  | { type: 'rejected'; failure: AutonomousNarrativeFailureV3 };

export interface AutonomousNarrativeGenerationRecordV3 {
  status: EditorialAttemptV6['status'];
  attempts: EditorialAttemptV6[];
  model: string;
  promptFingerprint: string;
  responseFingerprint: string | null;
}

export interface AutonomousNarrativeCriticRecordV3<T> extends AutonomousNarrativeGenerationRecordV3 {
  protocolCallCount: number;
  report: T | null;
}

export interface AutonomousNarrativePlanAttemptV3 {
  contentAttempt: number;
  repairSceneIds: string[];
  repairInstructions: string[];
  plan: NarrativeClaimPlanV3 | null;
  generation: AutonomousNarrativeGenerationRecordV3;
  grounding: AutonomousNarrativeCriticRecordV3<NarrativeGroundingCriticReportV3> | null;
}

export interface AutonomousNarrativeProseAttemptV3 {
  contentAttempt: number;
  repairSceneIds: string[];
  repairInstructions: string[];
  scripts: SceneNarrativeScriptV1[];
  generation: AutonomousNarrativeGenerationRecordV3;
  critique: AutonomousNarrativeCriticRecordV3<NarrativeCriticReportV3> | null;
}

export interface AutonomousNarrativeFingerprintsV3 {
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
    writer: string;
    critic: string;
  };
  policies: string;
  critiques: { grounding: string; final: string };
}

export interface AutonomousNarrativeArtifactV3 {
  schemaVersion: typeof AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V3;
  caseId: string;
  request: NarrativeScriptRequestV3;
  evidenceCaseFingerprint: string;
  plan: NarrativeClaimPlanV3 | null;
  scripts: SceneNarrativeScriptV1[];
  planAttempts: AutonomousNarrativePlanAttemptV3[];
  proseAttempts: AutonomousNarrativeProseAttemptV3[];
  writerModel: { provider: string; model: string };
  criticModel: NarrativeCriticModelInfoV3 | null;
  outcome: AutonomousNarrativeOutcomeV3;
  fingerprints: AutonomousNarrativeFingerprintsV3;
}

export interface AutonomousNarrativeServicesV3 {
  inspectCriticModel: (
    options?: NarrativeCriticOptionsV3
  ) => Promise<NarrativeCriticModelInfoV3>;
  generatePlan: (
    request: NarrativeScriptRequestV3,
    options?: NarrativeWriterOptionsV3,
    repair?: NarrativeStageRepairV3
  ) => Promise<EditorialCallResultV6<NarrativeClaimPlanV3>>;
  critiquePlan: (
    request: ReturnType<typeof buildNarrativeGroundingCriticRequestV3>,
    model: NarrativeCriticModelInfoV3,
    options?: NarrativeCriticOptionsV3
  ) => Promise<EditorialCallResultV6<NarrativeGroundingCriticReportV3>>;
  generateProse: (
    request: NarrativeScriptRequestV3,
    plan: NarrativeClaimPlanV3,
    options?: NarrativeWriterOptionsV3,
    repair?: NarrativeStageRepairV3
  ) => Promise<EditorialCallResultV6<SceneNarrativeScriptV1[]>>;
  critiqueProse: (
    request: ReturnType<typeof buildNarrativeCriticRequestV3>,
    model: NarrativeCriticModelInfoV3,
    options?: NarrativeCriticOptionsV3
  ) => Promise<EditorialCallResultV6<NarrativeCriticReportV3>>;
}

export interface AutonomousNarrativeOptionsV3 {
  writer?: NarrativeWriterOptionsV3;
  critic?: NarrativeCriticOptionsV3;
  services?: AutonomousNarrativeServicesV3;
}

const DEFAULT_SERVICES: AutonomousNarrativeServicesV3 = {
  inspectCriticModel: inspectNarrativeCriticModelV3,
  generatePlan: generateNarrativeClaimPlanV3,
  critiquePlan: requestNarrativeGroundingCritiqueV3,
  generateProse: generateNarrativeProseV3,
  critiqueProse: requestNarrativeFinalCritiqueV3,
};

function record<T>(result: EditorialCallResultV6<T>): AutonomousNarrativeGenerationRecordV3 {
  return {
    status: result.status,
    attempts: result.attempts,
    model: result.model,
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

function failureCode(status: EditorialAttemptV6['status']): AutonomousNarrativeFailureV3['code'] {
  return status === 'valid' ? 'internal_error' : status;
}

async function criticWithProtocolRetry<T>(
  invoke: () => Promise<EditorialCallResultV6<T>>
): Promise<{
  result: EditorialCallResultV6<T>;
  record: AutonomousNarrativeCriticRecordV3<T>;
}> {
  const calls: EditorialCallResultV6<T>[] = [];
  let result = await invoke();
  calls.push(result);
  if (!result.value) {
    result = await invoke();
    calls.push(result);
  }
  return {
    result,
    record: {
      ...record(result),
      attempts: calls.flatMap((call) => call.attempts),
      protocolCallCount: calls.length,
      report: result.value,
    },
  };
}

function groundingSceneIds(report: NarrativeGroundingCriticReportV3): string[] {
  return [...new Set([
    ...report.unsupportedClaims.map((finding) => finding.sceneId),
    ...report.improperCausality.map((finding) => finding.sceneId),
    ...report.misleadingOmissions.map((finding) => finding.sceneId),
  ])];
}

function finalSceneIds(
  report: NarrativeCriticReportV3,
  request: NarrativeScriptRequestV3
): string[] {
  const result = new Set([
    ...report.newClaims.map((finding) => finding.sceneId),
    ...report.distortedClaims.map((finding) => finding.sceneId),
    ...report.omittedClaims.map((finding) => finding.sceneId),
    ...report.misleadingOmissions.map((finding) => finding.sceneId),
    ...report.scores.scenes.filter((scene) => scene.score < 3).map((scene) => scene.sceneId),
  ]);
  if (Object.values(report.scores.dimensions).some((value) => value < 4)) {
    request.routeSceneIds.forEach((sceneId) => result.add(sceneId));
  }
  return [...result];
}

function provenanceFingerprint(testCase: NarrativeEvidenceCaseV3): string {
  return editorialFingerprintV7(testCase.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    facts: scene.evidenceFacts.map((fact) => ({
      factId: fact.factId,
      fingerprint: fact.fingerprint,
      sources: fact.sources.map((source) => source.fingerprint),
    })),
  })));
}

function modelFingerprint(provider: string, model: string, stage: string, digest?: string): string {
  return editorialFingerprintV7({ provider, model, stage, ...(digest ? { digest } : {}) });
}

export function autonomousNarrativeFingerprintsV3(input: {
  testCase: NarrativeEvidenceCaseV3;
  request: NarrativeScriptRequestV3;
  plan: NarrativeClaimPlanV3 | null;
  scripts: SceneNarrativeScriptV1[];
  groundingReport: NarrativeGroundingCriticReportV3 | null;
  finalReport: NarrativeCriticReportV3 | null;
  criticModelDigest: string;
  writerProvider?: { kind: string; model: string };
  prompts?: AutonomousNarrativeFingerprintsV3['prompts'];
}): AutonomousNarrativeFingerprintsV3 {
  const writer = input.writerProvider ?? { kind: 'deepseek', model: NARRATIVE_WRITER_MODEL_V3 };
  return {
    route: input.request.routeFingerprint,
    evidence: input.request.sourceSnapshotFingerprint,
    evidenceProvenance: provenanceFingerprint(input.testCase),
    plan: input.plan
      ? narrativeClaimPlanFingerprintV3(input.plan)
      : editorialFingerprintV7(null),
    text: narrativeProseFingerprintV3(input.scripts),
    prompts: input.prompts ?? {
      planGenerator: narrativePlanGeneratorPromptFingerprintV3(),
      groundingCritic: narrativeGroundingCriticPromptFingerprintV3(),
      proseGenerator: narrativeProseGeneratorPromptFingerprintV3(),
      finalCritic: narrativeFinalCriticPromptFingerprintV3(),
    },
    models: {
      planGenerator: modelFingerprint(writer.kind, writer.model, 'plan'),
      groundingCritic: modelFingerprint(
        'ollama', NARRATIVE_CRITIC_MODEL_V3, 'grounding', input.criticModelDigest
      ),
      proseGenerator: modelFingerprint(writer.kind, writer.model, 'prose'),
      finalCritic: modelFingerprint(
        'ollama', NARRATIVE_CRITIC_MODEL_V3, 'final', input.criticModelDigest
      ),
    },
    parameters: {
      writer: editorialFingerprintV7(NARRATIVE_WRITER_PARAMETERS_V3),
      critic: editorialFingerprintV7(NARRATIVE_CRITIC_PARAMETERS_V3),
    },
    policies: editorialFingerprintV7(AUTONOMOUS_NARRATIVE_POLICIES_V3),
    critiques: {
      grounding: editorialFingerprintV7(input.groundingReport),
      final: editorialFingerprintV7(input.finalReport),
    },
  };
}

function artifact(input: {
  testCase: NarrativeEvidenceCaseV3;
  request: NarrativeScriptRequestV3;
  plan: NarrativeClaimPlanV3 | null;
  scripts: SceneNarrativeScriptV1[];
  planAttempts: AutonomousNarrativePlanAttemptV3[];
  proseAttempts: AutonomousNarrativeProseAttemptV3[];
  criticModel: NarrativeCriticModelInfoV3 | null;
  outcome: AutonomousNarrativeOutcomeV3;
  writerProvider?: { kind: string; model: string };
}): AutonomousNarrativeArtifactV3 {
  const groundingReport = input.planAttempts.at(-1)?.grounding?.report ?? null;
  const finalReport = input.proseAttempts.at(-1)?.critique?.report ?? null;
  return {
    schemaVersion: AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V3,
    caseId: input.testCase.caseId,
    request: input.request,
    evidenceCaseFingerprint: editorialFingerprintV7(input.testCase),
    plan: input.plan,
    scripts: input.scripts,
    planAttempts: input.planAttempts,
    proseAttempts: input.proseAttempts,
    writerModel: input.writerProvider
      ? { provider: input.writerProvider.kind, model: input.writerProvider.model }
      : { provider: 'deepseek', model: NARRATIVE_WRITER_MODEL_V3 },
    criticModel: input.criticModel,
    outcome: input.outcome,
    fingerprints: autonomousNarrativeFingerprintsV3({
      testCase: input.testCase,
      request: input.request,
      plan: input.plan,
      scripts: input.scripts,
      groundingReport,
      finalReport,
      criticModelDigest: input.criticModel?.digest ?? 'unresolved',
      writerProvider: input.writerProvider,
    }),
  };
}

function rejected(
  input: Omit<Parameters<typeof artifact>[0], 'outcome'>,
  failure: AutonomousNarrativeFailureV3
): AutonomousNarrativeArtifactV3 {
  return artifact({ ...input, outcome: { type: 'rejected', failure } });
}

export async function runAutonomousNarrativeV3(
  testCase: NarrativeEvidenceCaseV3,
  options: AutonomousNarrativeOptionsV3 = {}
): Promise<AutonomousNarrativeArtifactV3> {
  const request = buildNarrativeScriptRequestV3(testCase);
  const services = options.services ?? DEFAULT_SERVICES;
  const planAttempts: AutonomousNarrativePlanAttemptV3[] = [];
  const proseAttempts: AutonomousNarrativeProseAttemptV3[] = [];
  const writerProvider = options.writer?.provider;
  let criticModel: NarrativeCriticModelInfoV3;
  try {
    criticModel = await services.inspectCriticModel(options.critic);
  } catch (error) {
    return rejected({
      testCase, request, plan: null, scripts: [], planAttempts, proseAttempts,
      criticModel: null, writerProvider,
    }, {
      stage: 'critic_preflight', code: 'model_unavailable', contentAttempt: null,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let plan: NarrativeClaimPlanV3 | null = null;
  let planRepair: NarrativeStageRepairV3 | undefined;
  for (let contentAttempt = 1; contentAttempt <= 2; contentAttempt += 1) {
    let generation: EditorialCallResultV6<NarrativeClaimPlanV3>;
    try {
      generation = await services.generatePlan(request, options.writer, planRepair);
    } catch (error) {
      return rejected({
        testCase, request, plan, scripts: [], planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: 'plan_generation', code: 'internal_error', contentAttempt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const attempt: AutonomousNarrativePlanAttemptV3 = {
      contentAttempt,
      repairSceneIds: planRepair?.sceneIds ?? [],
      repairInstructions: planRepair?.instructions ?? [],
      plan: generation.value,
      generation: record(generation),
      grounding: null,
    };
    if (!generation.value) {
      planAttempts.push(attempt);
      if (generation.status === 'semantic_error' && contentAttempt === 1) {
        planRepair = {
          instructions: [`Corrige el plan completo: ${lastError(generation)}`],
          previousCandidate: parsedCandidate(generation),
          sceneIds: [...request.routeSceneIds],
        };
        continue;
      }
      return rejected({
        testCase, request, plan, scripts: [], planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: generation.status === 'semantic_error' ? 'plan_validation' : 'plan_generation',
        code: failureCode(generation.status), contentAttempt, message: lastError(generation),
      });
    }
    const candidate = generation.value;
    let critique;
    try {
      critique = await criticWithProtocolRetry(() => services.critiquePlan(
        buildNarrativeGroundingCriticRequestV3(request, candidate),
        criticModel,
        options.critic
      ));
    } catch (error) {
      planAttempts.push(attempt);
      return rejected({
        testCase, request, plan: candidate, scripts: [], planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: 'grounding_critique', code: 'internal_error', contentAttempt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    attempt.grounding = critique.record;
    planAttempts.push(attempt);
    if (!critique.result.value) {
      return rejected({
        testCase, request, plan: candidate, scripts: [], planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: 'grounding_critique', code: failureCode(critique.result.status),
        contentAttempt, message: lastError(critique.result),
      });
    }
    const gate = evaluateNarrativeGroundingGateV3(critique.result.value);
    if (gate.passed) {
      plan = candidate;
      break;
    }
    if (contentAttempt === 1) {
      planRepair = {
        instructions: narrativeRepairInstructionsV3(critique.result.value),
        previousCandidate: candidate,
        sceneIds: groundingSceneIds(critique.result.value),
      };
      continue;
    }
    return rejected({
      testCase, request, plan: candidate, scripts: [], planAttempts, proseAttempts,
      criticModel, writerProvider,
    }, {
      stage: 'grounding_critique', code: 'critic_rejected', contentAttempt,
      message: `grounding critic rejected plan: ${gate.reasons.join(', ')}`,
    });
  }
  if (!plan) throw new Error('autonomous narrative v3 exhausted plan attempts unexpectedly');

  let scripts: SceneNarrativeScriptV1[] = [];
  let proseRepair: NarrativeStageRepairV3 | undefined;
  for (let contentAttempt = 1; contentAttempt <= 2; contentAttempt += 1) {
    let generation: EditorialCallResultV6<SceneNarrativeScriptV1[]>;
    try {
      generation = await services.generateProse(request, plan, options.writer, proseRepair);
    } catch (error) {
      return rejected({
        testCase, request, plan, scripts, planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: 'prose_generation', code: 'internal_error', contentAttempt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const attempt: AutonomousNarrativeProseAttemptV3 = {
      contentAttempt,
      repairSceneIds: proseRepair?.sceneIds ?? [],
      repairInstructions: proseRepair?.instructions ?? [],
      scripts: generation.value ?? [],
      generation: record(generation),
      critique: null,
    };
    if (!generation.value) {
      proseAttempts.push(attempt);
      if (generation.status === 'semantic_error' && contentAttempt === 1) {
        proseRepair = {
          instructions: [`Corrige la prosa completa: ${lastError(generation)}`],
          previousCandidate: parsedCandidate(generation),
          sceneIds: [...request.routeSceneIds],
        };
        continue;
      }
      return rejected({
        testCase, request, plan, scripts, planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: generation.status === 'semantic_error' ? 'prose_validation' : 'prose_generation',
        code: failureCode(generation.status), contentAttempt, message: lastError(generation),
      });
    }
    const candidate = generation.value;
    let critique;
    try {
      critique = await criticWithProtocolRetry(() => services.critiqueProse(
        buildNarrativeCriticRequestV3(request, plan as NarrativeClaimPlanV3, candidate),
        criticModel,
        options.critic
      ));
    } catch (error) {
      proseAttempts.push(attempt);
      return rejected({
        testCase, request, plan, scripts: candidate, planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: 'final_critique', code: 'internal_error', contentAttempt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    attempt.critique = critique.record;
    proseAttempts.push(attempt);
    if (!critique.result.value) {
      return rejected({
        testCase, request, plan, scripts: candidate, planAttempts, proseAttempts,
        criticModel, writerProvider,
      }, {
        stage: 'final_critique', code: failureCode(critique.result.status),
        contentAttempt, message: lastError(critique.result),
      });
    }
    const gate = evaluateNarrativeCriticGateV3(critique.result.value);
    if (gate.passed) {
      scripts = candidate;
      return artifact({
        testCase, request, plan, scripts, planAttempts, proseAttempts,
        criticModel, outcome: { type: 'machine_approved' }, writerProvider,
      });
    }
    if (contentAttempt === 1) {
      proseRepair = {
        instructions: narrativeRepairInstructionsV3(critique.result.value),
        previousCandidate: candidate,
        sceneIds: finalSceneIds(critique.result.value, request),
      };
      continue;
    }
    return rejected({
      testCase, request, plan, scripts: candidate, planAttempts, proseAttempts,
      criticModel, writerProvider,
    }, {
      stage: 'final_critique', code: 'critic_rejected', contentAttempt,
      message: `final critic rejected prose: ${gate.reasons.join(', ')}`,
    });
  }
  throw new Error('autonomous narrative v3 exhausted prose attempts unexpectedly');
}

function changedFingerprintComponents(
  saved: AutonomousNarrativeFingerprintsV3,
  current: AutonomousNarrativeFingerprintsV3
): string[] {
  const changed: string[] = [];
  for (const key of [
    'route', 'evidence', 'evidenceProvenance', 'plan', 'text', 'policies',
  ] as const) {
    if (saved[key] !== current[key]) changed.push(key);
  }
  for (const group of ['prompts', 'models', 'parameters', 'critiques'] as const) {
    for (const key of Object.keys(saved[group]) as Array<keyof typeof saved[typeof group]>) {
      if (saved[group][key] !== current[group][key]) changed.push(`${group}.${String(key)}`);
    }
  }
  return changed;
}

export function replayAutonomousNarrativeArtifactV3(
  value: AutonomousNarrativeArtifactV3,
  testCase: NarrativeEvidenceCaseV3
): AutonomousNarrativeArtifactV3 {
  const request = buildNarrativeScriptRequestV3(testCase);
  if (value.schemaVersion !== AUTONOMOUS_NARRATIVE_ARTIFACT_SCHEMA_VERSION_V3
    || value.caseId !== testCase.caseId
    || value.evidenceCaseFingerprint !== editorialFingerprintV7(testCase)
    || editorialFingerprintV7(value.request) !== editorialFingerprintV7(request)) {
    throw new Error('autonomous narrative v3 case changed');
  }
  if (value.plan) validateNarrativeClaimPlanV3(value.plan, request);
  const groundingReport = value.planAttempts.at(-1)?.grounding?.report ?? null;
  const finalReport = value.proseAttempts.at(-1)?.critique?.report ?? null;
  if (groundingReport && value.plan) {
    validateNarrativeGroundingCriticReportV3(
      groundingReport,
      buildNarrativeGroundingCriticRequestV3(request, value.plan)
    );
  }
  if (finalReport && value.plan && value.scripts.length) {
    validateNarrativeCriticReportV3(
      finalReport,
      buildNarrativeCriticRequestV3(request, value.plan, value.scripts)
    );
  }
  const current = autonomousNarrativeFingerprintsV3({
    testCase,
    request,
    plan: value.plan,
    scripts: value.scripts,
    groundingReport,
    finalReport,
    criticModelDigest: value.criticModel?.digest ?? 'unresolved',
    writerProvider: { kind: value.writerModel.provider, model: value.writerModel.model },
    prompts: value.fingerprints.prompts,
  });
  const changed = changedFingerprintComponents(value.fingerprints, current);
  if (changed.length) {
    throw new Error(`autonomous narrative v3 changed components: ${changed.join(', ')}`);
  }
  if (value.outcome.type === 'machine_approved') {
    if (!value.plan || value.scripts.length !== request.scenes.length
      || !groundingReport || !finalReport
      || !evaluateNarrativeGroundingGateV3(groundingReport).passed
      || !evaluateNarrativeCriticGateV3(finalReport).passed) {
      throw new Error('machine-approved autonomous narrative v3 does not pass all gates');
    }
  } else if (!value.outcome.failure) {
    throw new Error('rejected autonomous narrative v3 requires a structured failure');
  }
  return value;
}

export function serializeMachineApprovedNarrativeArtifactV3(
  value: AutonomousNarrativeArtifactV3,
  testCase: NarrativeEvidenceCaseV3
): string {
  if (value.outcome.type !== 'machine_approved') {
    throw new Error('only machine-approved autonomous narrative v3 artifacts can be frozen');
  }
  replayAutonomousNarrativeArtifactV3(value, testCase);
  return `${JSON.stringify(value, null, 2)}\n`;
}
