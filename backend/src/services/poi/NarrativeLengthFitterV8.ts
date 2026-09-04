import {
  NarrativeStructuredWriterResultV8,
  NarrativeWriterPlanV8,
  parseNarrativeWriterResponseV8,
} from './NarrativeWriterContractV8';
import { narrationLengthBoundsV8 } from './NarrativeDurationTargetsV8';

export type NarrativeLengthFitDirectionV8 = 'expand' | 'compress';

export interface NarrativeLengthFitPlanV8 {
  direction: NarrativeLengthFitDirectionV8;
  wordCount: number;
  minimumWords: number;
  maximumWords: number;
  minimumChangeWords: number;
  maximumChangeWords: number;
  desiredChangeWords: number;
  editableSegmentIds: string[];
  editableWindowWords: number;
  minimumReplacementWords: number;
  maximumReplacementWords: number;
  desiredReplacementWords: number;
}

export interface NarrativeLengthFitPatchV8 {
  replacements: {
    segmentId: string;
    text: string;
    supportCardIds: string[];
  }[];
}

export interface NarrativeLengthExpansionPatchV8 {
  additions: {
    segmentId: string;
    text: string;
    supportCardIds: string[];
  }[];
}

function countWordsV8(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
}

function distanceToRangeV8(wordCount: number, minimumWords: number, maximumWords: number): number {
  if (wordCount < minimumWords) return minimumWords - wordCount;
  if (wordCount > maximumWords) return wordCount - maximumWords;
  return 0;
}

export function planNarrativeLengthFitV8(
  plan: NarrativeWriterPlanV8,
  draft: NarrativeStructuredWriterResultV8
): NarrativeLengthFitPlanV8 | null {
  const { minimumWords, maximumWords } = narrationLengthBoundsV8(plan.narrationTarget.targetWords);
  const wordCount = draft.wordCount;

  if (wordCount >= minimumWords && wordCount <= maximumWords) {
    return null;
  }

  const direction: NarrativeLengthFitDirectionV8 = wordCount < minimumWords ? 'expand' : 'compress';
  const targetWords = plan.narrationTarget.targetWords;

  let minimumChangeWords: number;
  let maximumChangeWords: number;
  let desiredChangeWords: number;

  if (direction === 'expand') {
    minimumChangeWords = minimumWords - wordCount;
    maximumChangeWords = maximumWords - wordCount;
    desiredChangeWords = targetWords - wordCount;
  } else {
    minimumChangeWords = wordCount - maximumWords;
    maximumChangeWords = wordCount - minimumWords;
    desiredChangeWords = wordCount - targetWords;
  }

  const totalSegments = draft.segments.length;
  const intermediateIndices: number[] = [];
  for (let i = 1; i < totalSegments - 1; i += 1) {
    intermediateIndices.push(i);
  }

  let candidates: number[];
  if (intermediateIndices.length > 0) {
    candidates = intermediateIndices;
  } else {
    candidates = draft.segments.map((_, i) => i);
  }

  let selected: number[];
  if (direction === 'compress') {
    selected = [...candidates]
      .sort((a, b) => {
        const diff = countWordsV8(draft.segments[b].text) - countWordsV8(draft.segments[a].text);
        if (diff !== 0) return diff;
        return a - b;
      })
      .slice(0, 2);
  } else {
    const usedCardIds = new Set<string>();
    for (const segment of draft.segments) {
      for (const cardId of segment.supportCardIds) {
        usedCardIds.add(cardId);
      }
    }

    selected = [...candidates]
      .sort((a, b) => {
        const unusedA = plan.beats[a].evidenceCardIds.filter((id) => !usedCardIds.has(id)).length;
        const unusedB = plan.beats[b].evidenceCardIds.filter((id) => !usedCardIds.has(id)).length;
        if (unusedB !== unusedA) return unusedB - unusedA;
        return a - b;
      })
      .slice(0, 2);
  }

  const editableSegmentIds = selected.map((i) => draft.segments[i].segmentId);
  const editableWindowWords = selected.reduce((sum, i) => sum + countWordsV8(draft.segments[i].text), 0);

  let minimumReplacementWords: number;
  let maximumReplacementWords: number;
  let desiredReplacementWords: number;

  if (direction === 'expand') {
    minimumReplacementWords = editableWindowWords + minimumChangeWords;
    maximumReplacementWords = editableWindowWords + maximumChangeWords;
    desiredReplacementWords = maximumReplacementWords;
  } else {
    minimumReplacementWords = editableWindowWords - maximumChangeWords;
    maximumReplacementWords = editableWindowWords - minimumChangeWords;
    desiredReplacementWords = minimumReplacementWords;
  }

  return {
    direction,
    wordCount,
    minimumWords,
    maximumWords,
    minimumChangeWords,
    maximumChangeWords,
    desiredChangeWords,
    editableSegmentIds,
    editableWindowWords,
    minimumReplacementWords,
    maximumReplacementWords,
    desiredReplacementWords,
  };
}

