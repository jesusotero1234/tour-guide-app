import {
  AutonomousNarrativeArtifactV4,
} from './AutonomousNarrativeV4';
import { EditorialAttemptV6, EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import {
  NarrativeClaimPlanV4,
  buildNarrativeClaimPlanV4,
  narrativeClaimPlanFingerprintV4,
} from './NarrativeClaimPlanV4';
import {
  NarrativeCriticGateReasonV4,
  NarrativeCriticReportV4,
  buildNarrativeCriticRequestV4,
  evaluateNarrativeCriticGateV4,
  evaluateNarrativeGroundingGateV4,
  validateNarrativeCriticReportV4,
} from './NarrativeCriticV4';
import {
  NarrativeEvidenceCaseV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NARRATIVE_CRITIC_DIGEST_V4,
  NARRATIVE_CRITIC_MODEL_V4,
  NARRATIVE_CRITIC_PARAMETERS_V4,
  NARRATIVE_CRITIC_QUANTIZATION_V4,
  NarrativeCriticModelInfoV4,
  narrativeFinalCriticPromptFingerprintV4,
  narrativeGroundingCriticPromptFingerprintV4,
} from './NarrativePilotGemmaV4';
import {
  NARRATIVE_VARIANTS_V4,
  NARRATIVE_WRITER_MODEL_V4,
  NARRATIVE_WRITER_PARAMETERS_V4,
  NarrativeVariantV4,
  narrativeProseGeneratorPromptFingerprintV4,
} from './NarrativePilotWriterV4';
import {
  NarrativePilotPreviewV4,
  buildNarrativePilotPreviewV4,
} from './NarrativeMadridPilotPreviewV4';
import { NarrativeTourTextV4, narrativeTourTextFingerprintV4 } from './NarrativeProseV4';

export const NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V4 =
  'narrative-madrid-pilot-qualification-v4' as const;

export const NARRATIVE_MUTATION_KINDS_V4 = [
  'invented_causality',
  'cross_scene_attribution',
  'false_character',
  'misleading_omission',
] as const;

export type NarrativeMutationKindV4 = typeof NARRATIVE_MUTATION_KINDS_V4[number];

export const NARRATIVE_MADRID_QUALIFICATION_POLICIES_V4 = {
  variants: ['on_site', 'curiosity', 'documentary'] as NarrativeVariantV4[],
  minimumApprovedCandidates: 1,
  proseRepairsPerVariant: 1,
  mutationKinds: NARRATIVE_MUTATION_KINDS_V4,
  maximumCriticLatencyMsExclusive: 180_000,
  tieBreak: ['minimum_scene_score', 'total_quality_score', 'variant_order'],
  publicTourStatus: 'review',
  pilotState: 'prepared',
  machineApprovalIsDemandEvidence: false,
} as const;

const FACTUAL_REASONS = new Set<NarrativeCriticGateReasonV4>([
  'new_claim', 'distorted_claim', 'omitted_claim', 'misleading_omission', 'critical_finding',
]);

export interface NarrativeQualificationCritiqueV4 {
  status: EditorialCallResultV6<NarrativeCriticReportV4>['status'];
  report: NarrativeCriticReportV4 | null;
  attempts: EditorialAttemptV6[];
  rejectionReasons: NarrativeCriticGateReasonV4[];
  factualRejection: boolean;
  diagnostic: string | null;
}

export interface NarrativeMadridMutationProbeV4 extends NarrativeQualificationCritiqueV4 {
  mutation: NarrativeMutationKindV4;
  mutatedTextFingerprint: string;
}

export interface NarrativeMadridQualificationFingerprintsV4 {
  routeV7: string;
  evidenceAndProvenance: string;
  deterministicPlan: string;
  selectedText: string;
  prosePromptAndSchema: string;
  groundingCriticPromptAndSchema: string;
  finalCriticPromptAndSchema: string;
  modelsAndParameters: string;
  selectedVariant: string;
  policies: string;
  reports: string;
  mutations: string;
  preview: string;
  qualification: string;
}

export interface NarrativeMadridPilotQualificationV4 {
  schemaVersion: typeof NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V4;
  status: 'passed' | 'failed';
  caseId: string;
  criticModel: NarrativeCriticModelInfoV4;
  candidates: AutonomousNarrativeArtifactV4[];
  selectedVariant: NarrativeVariantV4 | null;
  selectedArtifact: AutonomousNarrativeArtifactV4 | null;
  cleanCritique: NarrativeQualificationCritiqueV4 | null;
  mutations: NarrativeMadridMutationProbeV4[];
  preview: NarrativePilotPreviewV4 | null;
  summary: {
    approvedCandidates: number;
    totalCandidates: number;
    cleanCritiquePassed: boolean;
    factualMutationsDetected: number;
    totalMutations: number;
    expectedCritiques: number;
    executedCritiques: number;
    allCritiquesBelow180Seconds: boolean;
    criticFullyGpu: boolean;
  };
  failureReasons: string[];
  fingerprints: NarrativeMadridQualificationFingerprintsV4;
}

export interface NarrativeMadridQualificationServicesV4 {
  criticModel: NarrativeCriticModelInfoV4;
  runCandidate(variant: NarrativeVariantV4): Promise<AutonomousNarrativeArtifactV4>;
  critique(
    text: NarrativeTourTextV4,
    plan: NarrativeClaimPlanV4
  ): Promise<EditorialCallResultV6<NarrativeCriticReportV4>>;
}

function copyText(text: NarrativeTourTextV4): NarrativeTourTextV4 {
  return {
    ...text,
    scripts: text.scripts.map((script) => ({
      ...script,
      blocks: script.blocks.map((block) => ({
        ...block, evidenceFactIds: [...block.evidenceFactIds],
      })),
      transition: { ...script.transition },
    })),
  };
}

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
}

