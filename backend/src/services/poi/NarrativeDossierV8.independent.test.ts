import { buildValidatedDossierV8, NarrativeDossierInputV8, NarrativeCuratorPropositionV8 } from './NarrativeDossierV8';
import { NarrativeCapturedSourceV8 } from './NarrativeSourcesV7';
import { segmentCaptureIntoSpansV7 } from './NarrativeSpansV7';

function source(id: string, content: string): NarrativeCapturedSourceV8 {
  return { sourceId: id, content, requestedUrl: 'https://' + id + '.example',
    finalUrl: 'https://' + id + '.example', title: id, capturedAt: '2026-09-05T00:00:00Z',
    fingerprint: id, authority: { tier: 'primary_authority', publisherKey: id + '.example', rule: 'fixture' },
    containsInstructionLikeText: false, finalHttpStatus: 200, sourceKind: 'official_web',
    entityQid: null, publisherKey: id + '.example' };
}
function fixture(): NarrativeDossierInputV8 {
  const captures = [source('a', 'La torre se reformó en 1782.'), source('b', 'El taller de Luis se abrió en 1900.')];
  const spansBySource = new Map(captures.map(c => [c.sourceId, segmentCaptureIntoSpansV7(c).spans]));
  const proposition = (id: string, text: string): NarrativeCuratorPropositionV8 => ({
    text, role: 'chronology_or_transformation', certainty: 'high', interpretation: 'direct',
    supports: [{ sourceId: id, evidenceSpanIds: [spansBySource.get(id)![0].evidenceSpanId] }],
  });
  return { stopId: 'Q1', stopName: 'Torre', qid: 'Q1', language: 'es', captures, spansBySource,
    admissionMode: 'independent', curatorOutput: {
      propositions: [proposition('a', captures[0].content), proposition('b', 'El taller de Pedro se abrió en 1900.')],
      authorizedNames: ['Luis', 'Pedro'], authorizedNumbers: ['1782', '1900'], discrepancies: [], limits: [],
    } };
}
describe('independent proposition admission', () => {
  it('preserves strict default and quarantines only the failing proposition when explicitly requested', () => {
    const input = fixture();
    expect(buildValidatedDossierV8({ ...input, admissionMode: undefined }).status).toBe('curator_contract_failed');
    const result = buildValidatedDossierV8(input);
    expect(result.status).toBe('ok');
    expect(result.admission).toEqual({ inputCount: 2, acceptedCount: 1,
      rejectedPropositions: [{ index: 1, text: input.curatorOutput.propositions[1].text, reason: 'citation closure missing name pedro' }],
      removedAuthorizedNames: ['Luis', 'Pedro'], removedAuthorizedNumbers: ['1900'] });
    if (result.status !== 'ok') throw new Error('expected dossier');
    expect(result.value.dossier.propositions).toHaveLength(1);
    expect(result.value.dossier.sources.map(s => s.sourceId)).toEqual(['a']);
    expect(result.value.dossier.passages.map(p => p.quote)).toEqual([input.captures[0].content]);
    expect(result.value.passageQuotes).toEqual([input.captures[0].content]);
    expect(result.value.dossier.authorizedNames).toEqual([]);
    expect(result.value.dossier.authorizedNumbers).toEqual(['1782']);
    expect(result.value.dossier.sufficiency.independentPublisherCount).toBe(1);
  });

  it('preserves a previously accepted shared passage on rollback and recomputes missing roles', () => {
    const input = fixture();
    input.curatorOutput.propositions[1] = { ...input.curatorOutput.propositions[0],
      text: 'La torre de Pedro tiene dos ventanas.', role: 'visible_observation' };
    const result = buildValidatedDossierV8(input);
    if (result.status !== 'ok') throw new Error('expected retained dossier');
    expect(result.value.dossier.passages).toHaveLength(1);
    expect(result.value.gates.minimumEvidenceReady).toBe(false);
    expect(result.value.gates.writerReady).toBe(false);
    expect(result.value.gates.missingMinimumRoles).toContain('visible_observation');
  });

  it('fails with a report when every proposition is rejected', () => {
    const input = fixture();
    input.curatorOutput.propositions.shift();
    const result = buildValidatedDossierV8(input);
    expect(result.status).toBe('curator_contract_failed');
    expect(result.admission).toMatchObject({ acceptedCount: 0, rejectedPropositions: [{ index: 0 }] });
  });

  it.each(['unknown source', 'unknown span', 'cross source', 'discovery', 'historical observation', 'one publisher', 'number'])(
    'does not weaken the %s boundary', kind => {
      const input = fixture();
      const bad = input.curatorOutput.propositions[1];
      bad.text = input.captures[1].content;
      if (kind === 'unknown source') bad.supports[0].sourceId = 'unknown';
      if (kind === 'unknown span') bad.supports[0].evidenceSpanIds = ['unknown'];
      if (kind === 'cross source') input.spansBySource.get('b')![0].sourceId = 'a';
      if (kind === 'discovery') input.captures[1].authority.tier = 'discovery_only';
      if (kind === 'historical observation') { input.captures[1].sourceKind = 'historical_corpus'; bad.role = 'visible_observation'; }
      if (kind === 'one publisher') bad.interpretation = 'debatable';
      if (kind === 'number') { bad.text = 'El taller de Luis se abrió en 1901.'; input.curatorOutput.authorizedNumbers.push('1901'); }
      const result = buildValidatedDossierV8(input);
      expect(result.status).toBe('ok');
      expect(result.admission).toMatchObject({ acceptedCount: 1, rejectedPropositions: [{ index: 1 }] });
      if (result.status === 'ok') expect(result.value.dossier.sources.map(s => s.sourceId)).toEqual(['a']);
    });

  it('keeps global overlimits fatal', () => {
    const input = fixture();
    input.curatorOutput.authorizedNames = Array.from({ length: 41 }, (_, i) => 'Nombre' + i);
    expect(buildValidatedDossierV8(input)).toMatchObject({ status: 'curator_contract_failed', reason: 'too many authorized names' });
  });

  it('does not mutate curator output, captures or spans', () => {
    const input = fixture();
    const before = JSON.stringify({ input, spans: [...input.spansBySource] });
    buildValidatedDossierV8(input);
    expect(JSON.stringify({ input, spans: [...input.spansBySource] })).toBe(before);
  });

  it('does not turn unexpected malformed input exceptions into successful admission', () => {
    const input = fixture();
    input.curatorOutput.propositions[1].text = null as unknown as string;
    expect(() => buildValidatedDossierV8(input)).toThrow();
  });
});
