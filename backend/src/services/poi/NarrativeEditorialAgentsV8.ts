import {
  createNarrativeEditorialAgentsV6Core,
  NarrativeEditorialAgentsV6,
} from './NarrativeEditorialAgentsV6';
import {
  NarrativeStructuredWriterResultV8,
  NarrativeWriterPlanV8,
  buildNarrativeWriterPlanV8,
  narrativeWriterResponseSchemaV8,
  parseNarrativeWriterResponseV8,
} from './NarrativeWriterContractV8';
import { NarrativeLengthFitStatusV8 } from './NarrativeLengthFitterAgentV8';
import { NarrativeModelClientOptionsV6, resolveNarrativeModelProfileV6 } from './NarrativeModelProfilesV6';
import { narrativeFingerprintV6 } from './NarrativeContractsV6';
import { NarrativeAuditInputV6, NarrativeAgentExecutionV6, NarrativeAgentResultV6 } from './NarrativeEditorialAgentsV6';
import { NarrativeAuditReportV6 } from './NarrativeEditorialV6';
import { verifyNarrativeCompactV8, NarrativeBridgeEvidenceV8, NARRATIVE_COMPACT_AUDIT_PROMPT_V8 } from './NarrativeCompactVerificationV8';
import { editNarrativeSegmentsV8 } from './NarrativeSegmentEditV8';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';
import { NarrativeNarrationTargetV8, narrationLengthBoundsV8, validateNarrativeRepairLengthV8 } from './NarrativeDurationTargetsV8';

export { validateNarrativeRepairLengthV8 };

export interface NarrativeLengthOutcomeV8 {
  stopId: string;
  lengthStatus: NarrativeLengthFitStatusV8;
  targetWords: number;
  actualWords: number;
  minimumWords: number;
  maximumWords: number;
}

export interface NarrativeEditorialAgentsV8 extends NarrativeEditorialAgentsV6 {
  readonly evidenceManifestFingerprint: string;
  readonly policyFingerprint: string;
  narrationLengthOutcome(stopId: string, text: string): NarrativeLengthOutcomeV8 | null;
  writerPlan(stopId: string): NarrativeWriterPlanV8 | null;
  verify(input: NarrativeAuditInputV6, execution?: NarrativeAgentExecutionV6): Promise<NarrativeAgentResultV6<NarrativeAuditReportV6>>;
  edit(stopId: string, draft: NarrativeStructuredWriterResultV8, sentenceIds: string[], reasons: string[], execution?: NarrativeAgentExecutionV6): Promise<NarrativeAgentResultV6<NarrativeStructuredWriterResultV8>>;
}

export function validateNarrativeWriterLengthV8(
  text: string,
  target: NarrativeNarrationTargetV8
): { valid: boolean; wordCount: number; minimumWords: number; maximumWords: number } {
  const trimmed = text.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
  const { minimumWords, maximumWords } = narrationLengthBoundsV8(target.targetWords);
  return {
    valid: wordCount >= minimumWords && wordCount <= maximumWords,
    wordCount,
    minimumWords,
    maximumWords,
  };
}