function replaceKeepingWordCount(original: string, injected: string): string {
  const originalWords = words(original);
  const replacement = [...words(injected), ...originalWords].slice(0, originalWords.length);
  while (replacement.length < originalWords.length) replacement.push('lugar');
  return replacement.join(' ');
}

export function applyNarrativeMutationV4(
  text: NarrativeTourTextV4,
  evidence: NarrativeEvidenceCaseV4,
  kind: NarrativeMutationKindV4
): NarrativeTourTextV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  const mutated = copyText(text);
  const target = mutated.scripts[0].blocks[0];
  let injection: string;
  if (kind === 'invented_causality') {
    injection = 'El incendio causó por sí solo toda la transformación política posterior de Madrid.';
  } else if (kind === 'cross_scene_attribution') {
    injection = `Este hecho de ${evidence.scenes[1].name} ocurrió también aquí: ${evidence.scenes[1].evidenceFacts[0].atomicTextEs}`;
  } else if (kind === 'false_character') {
    injection = 'El cronista ficticio Aurelio Valdés dirigió personalmente estos acontecimientos decisivos.';
  } else if (kind === 'misleading_omission') {
    injection = 'Observa el lugar con calma y compara sus formas, luces, sombras, materiales y proporciones.';
  } else {
    const exhaustive: never = kind;
    throw new Error(`unsupported narrative mutation v4: ${exhaustive}`);
  }
  target.text = replaceKeepingWordCount(target.text, injection);
  return mutated;
}

function candidateReport(artifact: AutonomousNarrativeArtifactV4): NarrativeCriticReportV4 | null {
  return artifact.finalCritiques.at(-1)?.value ?? null;
}

function candidateIsEligible(artifact: AutonomousNarrativeArtifactV4): boolean {
  const grounding = artifact.grounding;
  const finalCritique = artifact.finalCritiques.at(-1);
  const report = finalCritique?.value ?? null;
  return artifact.status === 'machine_approved'
    && artifact.text !== null
    && artifact.proseAttempts.length > 0
    && artifact.proseAttempts.at(-1)?.status === 'valid'
    && grounding.status === 'valid'
    && grounding.attempts.length > 0
    && grounding.value !== null
    && evaluateNarrativeGroundingGateV4(grounding.value).passed
    && finalCritique?.status === 'valid'
    && finalCritique.attempts.length > 0
    && report !== null
    && Object.keys(report.scores.dimensions).length === 5
    && report.scores.scenes.length === 7
    && evaluateNarrativeCriticGateV4(report).passed;
}

