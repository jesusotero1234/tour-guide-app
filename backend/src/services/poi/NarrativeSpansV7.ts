import { NarrativeCapturedSourceV7 } from './NarrativeSourcesV7';

export interface NarrativeEvidenceSpanV7 {
  evidenceSpanId: string;
  sourceId: string;
  text: string;
  start: number;
  end: number;
}

export interface NarrativeSpannedCaptureV7 {
  sourceId: string;
  content: string;
  spans: NarrativeEvidenceSpanV7[];
}

export interface NarrativeSpanSelectionV7 {
  evidenceSpanIds: string[];
}

export interface NarrativeReconstructedQuoteV7 {
  sourceId: string;
  evidenceSpanIds: string[];
  quote: string;
}

export const NARRATIVE_SPAN_MAX_LENGTH_V7 = 700;
export const NARRATIVE_SPAN_MIN_SELECTION_V7 = 1;
export const NARRATIVE_SPAN_MAX_SELECTION_V7 = 3;

function chunkLongSpanTextV8(text: string, maxLength: number): Array<{ start: number; end: number }> {
  const pieces: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (text.length - cursor > maxLength) {
    const window = text.slice(cursor, cursor + maxLength);
    const spaceAt = window.lastIndexOf(' ');
    const cut = spaceAt > 0 ? spaceAt + 1 : maxLength;
    pieces.push({ start: cursor, end: cursor + cut });
    cursor += cut;
  }
  if (cursor < text.length) pieces.push({ start: cursor, end: text.length });
  return pieces;
}

export function segmentCaptureIntoSpansV7(
  capture: NarrativeCapturedSourceV7
): NarrativeSpannedCaptureV7 {
  const spans: NarrativeEvidenceSpanV7[] = [];
  const content = capture.content.trim();
  if (!content) return { sourceId: capture.sourceId, content: capture.content, spans };

  const blocks = content.split(/\n\s*\n+/u)
    .map((block) => block.trim())
    .filter(Boolean);
  let offset = 0;
  let index = 0;
  for (const block of blocks) {
    const inContent = capture.content.indexOf(block, offset);
    const blockStart = inContent >= 0 ? inContent : offset;
    if (block.length > NARRATIVE_SPAN_MAX_LENGTH_V7) {
      const sentences = block.split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      let sentenceOffset = blockStart;
      for (const sentence of sentences) {
        const inSentence = capture.content.indexOf(sentence, sentenceOffset);
        const sentenceStart = inSentence >= 0 ? inSentence : sentenceOffset;
        const pieces = sentence.length > NARRATIVE_SPAN_MAX_LENGTH_V7
          ? chunkLongSpanTextV8(sentence, NARRATIVE_SPAN_MAX_LENGTH_V7)
          : [{ start: 0, end: sentence.length }];
        for (const piece of pieces) {
          spans.push({
            evidenceSpanId: `${capture.sourceId}:span:${String(index + 1).padStart(4, '0')}`,
            sourceId: capture.sourceId,
            text: sentence.slice(piece.start, piece.end),
            start: sentenceStart + piece.start,
            end: sentenceStart + piece.end,
          });
          index += 1;
        }
        sentenceOffset = sentenceStart + sentence.length;
      }
    } else {
      spans.push({
        evidenceSpanId: `${capture.sourceId}:span:${String(index + 1).padStart(4, '0')}`,
        sourceId: capture.sourceId,
        text: block,
        start: blockStart,
        end: blockStart + block.length,
      });
      index += 1;
    }
    offset = blockStart + block.length;
  }

  return { sourceId: capture.sourceId, content: capture.content, spans };
}

function spansById(
  spanned: NarrativeSpannedCaptureV7
): Map<string, NarrativeEvidenceSpanV7> {
  return new Map(spanned.spans.map((span) => [span.evidenceSpanId, span]));
}

export function verifySpanSelectionV7(input: {
  spanned: NarrativeSpannedCaptureV7;
  selection: NarrativeSpanSelectionV7;
}): {
  valid: boolean;
  reason: 'ok' | 'empty' | 'count_out_of_range' | 'unknown_span'
    | 'not_contiguous' | 'other_source' | 'duplicate_span';
  quote: NarrativeReconstructedQuoteV7 | null;
} {
  const rawIds = input.selection.evidenceSpanIds;
  if (rawIds.length === 0) {
    return { valid: false, reason: 'empty', quote: null };
  }
  if (new Set(rawIds).size !== rawIds.length) {
    return { valid: false, reason: 'duplicate_span', quote: null };
  }
  const ids = [...rawIds];
  if (ids.length < NARRATIVE_SPAN_MIN_SELECTION_V7
    || ids.length > NARRATIVE_SPAN_MAX_SELECTION_V7) {
    return { valid: false, reason: 'count_out_of_range', quote: null };
  }
  const byId = spansById(input.spanned);
  for (const id of ids) {
    if (!byId.has(id)) return { valid: false, reason: 'unknown_span', quote: null };
    const span = byId.get(id) as NarrativeEvidenceSpanV7;
    if (span.sourceId !== input.spanned.sourceId) {
      return { valid: false, reason: 'other_source', quote: null };
    }
  }
  const selected = ids.map((id) => byId.get(id) as NarrativeEvidenceSpanV7)
    .sort((left, right) => left.start - right.start);
  const expectedSequence = input.spanned.spans
    .map((span) => span.evidenceSpanId);
  const firstIndex = expectedSequence.indexOf(selected[0].evidenceSpanId);
  if (firstIndex < 0) {
    return { valid: false, reason: 'not_contiguous', quote: null };
  }
  const contiguous = selected.every((span, offset) => (
    expectedSequence[firstIndex + offset] === span.evidenceSpanId
  ));
  if (!contiguous) {
    return { valid: false, reason: 'not_contiguous', quote: null };
  }
  const quote = input.spanned.content.slice(
    selected[0].start,
    selected[selected.length - 1].end
  );
  return {
    valid: true,
    reason: 'ok',
    quote: { sourceId: input.spanned.sourceId, evidenceSpanIds: ids, quote },
  };
}

export type NarrativeStopSufficiencyRoleV7 =
  | 'identity_confirmed'
  | 'observable_detail'
  | 'historical_contribution'
  | 'function_or_conflict_or_trait';

export interface NarrativeStopSuffiencyV7 {
  isSufficient: boolean;
  missingRoles: NarrativeStopSufficiencyRoleV7[];
}

export function assessNarrativeStopSuffiencyV7(
  coveredRoles: NarrativeStopSufficiencyRoleV7[]
): NarrativeStopSuffiencyV7 {
  const required: NarrativeStopSufficiencyRoleV7[] = [
    'identity_confirmed',
    'observable_detail',
    'historical_contribution',
  ];
  const covered = new Set(coveredRoles);
  const missing = required.filter((role) => !covered.has(role));
  const hasEither = covered.has('function_or_conflict_or_trait');
  if (!hasEither) missing.push('function_or_conflict_or_trait');
  return {
    isSufficient: missing.length === 0,
    missingRoles: [...new Set(missing)],
  };
}