export function applyNarrativeLengthFitPatchV8(
  plan: NarrativeWriterPlanV8,
  draft: NarrativeStructuredWriterResultV8,
  fitPlan: NarrativeLengthFitPlanV8,
  patch: NarrativeLengthFitPatchV8
): NarrativeStructuredWriterResultV8 {
  const replacements = patch.replacements;
  if (replacements.length !== fitPlan.editableSegmentIds.length) {
    const suppliedIds = new Set(replacements.map((replacement) => replacement.segmentId));
    const missingIds = fitPlan.editableSegmentIds.filter((segmentId) => !suppliedIds.has(segmentId));
    throw new Error(
      `Patch must include every editable segment exactly once; missing: ${missingIds.join(', ') || 'none'}.`
    );
  }

  const seenSegmentIds = new Set<string>();
  for (const replacement of replacements) {
    if (seenSegmentIds.has(replacement.segmentId)) {
      throw new Error('Replacement segmentId must be unique.');
    }
    seenSegmentIds.add(replacement.segmentId);
    if (!fitPlan.editableSegmentIds.includes(replacement.segmentId)) {
      throw new Error('Replacement segmentId is outside the selected length-fit window.');
    }
  }

  const missingSegmentIds = fitPlan.editableSegmentIds.filter((segmentId) => !seenSegmentIds.has(segmentId));
  if (missingSegmentIds.length > 0) {
    throw new Error(`Every editable segment must be replaced exactly once; missing: ${missingSegmentIds.join(', ')}.`);
  }

  const replacementMap = new Map<string, { text: string; supportCardIds: string[] }>();
  for (const replacement of replacements) {
    replacementMap.set(replacement.segmentId, {
      text: replacement.text,
      supportCardIds: replacement.supportCardIds,
    });
  }

  const newSegments = draft.segments.map((segment) => {
    const replacement = replacementMap.get(segment.segmentId);
    const text = replacement ? replacement.text : segment.text;
    const supportCardIds = replacement ? replacement.supportCardIds : segment.supportCardIds;
    return {
      segmentId: segment.segmentId,
      beat: segment.beat,
      text,
      supportCardIds,
      estimatedWords: countWordsV8(text),
    };
  });

  const rawResponse = {
    stop_id: plan.routeStopId,
    segments: newSegments.map((segment) => ({
      segmentId: segment.segmentId,
      beat: segment.beat,
      text: segment.text,
      supportCardIds: segment.supportCardIds,
      estimatedWords: segment.estimatedWords,
    })),
  };

  return parseNarrativeWriterResponseV8(plan, rawResponse);
}