function candidateScore(artifact: AutonomousNarrativeArtifactV4): {
  minimumScene: number;
  total: number;
} {
  const report = candidateReport(artifact);
  if (!report) return { minimumScene: -1, total: -1 };
  return {
    minimumScene: Math.min(...report.scores.scenes.map((scene) => scene.score)),
    total: [
      ...Object.values(report.scores.dimensions),
      ...report.scores.scenes.map((scene) => scene.score),
    ].reduce((sum, value) => sum + value, 0),
  };
}

export function selectNarrativeCandidateV4(
  candidates: AutonomousNarrativeArtifactV4[]
): AutonomousNarrativeArtifactV4 | null {
  const order = NARRATIVE_MADRID_QUALIFICATION_POLICIES_V4.variants;
  return candidates.filter(candidateIsEligible)
    .sort((left, right) => {
      const leftScore = candidateScore(left);
      const rightScore = candidateScore(right);
      return rightScore.minimumScene - leftScore.minimumScene
        || rightScore.total - leftScore.total
        || order.indexOf(left.variant) - order.indexOf(right.variant);
    })[0] ?? null;
}

function resultCritique(
  result: EditorialCallResultV6<NarrativeCriticReportV4>,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4,
  text: NarrativeTourTextV4
): NarrativeQualificationCritiqueV4 {
  try {
    const report = result.value
      ? validateNarrativeCriticReportV4(
        result.value,
        buildNarrativeCriticRequestV4(evidence, plan, text)
      )
      : null;
    const gate = report ? evaluateNarrativeCriticGateV4(report) : null;
    return {
      status: result.status,
      report,
      attempts: result.attempts,
      rejectionReasons: gate?.reasons ?? [],
      factualRejection: result.status === 'valid' && gate !== null && !gate.passed
        && gate.reasons.some((reason) => FACTUAL_REASONS.has(reason)),
      diagnostic: report ? null : result.attempts.at(-1)?.error ?? 'critic protocol failed',
    };
  } catch (error) {
    return {
      status: 'semantic_error',
      report: null,
      attempts: result.attempts,
      rejectionReasons: [],
      factualRejection: false,
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

function failedCritique(error: unknown): NarrativeQualificationCritiqueV4 {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'transport_error', report: null,
    attempts: [{
      attempt: 1, status: 'transport_error', latencyMs: 0,
      rawOutput: null, error: message,
    }],
    rejectionReasons: [], factualRejection: false, diagnostic: message,
  };
}

async function runCritique(
  services: NarrativeMadridQualificationServicesV4,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4,
  text: NarrativeTourTextV4
): Promise<NarrativeQualificationCritiqueV4> {
  try {
    return resultCritique(await services.critique(text, plan), evidence, plan, text);
  } catch (error) {
    return failedCritique(error);
  }
}

function critiqueDuration(critique: NarrativeQualificationCritiqueV4): number | null {
  return critique.attempts.length > 0
    ? critique.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0)
    : null;
}

function artifactCritiques(artifact: AutonomousNarrativeArtifactV4): EditorialAttemptV6[][] {
  return [
    artifact.grounding.attempts,
    ...artifact.finalCritiques.map((critique) => critique.attempts),
  ];
}

function evidenceProvenanceFingerprint(evidence: NarrativeEvidenceCaseV4): string {
  return editorialFingerprintV7(evidence.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    facts: scene.evidenceFacts.map((fact) => ({
      factId: fact.factId,
      fingerprint: fact.fingerprint,
      source: fact.source,
    })),
  })));
}