export function createNarrativeEditorialAgentsV8(
  options: NarrativeModelClientOptionsV6,
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8,
  arc: NarrativeArcV8,
  narrationTargetsByStopId?: ReadonlyMap<string, NarrativeNarrationTargetV8>
): NarrativeEditorialAgentsV8 {
  const policyFingerprint = narrativeFingerprintV6({
    policy: 'staged-v8-9-repair-reasons',
    profile: resolveNarrativeModelProfileV6(options.profile),
    targets: Array.from(narrationTargetsByStopId ?? []),
    qwenEndpoint: options.qwenLocalBaseUrl ?? null,
    ollamaHost: options.ollamaHost ?? null,
    compactAuditPrompt: NARRATIVE_COMPACT_AUDIT_PROMPT_V8,
  });
  const core = createNarrativeEditorialAgentsV6Core(
    { ...options, writerRateLimitAttempts: 1 },
    createNarrativeEditorialRequestProjectorV8(admittedStops, manifest, arc, narrationTargetsByStopId),
    {
      writerRequestAttempts: 1,
      writerIncludePreviousResponseOnSemanticRetry: false,
      repairRequestAttempts: 1,
      repairIncludePreviousResponseOnSemanticRetry: false,
      writerResponseContract: (projectedInput, input) => {
        const plan = (projectedInput as Record<string, unknown>).writerPlan as NarrativeWriterPlanV8 | undefined;
        if (!plan) return undefined;
        return {
          schema: narrativeWriterResponseSchemaV8(plan),
          parse: (value: unknown) => parseNarrativeWriterResponseV8(plan, value),
        };
      },
      validateRepair: (patchedScript, input) => {
        const target = narrationTargetsByStopId?.get(input.script.stopId);
        if (!target) return;
        const validation = validateNarrativeRepairLengthV8(patchedScript.text, target, input.script.text);
        if (!validation.valid) {
          throw new Error(
            `repair_length_target_missed stop=${input.script.stopId} actual=${validation.wordCount} accepted=${validation.minimumWords}-${validation.maximumWords}`
          );
        }
      },
      auditAnchorsRequired: true,
      tourAuditRequestAttempts: 1,
    }
  );
  const mergedOptions = (execution?: NarrativeAgentExecutionV6): NarrativeModelClientOptionsV6 => {
    const signals = [options.signal, execution?.signal]
      .filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    const onProgress = execution?.onProgress ?? options.onProgress;
    return {
      ...options,
      ...(signal ? { signal } : {}),
      ...(onProgress ? { onProgress } : {}),
    };
  };
  const bridgeEvidenceFor = (stopIndex: number): NarrativeBridgeEvidenceV8 => {
    const nextIndex = stopIndex + 1;
    const nextStop = admittedStops[nextIndex];
    const arcStop = arc.stops[stopIndex];
    const bridgePropositionIds = new Set(arcStop.bridgePropositionIds);
    const bridgePropositions = nextStop
      ? nextStop.dossier.propositions.filter((p) => bridgePropositionIds.has(p.propositionId))
      : [];
    const bridgePassageIds = new Set(
      bridgePropositions.flatMap((p) => p.passageIds ?? [])
    );
    const bridgePassages = nextStop
      ? nextStop.dossier.passages.filter((p) => bridgePassageIds.has(p.passageId))
      : [];
    return {
      propositions: bridgePropositions,
      passages: bridgePassages,
      ...(nextStop ? { nextStop: { stopId: nextStop.routeStopId, authorizedNames: nextStop.dossier.authorizedNames } } : {}),
    };
  };
  return {
    ...core,
    evidenceManifestFingerprint: manifest.fingerprint,
    policyFingerprint,
    narrationLengthOutcome(stopId: string, text: string): NarrativeLengthOutcomeV8 | null {
      const target = narrationTargetsByStopId?.get(stopId);
      if (!target) return null;
      const validation = validateNarrativeWriterLengthV8(text, target);
      return {
        stopId,
        lengthStatus: validation.valid ? 'within_bounds' : 'accepted_with_residual',
        targetWords: target.targetWords,
        actualWords: validation.wordCount,
        minimumWords: validation.minimumWords,
        maximumWords: validation.maximumWords,
      };
    },
    writerPlan(stopId: string): NarrativeWriterPlanV8 | null {
      const stopIndex = admittedStops.findIndex((stop) => stop.routeStopId === stopId);
      if (stopIndex < 0) {
        throw new Error(`unknown editorial route stop ${stopId}`);
      }
      const target = narrationTargetsByStopId?.get(stopId);
      if (!target) return null;
      const admittedStop = admittedStops[stopIndex];
      return buildNarrativeWriterPlanV8({
        routeStopId: stopId,
        dossier: admittedStop.dossier,
        narrationTarget: target,
        stopIndex,
      });
    },
    async verify(input: NarrativeAuditInputV6, execution?: NarrativeAgentExecutionV6): Promise<NarrativeAgentResultV6<NarrativeAuditReportV6>> {
      const stopIndex = admittedStops.findIndex((stop) => stop.routeStopId === input.script.stopId);
      if (stopIndex < 0) {
        throw new Error(`unknown editorial route stop ${input.script.stopId}`);
      }
      if (narrativeFingerprintV6(input.dossier) !== narrativeFingerprintV6(admittedStops[stopIndex].dossier)) {
        throw new Error(`verification dossier mismatch for ${input.script.stopId}`);
      }
      const merged = mergedOptions(execution);
      return verifyNarrativeCompactV8(merged, input, bridgeEvidenceFor(stopIndex));
    },
    async edit(stopId: string, draft: NarrativeStructuredWriterResultV8, sentenceIds: string[], reasons: string[], execution?: NarrativeAgentExecutionV6): Promise<NarrativeAgentResultV6<NarrativeStructuredWriterResultV8>> {
      const plan = this.writerPlan(stopId);
      if (!plan) {
        throw new Error(`no writer plan for stop ${stopId}`);
      }
      const stopIndex = admittedStops.findIndex((stop) => stop.routeStopId === stopId);
      if (stopIndex < 0) {
        throw new Error(`unknown editorial route stop ${stopId}`);
      }
      const dossier = admittedStops[stopIndex].dossier;
      const merged = mergedOptions(execution);
      return editNarrativeSegmentsV8(merged, plan, draft, sentenceIds, reasons, dossier, bridgeEvidenceFor(stopIndex));
    },
  };
}
