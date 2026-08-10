import { AutonomousNarrativeArtifactV5 } from './AutonomousNarrativeV5';
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
  NarrativeMutationKindV4,
  applyNarrativeMutationV4,
} from './NarrativeMadridPilotQualificationV4';
import {
  NarrativePilotPreviewV5,
  buildNarrativePilotPreviewV5,
} from './NarrativeMadridPilotPreviewV5';
import {
  NARRATIVE_CRITIC_DIGEST_V4,
  NARRATIVE_CRITIC_PARAMETERS_V4,
  NARRATIVE_CRITIC_QUANTIZATION_V4,
  NarrativeCriticModelInfoV4,
  narrativeGroundingCriticPromptFingerprintV4,
} from './NarrativePilotGemmaV4';
import {
  NARRATIVE_FINAL_CRITIC_PARAMETERS_V5,
  narrativeFinalCriticPromptFingerprintV5,
} from './NarrativePilotGemmaV5';
import {
  NARRATIVE_VARIANTS_V5,
  NARRATIVE_WRITER_MODEL_V5,
  NARRATIVE_WRITER_PARAMETERS_V5,
  NarrativeVariantV5,
  narrativeProseGeneratorPromptFingerprintV5,
} from './NarrativePilotWriterV5';
import { NarrativeTourTextV4 } from './NarrativeProseV4';
import { narrativeTourTextFingerprintV5 } from './NarrativeProseV5';

export const NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V5 =
  'narrative-madrid-pilot-qualification-v5' as const;

export const NARRATIVE_MUTATION_KINDS_V5 = [
  'invented_causality',
  'cross_scene_attribution',
  'false_character',
  'misleading_omission',
] as const satisfies readonly NarrativeMutationKindV4[];

export const NARRATIVE_MADRID_QUALIFICATION_POLICIES_V5 = {
  variants: ['on_site', 'curiosity', 'documentary'] as NarrativeVariantV5[],
  minimumApprovedCandidates: 1,
  proseRepairsPerVariant: 1,
  mutationKinds: NARRATIVE_MUTATION_KINDS_V5,
  maximumCriticLatencyMsExclusive: 180_000,
  tieBreak: ['minimum_scene_score', 'total_quality_score', 'variant_order'],
  publicTourStatus: 'review',
  pilotState: 'prepared',
  machineApprovalIsDemandEvidence: false,
} as const;

const FACTUAL_REASONS = new Set<NarrativeCriticGateReasonV4>([
  'new_claim', 'distorted_claim', 'omitted_claim', 'misleading_omission', 'critical_finding',
]);

export interface NarrativeQualificationCritiqueV5 {
  status: EditorialCallResultV6<NarrativeCriticReportV4>['status'];
  report: NarrativeCriticReportV4 | null;
  attempts: EditorialAttemptV6[];
  rejectionReasons: NarrativeCriticGateReasonV4[];
  factualRejection: boolean;
  diagnostic: string | null;
}

export interface NarrativeMadridMutationProbeV5 extends NarrativeQualificationCritiqueV5 {
  mutation: NarrativeMutationKindV4;
  mutatedTextFingerprint: string;
}