function buildFingerprints(input: {
  evidence: NarrativeEvidenceCaseV4;
  plan: NarrativeClaimPlanV4;
  candidates: AutonomousNarrativeArtifactV4[];
  selected: AutonomousNarrativeArtifactV4 | null;
  clean: NarrativeQualificationCritiqueV4 | null;
  mutations: NarrativeMadridMutationProbeV4[];
  preview: NarrativePilotPreviewV4 | null;
  criticModel: NarrativeCriticModelInfoV4;
  status: 'passed' | 'failed';
  summary: NarrativeMadridPilotQualificationV4['summary'];
  failureReasons: string[];
}): NarrativeMadridQualificationFingerprintsV4 {
  const partial = {
    routeV7: input.evidence.route.sourceFingerprint,
    evidenceAndProvenance: evidenceProvenanceFingerprint(input.evidence),
    deterministicPlan: narrativeClaimPlanFingerprintV4(input.plan),
    selectedText: input.selected?.text
      ? narrativeTourTextFingerprintV4(input.selected.text)
      : editorialFingerprintV7(null),
    prosePromptAndSchema: narrativeProseGeneratorPromptFingerprintV4(),
    groundingCriticPromptAndSchema: narrativeGroundingCriticPromptFingerprintV4(),
    finalCriticPromptAndSchema: narrativeFinalCriticPromptFingerprintV4(),
    modelsAndParameters: editorialFingerprintV7({
      writer: { model: NARRATIVE_WRITER_MODEL_V4, parameters: NARRATIVE_WRITER_PARAMETERS_V4 },
      critic: { model: input.criticModel, parameters: NARRATIVE_CRITIC_PARAMETERS_V4 },
    }),
    selectedVariant: editorialFingerprintV7(input.selected?.variant ?? null),
    policies: editorialFingerprintV7({
      qualification: NARRATIVE_MADRID_QUALIFICATION_POLICIES_V4,
      variants: NARRATIVE_VARIANTS_V4,
    }),
    reports: editorialFingerprintV7({
      candidates: input.candidates.map((candidate) => ({
        grounding: candidate.grounding.value,
        final: candidate.finalCritiques.map((critique) => critique.value),
      })),
      clean: input.clean?.report ?? null,
      mutations: input.mutations.map((mutation) => mutation.report),
    }),
    mutations: editorialFingerprintV7(input.mutations),
    preview: input.preview?.fingerprint ?? editorialFingerprintV7(null),
  };
  return {
    ...partial,
    qualification: editorialFingerprintV7({
      schemaVersion: NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V4,
      caseId: input.evidence.caseId,
      status: input.status,
      candidates: editorialFingerprintV7(input.candidates),
      summary: input.summary,
      failureReasons: input.failureReasons,
      fingerprints: partial,
    }),
  };
}

