import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';
import { buildNarrativeWriterPlanV8, parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';
import { narrationTargetForSecondsV8 } from './NarrativeDurationTargetsV8';
import { applyNarrativeSegmentEditV8, buildNarrativeSegmentEditSchemaV8 } from './NarrativeSegmentEditV8';

function fixture() {
  const source = buildNarrativeEvidenceFixtureV8({ routeStopId: 'stop', entityQid: 'Q123',
    includedRoles: ['visible_observation', 'chronology_or_transformation', 'human_agency_or_lived_function'],
    sources: [{ sourceId: 'source', publisherKey: 'official.example', authorityTier: 'primary_authority' }] });
  const plan = buildNarrativeWriterPlanV8({ routeStopId: 'stop', dossier: source.dossier,
    narrationTarget: narrationTargetForSecondsV8('stop', 120), stopIndex: 0 });
  const draft = parseNarrativeWriterResponseV8(plan, { stop_id: 'stop', segments: plan.beats.map((beat, i) => ({
    segmentId: 'segment-' + i, beat: beat.beat, text: 'Primera frase del segmento. Segunda frase del segmento.',
    supportCardIds: beat.evidenceCardIds, estimatedWords: 999,
  })) });
  const first = draft.segments[0];
  return { plan, draft, first, replacement: { segmentId: first.segmentId,
    text: 'Las dos frases quedan fusionadas.', supportCardIds: first.supportCardIds } };
}
describe('bounded segment edit V8', () => {
  it('can fuse sentences without changing untouched segments or trusting model counts', () => {
    const { plan, draft, first, replacement } = fixture();
    const edited = applyNarrativeSegmentEditV8(plan, draft, [first.segmentId], { replacements: [replacement] });
    expect(edited.segments.slice(1)).toEqual(draft.segments.slice(1));
    expect(edited.segments[0].estimatedWords).toBe(5);
    expect(edited.wordCount).toBe(edited.text.split(/\s+/u).length);
    expect(edited.coverage).toBe(1);
  });
  it.each(['outside', 'duplicate', 'empty', 'foreign-card', 'wrong-beat', 'unchanged'])('rejects %s replacement', mode => {
    const { plan, draft, first, replacement } = fixture();
    if (mode === 'outside') replacement.segmentId = draft.segments[1].segmentId;
    if (mode === 'empty') replacement.text = ' ';
    if (mode === 'foreign-card') replacement.supportCardIds = ['invented'];
    if (mode === 'wrong-beat') replacement.supportCardIds = draft.segments[1].supportCardIds;
    if (mode === 'unchanged') replacement.text = first.text;
    const replacements = mode === 'duplicate' ? [replacement, replacement] : [replacement];
    expect(() => applyNarrativeSegmentEditV8(plan, draft, [first.segmentId], { replacements })).toThrow();
  });
  it('accepts a valid three-known-segment edit', () => {
    const { plan, draft } = fixture();
    const ids = draft.segments.slice(0, 3).map(s => s.segmentId);
    const replacements = ids.map(id => ({ segmentId: id, text: 'Texto editado.', supportCardIds: draft.segments.find(s => s.segmentId === id)!.supportCardIds }));
    const edited = applyNarrativeSegmentEditV8(plan, draft, ids, { replacements });
    expect(edited.segments.slice(0, 3).every((s, i) => s.text === 'Texto editado.')).toBe(true);
    expect(edited.segments.slice(3)).toEqual(draft.segments.slice(3));
  });
  it('rejects duplicate, unknown and empty windows', () => {
    const { plan, draft } = fixture();
    for (const ids of [[draft.segments[0].segmentId, draft.segments[0].segmentId], ['unknown'], []]) {
      expect(() => applyNarrativeSegmentEditV8(plan, draft, ids, { replacements: [] })).toThrow();
    }
  });
  it('schema branches disallow wrong-beat cards', () => {
    const { plan, draft } = fixture();
    const ids = [draft.segments[0].segmentId, draft.segments[1].segmentId];
    const schema = buildNarrativeSegmentEditSchemaV8(plan, draft, ids) as any;
    const branches = schema.properties.replacements.items.anyOf;
    expect(branches[0].properties.supportCardIds.items.enum).toEqual(draft.segments[0].supportCardIds);
    expect(branches[1].properties.supportCardIds.items.enum).toEqual(draft.segments[1].supportCardIds);
    expect(branches[0].properties.segmentId.enum).toEqual([draft.segments[0].segmentId]);
    expect(branches[1].properties.segmentId.enum).toEqual([draft.segments[1].segmentId]);
  });
});
