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
import { fitNarrativeWriterLengthV8, NarrativeLengthFitStatusV8 } from './NarrativeLengthFitterAgentV8';
import { NarrativeModelClientOptionsV6 } from './NarrativeModelProfilesV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';
import { NarrativeNarrationTargetV8, narrationLengthBoundsV8 } from './NarrativeDurationTargetsV8';

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
  narrationLengthOutcome(stopId: string, text: string): NarrativeLengthOutcomeV8 | null;
}

const NARRATIVE_REPAIR_UPPER_BOUND_GRACE_WORDS_V8 = 20;
const NARRATIVE_REPAIR_LOWER_BOUND_GRACE_WORDS_V8 = 5;

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

export function validateNarrativeRepairLengthV8(
  text: string,
  target: NarrativeNarrationTargetV8,
  baselineText?: string
): { valid: boolean; wordCount: number; minimumWords: number; maximumWords: number } {
  const trimmed = text.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
  const { minimumWords, maximumWords } = narrationLengthBoundsV8(target.targetWords);
  let repairMinimumWords = Math.max(0, minimumWords - NARRATIVE_REPAIR_LOWER_BOUND_GRACE_WORDS_V8);
  let repairMaximumWords = maximumWords + NARRATIVE_REPAIR_UPPER_BOUND_GRACE_WORDS_V8;
  if (baselineText !== undefined) {
    const baselineTrimmed = baselineText.trim();
    const baselineWordCount = baselineTrimmed.length === 0 ? 0 : baselineTrimmed.split(/\s+/u).length;
    if (baselineWordCount < repairMinimumWords) {
      repairMinimumWords = baselineWordCount;
    } else if (baselineWordCount > repairMaximumWords) {
      repairMaximumWords = baselineWordCount;
    }
  }
  return {
    valid: wordCount >= repairMinimumWords && wordCount <= repairMaximumWords,
    wordCount,
    minimumWords: repairMinimumWords,
    maximumWords: repairMaximumWords,
  };
}

export function createNarrativeEditorialAgentsV8(
  options: NarrativeModelClientOptionsV6,
  admittedStops: NarrativeAdmittedStopV8[],
  manifest: NarrativeEvidenceManifestV8,
  arc: NarrativeArcV8,
  narrationTargetsByStopId?: ReadonlyMap<string, NarrativeNarrationTargetV8>
): NarrativeEditorialAgentsV8 {
  const core = createNarrativeEditorialAgentsV6Core(
    { ...options, writerRateLimitAttempts: 3 },
    createNarrativeEditorialRequestProjectorV8(admittedStops, manifest, arc, narrationTargetsByStopId),
    {
      writerRequestAttempts: 4,
      writerIncludePreviousResponseOnSemanticRetry: true,
      repairRequestAttempts: 3,
      repairIncludePreviousResponseOnSemanticRetry: true,
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
    }
  );
  const coreWrite = core.write;
  return {
    ...core,
    evidenceManifestFingerprint: manifest.fingerprint,
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
    async write(input, execution) {
      const written = await coreWrite(input, execution);
      const target = narrationTargetsByStopId?.get(input.stopId);
      if (!target) return written;

      const stopIndex = admittedStops.findIndex((stop) => stop.routeStopId === input.stopId);
      if (stopIndex < 0) {
        throw new Error(`unknown editorial route stop ${input.stopId}`);
      }
      const admittedStop = admittedStops[stopIndex];
      const plan = buildNarrativeWriterPlanV8({
        routeStopId: input.stopId,
        dossier: admittedStop.dossier,
        narrationTarget: target,
        stopIndex,
      });

      const signals = [options.signal, execution?.signal]
        .filter((signal): signal is AbortSignal => signal !== undefined);
      const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
      const onProgress = execution?.onProgress ?? options.onProgress;

      const fitResult = await fitNarrativeWriterLengthV8({
        ...options,
        ...(signal ? { signal } : {}),
        ...(onProgress ? { onProgress } : {}),
        plan,
        draft: written.value as NarrativeStructuredWriterResultV8,
      });

      return {
        value: fitResult.value,
        diagnostic: written.diagnostic,
        diagnostics: [
          ...(written.diagnostics ?? [written.diagnostic]),
          ...fitResult.diagnostics,
        ],
      };
    },
  };
}