function evaluateQualification(input: {
  candidates: AutonomousNarrativeArtifactV4[];
  selected: AutonomousNarrativeArtifactV4 | null;
  clean: NarrativeQualificationCritiqueV4 | null;
  mutations: NarrativeMadridMutationProbeV4[];
  criticModel: NarrativeCriticModelInfoV4;
}): {
  status: 'passed' | 'failed';
  summary: NarrativeMadridPilotQualificationV4['summary'];
  failureReasons: string[];
} {
  const approvedCandidates = input.candidates.filter(candidateIsEligible).length;
  const candidateAttempts = input.candidates.flatMap(artifactCritiques);
  const qualificationCritiques = [
    ...(input.clean ? [input.clean] : []),
    ...input.mutations,
  ];
  const expectedCritiques = candidateAttempts.length + (input.selected ? 5 : 0);
  const executedCritiques = candidateAttempts.filter((attempts) => attempts.length > 0).length
    + qualificationCritiques.filter((critique) => critique.attempts.length > 0).length;
  const durations = [
    ...candidateAttempts.map((attempts) => attempts.length > 0
      ? attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0)
      : null),
    ...qualificationCritiques.map(critiqueDuration),
  ];
  const cleanGate = input.clean?.report
    ? evaluateNarrativeCriticGateV4(input.clean.report)
    : null;
  const criticFullyGpu = input.criticModel.digest === NARRATIVE_CRITIC_DIGEST_V4
    && input.criticModel.quantizationLevel === NARRATIVE_CRITIC_QUANTIZATION_V4
    && input.criticModel.fullyGpu === true
    && input.criticModel.sizeBytes > 0
    && input.criticModel.sizeBytes === input.criticModel.sizeVramBytes;
  const summary = {
    approvedCandidates,
    totalCandidates: input.candidates.length,
    cleanCritiquePassed: input.clean?.status === 'valid' && cleanGate?.passed === true,
    factualMutationsDetected: input.mutations.filter((mutation) => mutation.factualRejection).length,
    totalMutations: input.mutations.length,
    expectedCritiques,
    executedCritiques,
    allCritiquesBelow180Seconds: durations.length > 0
      && durations.every((duration) => duration !== null && duration < 180_000),
    criticFullyGpu,
  };
  const failureReasons: string[] = [];
  if (input.candidates.length !== 3) failureReasons.push('candidate_count_not_3');
  if (approvedCandidates < 1 || !input.selected) failureReasons.push('no_machine_approved_candidate');
  if (!summary.cleanCritiquePassed && input.selected) failureReasons.push('clean_recritique_failed');
  for (const kind of NARRATIVE_MUTATION_KINDS_V4) {
    const probe = input.mutations.find((mutation) => mutation.mutation === kind);
    if (!probe?.factualRejection) failureReasons.push(`mutation_not_factually_rejected:${kind}`);
  }
  if (summary.totalMutations !== (input.selected ? 4 : 0)) {
    failureReasons.push('mutation_count_changed');
  }
  if (summary.executedCritiques !== summary.expectedCritiques) {
    failureReasons.push('expected_critiques_not_executed');
  }
  if (!summary.allCritiquesBelow180Seconds) failureReasons.push('critic_latency_invalid');
  if (!summary.criticFullyGpu) failureReasons.push('critic_not_fully_gpu');
  return { status: failureReasons.length === 0 ? 'passed' : 'failed', summary, failureReasons };
}

export async function runNarrativeMadridPilotQualificationV4(
  rawEvidence: NarrativeEvidenceCaseV4,
  services: NarrativeMadridQualificationServicesV4
): Promise<NarrativeMadridPilotQualificationV4> {
  const evidence = validateNarrativeEvidenceCaseV4(rawEvidence);
  const plan = buildNarrativeClaimPlanV4(evidence);
  const candidates: AutonomousNarrativeArtifactV4[] = [];
  for (const variant of NARRATIVE_MADRID_QUALIFICATION_POLICIES_V4.variants) {
    const candidate = await services.runCandidate(variant);
    if (candidate.variant !== variant || candidate.evidenceFingerprint !== evidence.fingerprint
      || candidate.planFingerprint !== narrativeClaimPlanFingerprintV4(plan)
      || (candidate.status === 'machine_approved' && !candidateIsEligible(candidate))
      || (candidate.status === 'rejected' && candidate.text !== null)) {
      throw new Error(`narrative madrid candidate ${variant} violates its artifact contract`);
    }
    candidates.push(candidate);
  }
  const selected = selectNarrativeCandidateV4(candidates);
  let clean: NarrativeQualificationCritiqueV4 | null = null;
  const mutations: NarrativeMadridMutationProbeV4[] = [];
  let preview: NarrativePilotPreviewV4 | null = null;
  if (selected?.text) {
    clean = await runCritique(services, evidence, plan, selected.text);
    for (const kind of NARRATIVE_MUTATION_KINDS_V4) {
      const mutated = applyNarrativeMutationV4(selected.text, evidence, kind);
      const critique = await runCritique(services, evidence, plan, mutated);
      mutations.push({
        mutation: kind,
        mutatedTextFingerprint: narrativeTourTextFingerprintV4(mutated),
        ...critique,
      });
    }
    preview = buildNarrativePilotPreviewV4(evidence, selected.text);
  }
  const evaluated = evaluateQualification({
    candidates, selected, clean, mutations, criticModel: services.criticModel,
  });
  const fingerprints = buildFingerprints({
    evidence, plan, candidates, selected, clean, mutations, preview,
    criticModel: services.criticModel,
    ...evaluated,
  });
  return {
    schemaVersion: NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V4,
    status: evaluated.status,
    caseId: evidence.caseId,
    criticModel: services.criticModel,
    candidates,
    selectedVariant: selected?.variant ?? null,
    selectedArtifact: selected,
    cleanCritique: clean,
    mutations,
    preview,
    summary: evaluated.summary,
    failureReasons: evaluated.failureReasons,
    fingerprints,
  };
}

