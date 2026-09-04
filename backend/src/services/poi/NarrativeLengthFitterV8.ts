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
}

export interface NarrativeLengthFitPatchV8 {
  replacements: {
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

  return {
    direction,
    wordCount,
    minimumWords,
    maximumWords,
    minimumChangeWords,
    maximumChangeWords,
    desiredChangeWords,
    editableSegmentIds,
  };
}

export function applyNarrativeLengthFitPatchV8(
  plan: NarrativeWriterPlanV8,
  draft: NarrativeStructuredWriterResultV8,
  fitPlan: NarrativeLengthFitPlanV8,
  patch: NarrativeLengthFitPatchV8
): NarrativeStructuredWriterResultV8 {
  const replacements = patch.replacements;
  if (replacements.length < 1 || replacements.length > fitPlan.editableSegmentIds.length) {
    throw new Error('Replacement count must be between 1 and the number of editable segments.');
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
