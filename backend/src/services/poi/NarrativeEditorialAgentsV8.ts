import {
  createNarrativeEditorialAgentsV6Core,
  NarrativeEditorialAgentsV6,
} from './NarrativeEditorialAgentsV6';
import {
  NarrativeWriterPlanV8,
  narrativeWriterResponseSchemaV8,
  parseNarrativeWriterResponseV8,
} from './NarrativeWriterContractV8';
import { NarrativeModelClientOptionsV6 } from './NarrativeModelProfilesV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';
import { NarrativeNarrationTargetV8, narrationLengthBoundsV8 } from './NarrativeDurationTargetsV8';

export interface NarrativeEditorialAgentsV8 extends NarrativeEditorialAgentsV6 {
  readonly evidenceManifestFingerprint: string;
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
  const core = createNarrativeEditorialAgentsV6Core(
    { ...options, writerRateLimitAttempts: 3 },
    createNarrativeEditorialRequestProjectorV8(admittedStops, manifest, arc, narrationTargetsByStopId),
    {
      writerRequestAttempts: 4,
      writerIncludePreviousResponseOnSemanticRetry: true,
      repairRequestAttempts: 3,
      repairIncludePreviousResponseOnSemanticRetry: true,
      validateWriter: (value, input) => {
        const target = narrationTargetsByStopId?.get(input.stopId);
        if (!target) return;
        const validation = validateNarrativeWriterLengthV8(value.text, target);
        if (!validation.valid) {
          throw new Error(
            `writer_length_target_missed stop=${input.stopId} actual=${validation.wordCount} accepted=${validation.minimumWords}-${validation.maximumWords}`
          );
        }
      },
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
        const validation = validateNarrativeWriterLengthV8(patchedScript.text, target);
        if (!validation.valid) {
          throw new Error(
            `repair_length_target_missed stop=${input.script.stopId} actual=${validation.wordCount} accepted=${validation.minimumWords}-${validation.maximumWords}`
          );
        }
      },
    }
  );
  return {
    ...core,
    evidenceManifestFingerprint: manifest.fingerprint,
  };
}