export function replayNarrativeMadridPilotQualificationV4(
  result: NarrativeMadridPilotQualificationV4,
  rawEvidence: NarrativeEvidenceCaseV4
): NarrativeMadridPilotQualificationV4 {
  const evidence = validateNarrativeEvidenceCaseV4(rawEvidence);
  if (result.schemaVersion !== NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V4
    || result.caseId !== evidence.caseId
    || result.candidates.map((candidate) => candidate.variant).join(',')
      !== NARRATIVE_MADRID_QUALIFICATION_POLICIES_V4.variants.join(',')) {
    throw new Error('narrative madrid qualification metadata changed');
  }
  const plan = buildNarrativeClaimPlanV4(evidence);
  for (const candidate of result.candidates) {
    const report = candidateReport(candidate);
    if (candidate.status === 'machine_approved' && candidate.text && report) {
      validateNarrativeCriticReportV4(
        report,
        buildNarrativeCriticRequestV4(evidence, plan, candidate.text)
      );
    }
    if (candidate.evidenceFingerprint !== evidence.fingerprint
      || candidate.planFingerprint !== narrativeClaimPlanFingerprintV4(plan)
      || (candidate.status === 'machine_approved' && !candidateIsEligible(candidate))
      || (candidate.status === 'rejected' && candidate.text !== null)
      || (candidate.grounding.value
        && candidate.status === 'machine_approved'
        && !evaluateNarrativeGroundingGateV4(candidate.grounding.value).passed)) {
      throw new Error(`narrative madrid candidate ${candidate.variant} changed`);
    }
  }
  const selected = selectNarrativeCandidateV4(result.candidates);
  if (selected?.variant !== result.selectedVariant
    || selected?.variant !== result.selectedArtifact?.variant) {
    throw new Error('narrative madrid selected candidate changed');
  }
  for (const mutation of result.mutations) {
    if (!selected?.text || narrativeTourTextFingerprintV4(
      applyNarrativeMutationV4(selected.text, evidence, mutation.mutation)
    ) !== mutation.mutatedTextFingerprint) {
      throw new Error(`narrative madrid mutation ${mutation.mutation} changed`);
    }
  }
  const evaluated = evaluateQualification({
    candidates: result.candidates,
    selected,
    clean: result.cleanCritique,
    mutations: result.mutations,
    criticModel: result.criticModel,
  });
  const preview = selected?.text ? buildNarrativePilotPreviewV4(evidence, selected.text) : null;
  const fingerprints = buildFingerprints({
    evidence, plan, candidates: result.candidates, selected,
    clean: result.cleanCritique, mutations: result.mutations, preview,
    criticModel: result.criticModel, ...evaluated,
  });
  if (result.status !== evaluated.status
    || editorialFingerprintV7(result.summary) !== editorialFingerprintV7(evaluated.summary)
    || editorialFingerprintV7(result.failureReasons)
      !== editorialFingerprintV7(evaluated.failureReasons)
    || editorialFingerprintV7(result.preview) !== editorialFingerprintV7(preview)
    || editorialFingerprintV7(result.fingerprints) !== editorialFingerprintV7(fingerprints)) {
    throw new Error('narrative madrid qualification gate or fingerprint changed');
  }
  return result;
}