export interface NarrativeMadridQualificationFingerprintsV5 {
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

export interface NarrativeMadridPilotQualificationV5 {
  schemaVersion: typeof NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V5;
  status: 'passed' | 'failed';
  caseId: string;
  criticModel: NarrativeCriticModelInfoV4;
  candidates: AutonomousNarrativeArtifactV5[];
  selectedVariant: NarrativeVariantV5 | null;
  selectedArtifact: AutonomousNarrativeArtifactV5 | null;
  cleanCritique: NarrativeQualificationCritiqueV5 | null;
  mutations: NarrativeMadridMutationProbeV5[];
  preview: NarrativePilotPreviewV5 | null;
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
  fingerprints: NarrativeMadridQualificationFingerprintsV5;
}

export interface NarrativeMadridQualificationServicesV5 {
  criticModel: NarrativeCriticModelInfoV4;
  runCandidate(variant: NarrativeVariantV5): Promise<AutonomousNarrativeArtifactV5>;
  critique(
    text: NarrativeTourTextV4,
    plan: NarrativeClaimPlanV4
  ): Promise<EditorialCallResultV6<NarrativeCriticReportV4>>;
}

function candidateReport(artifact: AutonomousNarrativeArtifactV5): NarrativeCriticReportV4 | null {
  return artifact.finalCritiques.at(-1)?.value ?? null;
}

function candidateIsEligible(artifact: AutonomousNarrativeArtifactV5): boolean {
  const grounding = artifact.grounding;
  const finalCritique = artifact.finalCritiques.at(-1);
  const report = finalCritique?.value ?? null;
  return artifact.schemaVersion === 'autonomous-narrative-v5'
    && artifact.status === 'machine_approved'
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

function candidateScore(artifact: AutonomousNarrativeArtifactV5) {
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

export function selectNarrativeCandidateV5(
  candidates: AutonomousNarrativeArtifactV5[]
): AutonomousNarrativeArtifactV5 | null {
  const order = NARRATIVE_MADRID_QUALIFICATION_POLICIES_V5.variants;
  return candidates.filter(candidateIsEligible).sort((left, right) => {
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
): NarrativeQualificationCritiqueV5 {
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
      status: 'semantic_error', report: null, attempts: result.attempts,
      rejectionReasons: [], factualRejection: false,
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

function failedCritique(error: unknown): NarrativeQualificationCritiqueV5 {
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
  services: NarrativeMadridQualificationServicesV5,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4,
  text: NarrativeTourTextV4
): Promise<NarrativeQualificationCritiqueV5> {
  try {
    return resultCritique(await services.critique(text, plan), evidence, plan, text);
  } catch (error) {
    return failedCritique(error);
  }
}

function critiqueDuration(critique: NarrativeQualificationCritiqueV5): number | null {
  return critique.attempts.length > 0
    ? critique.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0)
    : null;
}

function artifactCritiques(artifact: AutonomousNarrativeArtifactV5): EditorialAttemptV6[][] {
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
  candidates: AutonomousNarrativeArtifactV5[];
  selected: AutonomousNarrativeArtifactV5 | null;
  clean: NarrativeQualificationCritiqueV5 | null;
  mutations: NarrativeMadridMutationProbeV5[];
  preview: NarrativePilotPreviewV5 | null;
  criticModel: NarrativeCriticModelInfoV4;
  status: 'passed' | 'failed';
  summary: NarrativeMadridPilotQualificationV5['summary'];
  failureReasons: string[];
}): NarrativeMadridQualificationFingerprintsV5 {
  const partial = {
    routeV7: input.evidence.route.sourceFingerprint,
    evidenceAndProvenance: evidenceProvenanceFingerprint(input.evidence),
    deterministicPlan: narrativeClaimPlanFingerprintV4(input.plan),
    selectedText: input.selected?.text
      ? narrativeTourTextFingerprintV5(input.selected.text)
      : editorialFingerprintV7(null),
    prosePromptAndSchema: narrativeProseGeneratorPromptFingerprintV5(),
    groundingCriticPromptAndSchema: narrativeGroundingCriticPromptFingerprintV4(),
    finalCriticPromptAndSchema: narrativeFinalCriticPromptFingerprintV5(),
    modelsAndParameters: editorialFingerprintV7({
      writer: { model: NARRATIVE_WRITER_MODEL_V5, parameters: NARRATIVE_WRITER_PARAMETERS_V5 },
      critic: {
        model: input.criticModel,
        groundingParameters: NARRATIVE_CRITIC_PARAMETERS_V4,
        finalParameters: NARRATIVE_FINAL_CRITIC_PARAMETERS_V5,
      },
    }),
    selectedVariant: editorialFingerprintV7(input.selected?.variant ?? null),
    policies: editorialFingerprintV7({
      qualification: NARRATIVE_MADRID_QUALIFICATION_POLICIES_V5,
      variants: NARRATIVE_VARIANTS_V5,
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
      schemaVersion: NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V5,
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
  candidates: AutonomousNarrativeArtifactV5[];
  selected: AutonomousNarrativeArtifactV5 | null;
  clean: NarrativeQualificationCritiqueV5 | null;
  mutations: NarrativeMadridMutationProbeV5[];
  criticModel: NarrativeCriticModelInfoV4;
}) {
  const approvedCandidates = input.candidates.filter(candidateIsEligible).length;
  const candidateAttempts = input.candidates.flatMap(artifactCritiques);
  const qualificationCritiques = [...(input.clean ? [input.clean] : []), ...input.mutations];
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
  const summary: NarrativeMadridPilotQualificationV5['summary'] = {
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
  for (const kind of NARRATIVE_MUTATION_KINDS_V5) {
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
  return {
    status: (failureReasons.length === 0 ? 'passed' : 'failed') as 'passed' | 'failed',
    summary,
    failureReasons,
  };
}

function validateCandidate(
  candidate: AutonomousNarrativeArtifactV5,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4
): void {
  if (!NARRATIVE_MADRID_QUALIFICATION_POLICIES_V5.variants.includes(candidate.variant)
    || candidate.evidenceFingerprint !== evidence.fingerprint
    || candidate.planFingerprint !== narrativeClaimPlanFingerprintV4(plan)
    || (candidate.status === 'machine_approved' && !candidateIsEligible(candidate))
    || (candidate.status === 'rejected' && candidate.text !== null)) {
    throw new Error(`narrative madrid v5 candidate ${candidate.variant} violates its contract`);
  }
  if (candidate.text && candidateReport(candidate)) {
    validateNarrativeCriticReportV4(
      candidateReport(candidate),
      buildNarrativeCriticRequestV4(evidence, plan, candidate.text)
    );
  }
}

export async function runNarrativeMadridPilotQualificationV5(
  rawEvidence: NarrativeEvidenceCaseV4,
  services: NarrativeMadridQualificationServicesV5
): Promise<NarrativeMadridPilotQualificationV5> {
  const evidence = validateNarrativeEvidenceCaseV4(rawEvidence);
  const plan = buildNarrativeClaimPlanV4(evidence);
  const candidates: AutonomousNarrativeArtifactV5[] = [];
  for (const variant of NARRATIVE_MADRID_QUALIFICATION_POLICIES_V5.variants) {
    const candidate = await services.runCandidate(variant);
    if (candidate.variant !== variant) {
      throw new Error(`narrative madrid v5 candidate order changed at ${variant}`);
    }
    validateCandidate(candidate, evidence, plan);
    candidates.push(candidate);
  }
  const selected = selectNarrativeCandidateV5(candidates);
  let clean: NarrativeQualificationCritiqueV5 | null = null;
  const mutations: NarrativeMadridMutationProbeV5[] = [];
  let preview: NarrativePilotPreviewV5 | null = null;
  if (selected?.text) {
    clean = await runCritique(services, evidence, plan, selected.text);
    for (const kind of NARRATIVE_MUTATION_KINDS_V5) {
      const mutated = applyNarrativeMutationV4(selected.text, evidence, kind);
      const critique = await runCritique(services, evidence, plan, mutated);
      mutations.push({
        mutation: kind,
        mutatedTextFingerprint: narrativeTourTextFingerprintV5(mutated),
        ...critique,
      });
    }
    preview = buildNarrativePilotPreviewV5(evidence, selected.text);
  }
  const evaluated = evaluateQualification({
    candidates, selected, clean, mutations, criticModel: services.criticModel,
  });
  const fingerprints = buildFingerprints({
    evidence, plan, candidates, selected, clean, mutations, preview,
    criticModel: services.criticModel, ...evaluated,
  });
  return {
    schemaVersion: NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V5,
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

export function replayNarrativeMadridPilotQualificationV5(
  result: NarrativeMadridPilotQualificationV5,
  rawEvidence: NarrativeEvidenceCaseV4
): NarrativeMadridPilotQualificationV5 {
  const evidence = validateNarrativeEvidenceCaseV4(rawEvidence);
  const plan = buildNarrativeClaimPlanV4(evidence);
  if (result.schemaVersion !== NARRATIVE_MADRID_QUALIFICATION_SCHEMA_VERSION_V5
    || result.caseId !== evidence.caseId
    || result.candidates.map((candidate) => candidate.variant).join(',')
      !== NARRATIVE_MADRID_QUALIFICATION_POLICIES_V5.variants.join(',')) {
    throw new Error('narrative madrid v5 qualification metadata changed');
  }
  result.candidates.forEach((candidate) => validateCandidate(candidate, evidence, plan));
  const selected = selectNarrativeCandidateV5(result.candidates);
  if (selected?.variant !== result.selectedVariant
    || selected?.variant !== result.selectedArtifact?.variant) {
    throw new Error('narrative madrid v5 selected candidate changed');
  }
  if (selected?.text && result.cleanCritique?.report) {
    validateNarrativeCriticReportV4(
      result.cleanCritique.report,
      buildNarrativeCriticRequestV4(evidence, plan, selected.text)
    );
  }
  for (const mutation of result.mutations) {
    if (!selected?.text) throw new Error('narrative madrid v5 mutation lacks selected text');
    const mutated = applyNarrativeMutationV4(selected.text, evidence, mutation.mutation);
    if (narrativeTourTextFingerprintV5(mutated) !== mutation.mutatedTextFingerprint) {
      throw new Error(`narrative madrid v5 mutation ${mutation.mutation} changed`);
    }
    if (mutation.report) {
      validateNarrativeCriticReportV4(
        mutation.report,
        buildNarrativeCriticRequestV4(evidence, plan, mutated)
      );
    }
  }
  const evaluated = evaluateQualification({
    candidates: result.candidates,
    selected,
    clean: result.cleanCritique,
    mutations: result.mutations,
    criticModel: result.criticModel,
  });
  const preview = selected?.text ? buildNarrativePilotPreviewV5(evidence, selected.text) : null;
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
    throw new Error('narrative madrid v5 qualification gate or fingerprint changed');
  }
  return result;
}
