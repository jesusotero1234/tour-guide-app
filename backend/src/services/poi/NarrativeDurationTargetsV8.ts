export interface NarrativeNarrationTargetV8 {
  stopId: string;
  targetSeconds: number;
  targetWords: number;
  minPropositions: number;
  maxPropositions: number;
  minVisualAnchors: number;
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
const SPEAKING_RATE_WORDS_PER_MINUTE = 120;

export function narrationLengthBoundsV8(targetWords: number): { minimumWords: number; maximumWords: number } {
  return {
    minimumWords: Math.max(0, targetWords - 20),
    maximumWords: Math.floor(targetWords * 1.1),
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

    const targetWords = Math.round((targetSeconds / 60) * SPEAKING_RATE_WORDS_PER_MINUTE);
    const minPropositions = clamp(Math.round(targetSeconds / 35), 6, 12);
    const maxPropositions = Math.min(16, minPropositions + 4);
    const minVisualAnchors = clamp(Math.round(targetSeconds / 120), 2, 4);

    return {
      stopId: stop.stopId,
      targetSeconds,
      targetWords,
      minPropositions,
      maxPropositions,
      minVisualAnchors,
    };
  });

  return targets;
}
