import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import {
  NarrativeClaimPlanV4,
  buildNarrativeClaimPlanV4,
  narrativeClaimPlanFingerprintV4,
} from './NarrativeClaimPlanV4';
import {
  NarrativeCriticReportV4,
  NarrativeGroundingCriticReportV4,
  buildNarrativeCriticRequestV4,
  buildNarrativeGroundingCriticRequestV4,
  evaluateNarrativeCriticGateV4,
  evaluateNarrativeGroundingGateV4,
  narrativeRepairInstructionsV4,
} from './NarrativeCriticV4';
import {
  NarrativeEvidenceCaseV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import {
  NarrativeProseRepairV5,
  NarrativeVariantV5,
} from './NarrativePilotWriterV5';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

export const AUTONOMOUS_NARRATIVE_SCHEMA_VERSION_V5 = 'autonomous-narrative-v5' as const;

export type AutonomousNarrativeFailureCodeV5 =
  | 'evidence_grounding_failed'
  | 'grounding_protocol_failed'
  | 'writer_protocol_failed'
  | 'critic_protocol_failed'
  | 'critic_timeout'
  | 'content_rejected';

export interface AutonomousNarrativeInputV5 {
  evidence: NarrativeEvidenceCaseV4;
  variant: NarrativeVariantV5;
}

export interface AutonomousNarrativeServicesV5 {
  critiqueGrounding(
    request: ReturnType<typeof buildNarrativeGroundingCriticRequestV4>
  ): Promise<EditorialCallResultV6<NarrativeGroundingCriticReportV4>>;
  generateProse(
    evidence: NarrativeEvidenceCaseV4,
    plan: NarrativeClaimPlanV4,
    variant: NarrativeVariantV5,
    repair?: NarrativeProseRepairV5
  ): Promise<EditorialCallResultV6<NarrativeTourTextV4>>;
  critiqueFinal(
    request: ReturnType<typeof buildNarrativeCriticRequestV4>
  ): Promise<EditorialCallResultV6<NarrativeCriticReportV4>>;
}

export interface AutonomousNarrativeArtifactV5 {
  schemaVersion: typeof AUTONOMOUS_NARRATIVE_SCHEMA_VERSION_V5;
  status: 'machine_approved' | 'rejected';
  variant: NarrativeVariantV5;
  evidenceFingerprint: string;
  plan: NarrativeClaimPlanV4;
  planFingerprint: string;
  text: NarrativeTourTextV4 | null;
  grounding: EditorialCallResultV6<NarrativeGroundingCriticReportV4>;
  proseAttempts: EditorialCallResultV6<NarrativeTourTextV4>[];
  finalCritiques: EditorialCallResultV6<NarrativeCriticReportV4>[];
  failure: { code: AutonomousNarrativeFailureCodeV5; message: string } | null;
}

function critiqueIsFast(result: EditorialCallResultV6<unknown>): boolean {
  return result.attempts.length > 0
    && result.attempts.every((attempt) => attempt.latencyMs < 180_000);
}

function previousCandidate(result: EditorialCallResultV6<unknown>): unknown {
  if (!result.rawOutput) return {};
  try {
    return JSON.parse(result.rawOutput);
  } catch {
    return {};
  }
}

interface SerializedValidationIssueV5 {
  path: string;
  message: string;
  observed?: number;
  minimum?: number;
  maximum?: number;
}

function parseValidationIssues(error: string): SerializedValidationIssueV5[] {
  const marker = 'narrative_prose_validation_v5:';
  const markerIndex = error.indexOf(marker);
  if (markerIndex < 0) return [];
  try {
    const parsed = JSON.parse(error.slice(markerIndex + marker.length));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((issue): issue is SerializedValidationIssueV5 => (
      issue && typeof issue === 'object'
      && typeof issue.path === 'string'
      && typeof issue.message === 'string'
    ));
  } catch {
    return [];
  }
}

export function semanticRepairInstructionsV5(
  result: EditorialCallResultV6<unknown>
): string[] {
  const instructions = result.attempts
    .filter((attempt) => attempt.status === 'semantic_error' && attempt.error)
    .flatMap((attempt) => {
      const issues = parseValidationIssues(attempt.error!);
      return issues.length > 0
        ? issues.map((issue) => {
          if (typeof issue.observed === 'number' && typeof issue.maximum === 'number'
            && typeof issue.minimum === 'number' && issue.observed > issue.maximum) {
            return `Reduce ${issue.path} by at least ${issue.observed - issue.maximum} words without omitting any approved claim; leave the complete scene between ${issue.minimum} and ${issue.maximum} words.`;
          }
          if (typeof issue.observed === 'number' && typeof issue.minimum === 'number'
            && typeof issue.maximum === 'number' && issue.observed < issue.minimum) {
            return `Add at least ${issue.minimum - issue.observed} words to ${issue.path} using only its approved claims; leave the complete scene between ${issue.minimum} and ${issue.maximum} words.`;
          }
          return `Corrige ${issue.path}: ${issue.message}`;
        })
        : [`Corrige el contrato de prosa: ${attempt.error}`];
    });
  return [...new Set(instructions.length > 0 ? instructions : [
    'Corrige el contrato de prosa completo sin cambiar el plan factual.',
  ])];
}

function rejected(
  base: Omit<AutonomousNarrativeArtifactV5, 'status' | 'text' | 'failure'>,
  code: AutonomousNarrativeFailureCodeV5,
  message: string
): AutonomousNarrativeArtifactV5 {
  return { ...base, status: 'rejected', text: null, failure: { code, message } };
}

export async function runAutonomousNarrativeV5(
  input: AutonomousNarrativeInputV5,
  services: AutonomousNarrativeServicesV5
): Promise<AutonomousNarrativeArtifactV5> {
  const evidence = validateNarrativeEvidenceCaseV4(input.evidence);
  const plan = buildNarrativeClaimPlanV4(evidence);
  const grounding = await services.critiqueGrounding(
    buildNarrativeGroundingCriticRequestV4(evidence, plan)
  );
  const base = {
    schemaVersion: AUTONOMOUS_NARRATIVE_SCHEMA_VERSION_V5,
    variant: input.variant,
    evidenceFingerprint: evidence.fingerprint,
    plan,
    planFingerprint: narrativeClaimPlanFingerprintV4(plan),
    grounding,
    proseAttempts: [] as EditorialCallResultV6<NarrativeTourTextV4>[],
    finalCritiques: [] as EditorialCallResultV6<NarrativeCriticReportV4>[],
  };
  if (grounding.status !== 'valid' || !grounding.value) {
    return rejected(
      base,
      'grounding_protocol_failed',
      `Grounding critic returned ${grounding.status} after its protocol retry.`
    );
  }
  if (!critiqueIsFast(grounding)) {
    return rejected(base, 'critic_timeout', 'Grounding critique reached the 180 second limit.');
  }
  const groundingGate = evaluateNarrativeGroundingGateV4(grounding.value);
  if (!groundingGate.passed) {
    return rejected(
      base,
      'evidence_grounding_failed',
      `Deterministic evidence plan failed grounding: ${groundingGate.reasons.join(', ')}.`
    );
  }

  let repair: NarrativeProseRepairV5 | undefined;
  for (let contentAttempt = 1; contentAttempt <= 2; contentAttempt += 1) {
    const prose = await services.generateProse(evidence, plan, input.variant, repair);
    base.proseAttempts.push(prose);
    if (prose.status !== 'valid' || !prose.value) {
      const instructions = semanticRepairInstructionsV5(prose);
      if (prose.status === 'semantic_error' && contentAttempt === 1) {
        repair = { previousCandidate: previousCandidate(prose), instructions };
        continue;
      }
      return rejected(
        base,
        prose.status === 'semantic_error' ? 'content_rejected' : 'writer_protocol_failed',
        prose.status === 'semantic_error'
          ? `The repaired prose still violates the deterministic content contract: ${instructions.join(' | ')}`
          : `Writer returned ${prose.status} after its protocol retry.`
      );
    }

    const critique = await services.critiqueFinal(
      buildNarrativeCriticRequestV4(evidence, plan, prose.value)
    );
    base.finalCritiques.push(critique);
    if (critique.status !== 'valid' || !critique.value) {
      return rejected(
        base,
        'critic_protocol_failed',
        `Final critic returned ${critique.status} after its protocol retry.`
      );
    }
    if (!critiqueIsFast(critique)) {
      return rejected(base, 'critic_timeout', 'Final critique reached the 180 second limit.');
    }
    const gate = evaluateNarrativeCriticGateV4(critique.value);
    if (gate.passed) {
      return { ...base, status: 'machine_approved', text: prose.value, failure: null };
    }
    if (contentAttempt === 1) {
      repair = {
        previousCandidate: previousCandidate(prose),
        instructions: narrativeRepairInstructionsV4(critique.value),
      };
      continue;
    }
    return rejected(
      base,
      'content_rejected',
      `The repaired route failed the final gate: ${gate.reasons.join(', ')}.`
    );
  }
  return rejected(base, 'content_rejected', 'The prose repair budget was exhausted.');
}
