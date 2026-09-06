export interface NarrativeNarrationTargetV8 {
  stopId: string;
  targetSeconds: number;
  targetWords: number;
  minPropositions: number;
  maxPropositions: number;
  minVisualAnchors: number;
  targetEvidenceCards?: number;
  minFacetCount?: number;
  minSpatialAnchors?: number;
}

export interface NarrationStopInput {
  stopId: string;
  required: boolean;
}

export interface AllocateNarrationTargetsV8Input {
  durationMinutes: number;
  walkingSeconds: number | null;
  stops: NarrationStopInput[];
}

const OPERATIONAL_BUFFER_RATIO = 0.15;
const MAX_NARRATION_SECONDS_PER_STOP = 300;
const MIN_NARRATION_SECONDS_PER_STOP = 120;
const REQUIRED_WEIGHT = 1.2;
const OPTIONAL_WEIGHT = 1;
const WALKING_FALLBACK_RATIO = 0.35;
const MAX_TOTAL_NARRATION_RATIO = 0.3;
export const SPEAKING_RATE_WORDS_PER_MINUTE = 120;

export function narrationLengthBoundsV8(targetWords: number): { minimumWords: number; maximumWords: number } {
  return {
    minimumWords: Math.max(0, targetWords - 25),
    maximumWords: Math.floor(targetWords * 1.1),
  };
}

// Provisional delivery tolerance until measured TTS: local variation must not
// accumulate into a short/long tour. The narrower writing target stays unchanged.
export function evaluateNarrationDeliveryV8(items: ReadonlyArray<{ targetWords: number; actualWords: number }>): {
  localPassed: boolean; aggregatePassed: boolean; passed: boolean;
} {
  const valid = items.length > 0 && items.every(item => Number.isFinite(item.targetWords)
    && item.targetWords > 0 && Number.isFinite(item.actualWords) && item.actualWords >= 0);
  const localPassed = valid && items.every(item => item.actualWords >= Math.ceil(item.targetWords * 0.8)
    && item.actualWords <= Math.floor(item.targetWords * 1.2));
  const target = items.reduce((sum, item) => sum + item.targetWords, 0);
  const actual = items.reduce((sum, item) => sum + item.actualWords, 0);
  const aggregatePassed = valid && actual >= Math.ceil(target * 0.9) && actual <= Math.floor(target * 1.1);
  return { localPassed, aggregatePassed, passed: localPassed && aggregatePassed };
}

const NARRATIVE_REPAIR_UPPER_BOUND_GRACE_WORDS_V8 = 20;
const NARRATIVE_REPAIR_LOWER_BOUND_GRACE_WORDS_V8 = 5;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeNonNegative(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

export function narrationTargetForSecondsV8(stopId: string, targetSeconds: number): NarrativeNarrationTargetV8 {
  const normalizedSeconds = clamp(Math.floor(normalizeNonNegative(targetSeconds)), 0, MAX_NARRATION_SECONDS_PER_STOP);

  const targetWords = Math.round((normalizedSeconds / 60) * SPEAKING_RATE_WORDS_PER_MINUTE);
  const minPropositions = clamp(Math.round(normalizedSeconds / 35), 6, 12);
  const maxPropositions = Math.min(16, minPropositions + 4);
  const minVisualAnchors = clamp(Math.round(normalizedSeconds / 120), 2, 4);
  const targetEvidenceCards = clamp(Math.ceil(normalizedSeconds / 30), 6, 20);
  const minFacetCount = normalizedSeconds >= 300 ? 5 : normalizedSeconds >= 240 ? 4 : 3;
  const minSpatialAnchors = normalizedSeconds >= 240 ? 2 : 1;

  return {
    stopId,
    targetSeconds: normalizedSeconds,
    targetWords,
    minPropositions,
    maxPropositions,
    minVisualAnchors,
    targetEvidenceCards,
    minFacetCount,
    minSpatialAnchors,
  };
}

export function allocateNarrationTargetsV8(input: AllocateNarrationTargetsV8Input): NarrativeNarrationTargetV8[] {
  const { durationMinutes, walkingSeconds, stops } = input;

  if (stops.length === 0) {
    return [];
  }

  const totalDurationSeconds = normalizeNonNegative(durationMinutes) * 60;
  const walking = normalizeNonNegative(walkingSeconds);
  const effectiveWalking = walkingSeconds === null || !Number.isFinite(walkingSeconds)
    ? totalDurationSeconds * WALKING_FALLBACK_RATIO
    : walking;

  const operationalBuffer = totalDurationSeconds * OPERATIONAL_BUFFER_RATIO;
  const narrationBudget = Math.floor(
    Math.min(
      totalDurationSeconds * MAX_TOTAL_NARRATION_RATIO,
      totalDurationSeconds - effectiveWalking - operationalBuffer,
      stops.length * MAX_NARRATION_SECONDS_PER_STOP,
    ),
  );

  const totalWeight = stops.reduce((sum, stop) => sum + (stop.required ? REQUIRED_WEIGHT : OPTIONAL_WEIGHT), 0);

  const targets: NarrativeNarrationTargetV8[] = stops.map((stop) => {
    const weight = stop.required ? REQUIRED_WEIGHT : OPTIONAL_WEIGHT;
    let targetSeconds: number;

    if (narrationBudget >= stops.length * MIN_NARRATION_SECONDS_PER_STOP) {
      const remainingAfterReserve = narrationBudget - stops.length * MIN_NARRATION_SECONDS_PER_STOP;
      const proportionalShare = (remainingAfterReserve / totalWeight) * weight;
      targetSeconds = Math.min(MAX_NARRATION_SECONDS_PER_STOP, Math.floor(MIN_NARRATION_SECONDS_PER_STOP + proportionalShare));
    } else {
      targetSeconds = Math.min(MAX_NARRATION_SECONDS_PER_STOP, Math.floor(narrationBudget / stops.length));
    }

    targetSeconds = clamp(targetSeconds, 0, MAX_NARRATION_SECONDS_PER_STOP);

    return narrationTargetForSecondsV8(stop.stopId, targetSeconds);
  });

  return targets;
}
