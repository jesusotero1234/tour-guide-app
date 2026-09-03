import {
  createNarrativeEditorialAgentsV6Core,
  NarrativeEditorialAgentsV6,
} from './NarrativeEditorialAgentsV6';
import { NarrativeModelClientOptionsV6 } from './NarrativeModelProfilesV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';
import { NarrativeArcV8 } from './NarrativeArcArchitectV8';
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';

export interface NarrativeEditorialAgentsV8 extends NarrativeEditorialAgentsV6 {
  readonly evidenceManifestFingerprint: string;
}

export function validateNarrativeWriterLengthV8(
  text: string,
  target: NarrativeNarrationTargetV8
): { valid: boolean; wordCount: number; minimumWords: number; maximumWords: number } {
  const trimmed = text.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
  const minimumWords = Math.ceil(target.targetWords * 0.9);
  const maximumWords = Math.floor(target.targetWords * 1.1);
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
    createNarrativeEditorialRequestProjectorV8(admittedStops, manifest, arc, narrationTargetsByStopId)
  );
  const originalWrite = core.write;
  const wrappedWrite = async (
    input: Parameters<typeof originalWrite>[0],
    execution?: Parameters<typeof originalWrite>[1]
  ) => {
    const result = await originalWrite(input, execution);
    const target = narrationTargetsByStopId?.get(input.stopId);
    if (!target) {
      return result;
    }
    const validation = validateNarrativeWriterLengthV8(result.value.text, target);
    if (!validation.valid) {
      throw new Error(
        `writer_length_target_missed stop=${input.stopId} actual=${validation.wordCount} accepted=${validation.minimumWords}-${validation.maximumWords}`
      );
    }
    return result;
  };
  return {
    ...core,
    write: wrappedWrite,
    evidenceManifestFingerprint: manifest.fingerprint,
  };
}