export function applyNarrativeLengthExpansionPatchV8(
  plan: NarrativeWriterPlanV8,
  draft: NarrativeStructuredWriterResultV8,
  patch: NarrativeLengthExpansionPatchV8
): NarrativeStructuredWriterResultV8 {
  const fitPlan = planNarrativeLengthFitV8(plan, draft);
  if (!fitPlan || fitPlan.direction !== 'expand') {
    throw new Error('Expansion patch requires an expand direction fit plan.');
  }

  const additions = patch.additions;
  if (additions.length < 1 || additions.length > 12) {
    throw new Error('Expansion patch must contain between 1 and 12 nonblank additions.');
  }

  const editableSet = new Set(fitPlan.editableSegmentIds);
  const beatCardMap = new Map<string, Set<string>>();
  for (const beat of plan.beats) {
    beatCardMap.set(beat.beat, new Set(beat.evidenceCardIds));
  }

  const segmentBeatMap = new Map<string, string>();
  for (const segment of draft.segments) {
    segmentBeatMap.set(segment.segmentId, segment.beat);
  }

  for (const addition of additions) {
    if (addition.text.trim().length === 0) {
      throw new Error('Expansion addition text must be nonblank.');
    }
    if (!editableSet.has(addition.segmentId)) {
      throw new Error(`Expansion addition segmentId ${addition.segmentId} is outside-window.`);
    }
    if (addition.supportCardIds.length === 0) {
      throw new Error('Expansion addition must have at least one supportCardId.');
    }
    const beat = segmentBeatMap.get(addition.segmentId)!;
    const authorized = beatCardMap.get(beat)!;
    for (const cardId of addition.supportCardIds) {
      if (!authorized.has(cardId)) {
        throw new Error(`Support card id ${cardId} is not authorized for beat ${beat}.`);
      }
    }
  }

  const n = additions.length;
  const totalMasks = 1 << n;
  const targetWords = plan.narrationTarget.targetWords;
  const baseWordCount = draft.wordCount;

  let bestMask = -1;
  let bestDistance = Infinity;
  let bestTargetDistance = Infinity;
  let bestUnitCount = Infinity;

  for (let mask = 1; mask < totalMasks; mask += 1) {
    let addedWords = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        addedWords += countWordsV8(additions[i].text);
      }
    }
    const total = baseWordCount + addedWords;
    const distance = distanceToRangeV8(total, fitPlan.minimumWords, fitPlan.maximumWords);
    const targetDistance = Math.abs(total - targetWords);
    const unitCount = mask.toString(2).replace(/0/g, '').length;

    if (
      distance < bestDistance ||
      (distance === bestDistance && targetDistance < bestTargetDistance) ||
      (distance === bestDistance && targetDistance === bestTargetDistance && unitCount < bestUnitCount) ||
      (distance === bestDistance && targetDistance === bestTargetDistance && unitCount === bestUnitCount && mask < bestMask)
    ) {
      bestDistance = distance;
      bestTargetDistance = targetDistance;
      bestUnitCount = unitCount;
      bestMask = mask;
    }
  }

  const selectedIndices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (bestMask & (1 << i)) {
      selectedIndices.push(i);
    }
  }

  const appendMap = new Map<string, { text: string; supportCardIds: string[] }[]>();
  for (const index of selectedIndices) {
    const addition = additions[index];
    const existing = appendMap.get(addition.segmentId) || [];
    existing.push({ text: addition.text, supportCardIds: addition.supportCardIds });
    appendMap.set(addition.segmentId, existing);
  }

  const newSegments = draft.segments.map((segment) => {
    const appends = appendMap.get(segment.segmentId);
    let text = segment.text;
    const mergedCardIds = new Set(segment.supportCardIds);
    if (appends) {
      for (const append of appends) {
        text = `${text} ${append.text}`;
        for (const cardId of append.supportCardIds) {
          mergedCardIds.add(cardId);
        }
      }
    }
    return {
      segmentId: segment.segmentId,
      beat: segment.beat,
      text,
      supportCardIds: Array.from(mergedCardIds),
      estimatedWords: countWordsV8(text),
    };
  });

  const rawResponse = {
    stop_id: plan.routeStopId,
    segments: newSegments.map((segment) => ({
      segmentId: segment.segmentId,
      beat: segment.beat,
      text: segment.text,
      supportCardIds: segment.supportCardIds,
      estimatedWords: segment.estimatedWords,
    })),
  };

  return parseNarrativeWriterResponseV8(plan, rawResponse);
}

export function chooseCloserNarrativeDraftV8(
  current: NarrativeStructuredWriterResultV8,
  candidate: NarrativeStructuredWriterResultV8,
  target: { targetWords: number }
): NarrativeStructuredWriterResultV8 {
  const { minimumWords, maximumWords } = narrationLengthBoundsV8(target.targetWords);
  const currentDistance = distanceToRangeV8(current.wordCount, minimumWords, maximumWords);
  const candidateDistance = distanceToRangeV8(candidate.wordCount, minimumWords, maximumWords);

  if (candidateDistance < currentDistance) {
    return candidate;
  }
  return current;
}
