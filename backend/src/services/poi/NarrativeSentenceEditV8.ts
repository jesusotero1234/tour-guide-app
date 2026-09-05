import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';
import { NarrativeStructuredWriterResultV8, NarrativeWriterPlanV8, parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';

export interface NarrativeSentenceEditTargetV8 {
  sentenceId: string;
  segmentId: string;
  text: string;
  start: number;
  end: number;
}

const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** Locate by ordered offsets, never by the first occurrence of a repeated sentence. */
export function resolveNarrativeSentenceTargetsV8(
  stopId: string, draft: NarrativeStructuredWriterResultV8, sentenceIds: string[]
): NarrativeSentenceEditTargetV8[] {
  const ids = new Set(sentenceIds);
  if (!ids.size || ids.size !== sentenceIds.length) throw new Error('sentence edit requires distinct nonempty targets');
  const script = assignNarrativeSentenceIdsV6(stopId, draft.text, { sentenceBoundaryPolicy: 'v8' });
  if (sentenceIds.some(id => !script.sentences.some(s => s.sentenceId === id))) throw new Error('unknown sentence edit target');
  let segmentOffset = 0;
  const segments = draft.segments.map(segment => {
    const text = normalize(segment.text);
    const span = { segmentId: segment.segmentId, start: segmentOffset, end: segmentOffset + text.length };
    segmentOffset = span.end + 1;
    return span;
  });
  if (draft.segments.map(s => normalize(s.text)).join(' ') !== draft.text) throw new Error('sentence edit draft/text mismatch');
  let cursor = 0;
  const targets: NarrativeSentenceEditTargetV8[] = [];
  for (const sentence of script.sentences) {
    const start = draft.text.indexOf(sentence.text, cursor);
    if (start < cursor || draft.text.slice(cursor, start).trim()) throw new Error('ambiguous sentence edit mapping');
    const end = start + sentence.text.length;
    cursor = end;
    if (!ids.has(sentence.sentenceId)) continue;
    const segment = segments.find(s => start >= s.start && end <= s.end);
    if (!segment) throw new Error('sentence edit target crosses segment boundaries');
    targets.push({ sentenceId: sentence.sentenceId, segmentId: segment.segmentId,
      text: sentence.text, start: start - segment.start, end: end - segment.start });
  }
  return targets;
}

/** Also guard adapters/mocks and persisted candidates, not only the model parser. */
export function assertNarrativeSentenceScopeV8(
  stopId: string, before: NarrativeStructuredWriterResultV8,
  candidate: NarrativeStructuredWriterResultV8, sentenceIds: string[]
): void {
  const targets = resolveNarrativeSentenceTargetsV8(stopId, before, sentenceIds);
  const editableSegments = new Set(targets.map(t => t.segmentId));
  if (candidate.segments.length !== before.segments.length) throw new Error('sentence edit changed segment count');
  before.segments.forEach((segment, index) => {
    const next = candidate.segments[index];
    if (next.segmentId !== segment.segmentId || next.beat !== segment.beat) throw new Error('sentence edit changed segment identity');
    if (!editableSegments.has(segment.segmentId) && JSON.stringify(next) !== JSON.stringify(segment)) {
      throw new Error('sentence edit changed protected segment');
    }
  });
  const oldScript = assignNarrativeSentenceIdsV6(stopId, before.text, { sentenceBoundaryPolicy: 'v8' });
  const nextScript = assignNarrativeSentenceIdsV6(stopId, candidate.text, { sentenceBoundaryPolicy: 'v8' });
  // ponytail: one complete sentence per replacement; structural rewrites remain human review.
  if (oldScript.sentences.length !== nextScript.sentences.length) throw new Error('sentence edit changed sentence count');
  const allowed = new Set(sentenceIds);
  oldScript.sentences.forEach((sentence, index) => {
    if (!allowed.has(sentence.sentenceId) && nextScript.sentences[index].text !== sentence.text) {
      throw new Error('sentence edit changed protected sentence');
    }
  });
  if (before.text === candidate.text) throw new Error('sentence edit made no text change');
}

export function applyNarrativeSentencePatchV8(
  plan: NarrativeWriterPlanV8, draft: NarrativeStructuredWriterResultV8,
  sentenceIds: string[], value: unknown
): NarrativeStructuredWriterResultV8 {
  const targets = resolveNarrativeSentenceTargetsV8(plan.routeStopId, draft, sentenceIds);
  const root = value as Record<string, unknown> | null;
  if (!root || typeof root !== 'object' || Array.isArray(root) || Object.keys(root).length !== 1
    || !Array.isArray(root.replacements) || !root.replacements.length || root.replacements.length > targets.length) {
    throw new Error('invalid sentence replacements');
  }
  const replacements = new Map<string, { text: string; supportCardIds: string[] }>();
  for (const raw of root.replacements) {
    const item = raw as Record<string, unknown> | null;
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 3
      || Object.keys(item).some(k => !['sentenceId', 'text', 'supportCardIds'].includes(k))
      || typeof item.sentenceId !== 'string' || replacements.has(item.sentenceId)
      || typeof item.text !== 'string' || !item.text.trim() || !Array.isArray(item.supportCardIds)
      || !item.supportCardIds.length) {
      throw new Error('malformed sentence replacement');
    }
    const target = targets.find(t => t.sentenceId === item.sentenceId);
    if (!target) throw new Error('sentence replacement outside allowed window');
    const segmentIndex = draft.segments.findIndex(s => s.segmentId === target.segmentId);
    if (item.supportCardIds.some(id => typeof id !== 'string' || !plan.beats[segmentIndex].evidenceCardIds.includes(id))) {
      throw new Error('sentence replacement has unauthorized support');
    }
    const text = normalize(item.text);
    if (assignNarrativeSentenceIdsV6(plan.routeStopId, text, { sentenceBoundaryPolicy: 'v8' }).sentences.length !== 1) {
      throw new Error('sentence replacement must contain one complete sentence');
    }
    replacements.set(item.sentenceId, { text, supportCardIds: item.supportCardIds as string[] });
  }
  const segments = draft.segments.map(segment => {
    const edits = targets.filter(t => t.segmentId === segment.segmentId && replacements.has(t.sentenceId)).sort((a, b) => b.start - a.start);
    if (!edits.length) return segment;
    let text = normalize(segment.text);
    // Retain citations for untouched sentences; IDs are traceability, not proof of semantic coverage.
    const support = new Set(segment.supportCardIds);
    for (const target of edits) {
      const replacement = replacements.get(target.sentenceId)!;
      if (text.slice(target.start, target.end) !== target.text) throw new Error('stale sentence replacement');
      text = text.slice(0, target.start) + replacement.text + text.slice(target.end);
      replacement.supportCardIds.forEach(id => support.add(id));
    }
    return { ...segment, text, supportCardIds: [...support], estimatedWords: text.split(/\s+/u).length };
  });
  const result = parseNarrativeWriterResponseV8(plan, { stop_id: plan.routeStopId, segments });
  assertNarrativeSentenceScopeV8(plan.routeStopId, draft, result, sentenceIds);
  return result;
}
