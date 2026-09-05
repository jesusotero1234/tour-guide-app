import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';
import { buildNarrativeWriterPlanV8, parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';
import { narrationTargetForSecondsV8 } from './NarrativeDurationTargetsV8';
import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';
import { applyNarrativeSentencePatchV8, resolveNarrativeSentenceTargetsV8, assertNarrativeSentenceScopeV8 } from './NarrativeSentenceEditV8';

function fixture() {
  const source = buildNarrativeEvidenceFixtureV8({ routeStopId: 'stop', entityQid: 'Q123',
    includedRoles: ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function'],
    sources: [{ sourceId: 'source', publisherKey: 'official.example', authorityTier: 'primary_authority' }] });
  const plan = buildNarrativeWriterPlanV8({ routeStopId: 'stop', dossier: source.dossier,
    narrationTarget: narrationTargetForSecondsV8('stop', 120), stopIndex: 0 });
  const draft = parseNarrativeWriterResponseV8(plan, { stop_id: 'stop', segments: plan.beats.map((beat, i) => ({
    segmentId: 'segment-' + i, beat: beat.beat,
    text: 'Primera frase del segmento. Frase cuestionada. Contexto que conservamos.',
    supportCardIds: beat.evidenceCardIds, estimatedWords: 999,
  })) });
  const script = assignNarrativeSentenceIdsV6('stop', draft.text, { sentenceBoundaryPolicy: 'v8' });
  const target = script.sentences[1].sentenceId;
  const replacement = { sentenceId: target, text: 'La frase ya está corregida.', supportCardIds: draft.segments[0].supportCardIds };
  return { plan, draft, script, target, replacement };
}

describe('sentence-local edit invariants', () => {
  it('preserves both valid neighbours inside the edited segment and all other segments', () => {
    const { plan, draft, target, replacement } = fixture();
    const result = applyNarrativeSentencePatchV8(plan, draft, [target], { replacements: [replacement] });
    expect(result.segments[0].text).toBe('Primera frase del segmento. La frase ya está corregida. Contexto que conservamos.');
    expect(result.segments.slice(1)).toEqual(draft.segments.slice(1));
    expect(result.wordCount).toBe(result.text.split(/\s+/u).length);
    expect(result.segments[0].estimatedWords).toBe(result.segments[0].text.split(/\s+/u).length);
  });
  it('normalizes repeated valid support IDs without accepting unknown IDs', () => {
    const { plan, draft, target, replacement } = fixture();
    const repeated = { ...replacement, supportCardIds: [...replacement.supportCardIds, ...replacement.supportCardIds] };
    const result = applyNarrativeSentencePatchV8(plan, draft, [target], { replacements: [repeated] });
    expect(result.segments[0].supportCardIds).toEqual([...new Set(draft.segments[0].supportCardIds)]);
    expect(() => applyNarrativeSentencePatchV8(plan, draft, [target], {
      replacements: [{ ...replacement, supportCardIds: ['foreign', 'foreign'] }],
    })).toThrow();
  });
  it('selects the second occurrence of identical text by position, not substring', () => {
    const { plan, draft, script, replacement } = fixture();
    const second = script.sentences[4].sentenceId;
    const targets = resolveNarrativeSentenceTargetsV8('stop', draft, [second]);
    expect(targets[0].segmentId).toBe(draft.segments[1].segmentId);
    const result = applyNarrativeSentencePatchV8(plan, draft, [second], {
      replacements: [{ ...replacement, sentenceId: second, supportCardIds: draft.segments[1].supportCardIds }],
    });
    expect(result.segments[0]).toEqual(draft.segments[0]);
    expect(result.segments[1].text).toContain(replacement.text);
  });
  it('applies multiple replacements from the end without offset drift', () => {
    const { plan, draft, script, replacement, target } = fixture();
    const other = script.sentences[0].sentenceId;
    const result = applyNarrativeSentencePatchV8(plan, draft, [other, target], {
      replacements: [{ ...replacement, sentenceId: other, text: 'Inicio más breve.' }, replacement],
    });
    expect(result.segments[0].text).toBe('Inicio más breve. La frase ya está corregida. Contexto que conservamos.');
  });
  it.each(['empty-targets', 'duplicate-targets', 'unknown-target', 'outside', 'duplicate', 'empty-text', 'extra', 'foreign-card', 'wrong-beat', 'many-sentences', 'unchanged'])('rejects %s', mode => {
    const { plan, draft, target, replacement, script } = fixture();
    let targets = [target];
    let replacements: unknown[] = [replacement];
    if (mode === 'empty-targets') targets = [];
    if (mode === 'duplicate-targets') targets = [target, target];
    if (mode === 'unknown-target') targets = ['unknown'];
    if (mode === 'outside') replacement.sentenceId = script.sentences[0].sentenceId;
    if (mode === 'duplicate') replacements.push(replacement);
    if (mode === 'empty-text') replacement.text = ' ';
    if (mode === 'extra') replacements = [{ ...replacement, segmentId: 'segment-0' }];
    if (mode === 'foreign-card') replacement.supportCardIds = ['foreign'];
    if (mode === 'wrong-beat') replacement.supportCardIds = draft.segments[1].supportCardIds;
    if (mode === 'many-sentences') replacement.text = 'Una frase. Otra frase.';
    if (mode === 'unchanged') replacement.text = script.sentences[1].text;
    expect(() => applyNarrativeSentencePatchV8(plan, draft, targets, { replacements })).toThrow();
  });
  it('leaves a sentence crossing segment boundaries unresolved', () => {
    const { plan, draft } = fixture();
    const spanning = parseNarrativeWriterResponseV8(plan, { stop_id: 'stop', segments: draft.segments.map((s, i) =>
      ({ ...s, text: i === 0 ? 'Una frase sin terminar' : i === 1 ? 'que continúa aquí.' : s.text })) });
    const id = assignNarrativeSentenceIdsV6('stop', spanning.text, { sentenceBoundaryPolicy: 'v8' }).sentences[0].sentenceId;
    expect(() => resolveNarrativeSentenceTargetsV8('stop', spanning, [id])).toThrow('crosses segment');
  });
  it.each([0, 1])('guards adapter candidates that change protected text in segment %s', segmentIndex => {
    const { plan, draft, target } = fixture();
    const candidate = parseNarrativeWriterResponseV8(plan, { stop_id: 'stop', segments: draft.segments.map((s, i) =>
      ({ ...s, text: i === segmentIndex ? s.text.replace('Contexto que conservamos.', 'Contexto destruido.') : s.text })) });
    expect(() => assertNarrativeSentenceScopeV8('stop', draft, candidate, [target])).toThrow('protected');
  });
});
