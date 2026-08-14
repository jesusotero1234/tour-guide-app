import { NarrativeCapturedSourceV7 } from './NarrativeSourcesV7';
import {
  assessNarrativeStopSuffiencyV7,
  segmentCaptureIntoSpansV7,
  verifySpanSelectionV7,
} from './NarrativeSpansV7';

function capture(content: string): NarrativeCapturedSourceV7 {
  return {
    sourceId: 'source-abc',
    requestedUrl: 'https://www.barcelona.cat/sagrada',
    finalUrl: 'https://www.barcelona.cat/sagrada',
    title: 'Sagrada Família',
    capturedAt: '2026-08-01T10:00:00Z',
    content,
    fingerprint: 'f',
    authority: { tier: 'primary_authority', publisherKey: 'barcelona.cat', rule: 'official_registry' },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
  };
}

describe('segmentCaptureIntoSpansV7', () => {
  it('produces stable spans with evidenceSpanId per paragraph', () => {
    const spanned = segmentCaptureIntoSpansV7(capture(
      'Primer párrafo sobre el templo.\n\nSegundo párrafo con historia.'
    ));

    expect(spanned.spans).toHaveLength(2);
    expect(spanned.spans[0].evidenceSpanId).toBe('source-abc:span:0001');
    expect(spanned.spans[0].text).toContain('Primer párrafo');
    expect(spanned.spans[1].evidenceSpanId).toBe('source-abc:span:0002');
    expect(spanned.spans[1].text).toContain('Segundo párrafo');
  });

  it('splits long paragraphs at sentence boundaries', () => {
    const longBlock = Array.from({ length: 40 }, (_, index) => (
      `Frase larga número ${index + 1} sobre la historia del monumento y su construcción.`
    )).join(' ');
    const spanned = segmentCaptureIntoSpansV7(capture(longBlock));

    expect(spanned.spans.length).toBeGreaterThan(1);
    expect(spanned.spans.every((span) => span.text.length <= 700)).toBe(true);
    expect(new Set(spanned.spans.map((span) => span.evidenceSpanId)).size)
      .toBe(spanned.spans.length);
  });

  it('chunks a sentence longer than 700 characters without losing content', () => {
    const content = capture('p'.repeat(1500));
    const spanned = segmentCaptureIntoSpansV7(content);

    expect(spanned.spans.length).toBeGreaterThanOrEqual(3);
    expect(spanned.spans.every((span) => span.text.length <= 700)).toBe(true);
    expect(spanned.spans.map((span) => span.text).join('')).toBe(content.content);
    for (const span of spanned.spans) {
      expect(span.text).toBe(content.content.slice(span.start, span.end));
    }
  });

  it('prefers the last space before the 700-character boundary when chunking', () => {
    const content = capture(`${'palabra '.repeat(140)}x`);
    const spanned = segmentCaptureIntoSpansV7(content);

    expect(spanned.spans.length).toBeGreaterThan(1);
    for (const span of spanned.spans) {
      expect(span.text.length).toBeLessThanOrEqual(700);
      expect(span.text).toBe(content.content.slice(span.start, span.end));
    }
  });
});

describe('verifySpanSelectionV7', () => {
  const content = 'Párrafo A sobre identidad.\n\nPárrafo B sobre arquitectura.\n\nPárrafo C sobre función.';
  const spanned = segmentCaptureIntoSpansV7(capture(content));
  const ids = spanned.spans.map((span) => span.evidenceSpanId);

  it('accepts one valid span and reconstructs its quote', () => {
    const result = verifySpanSelectionV7({
      spanned,
      selection: { evidenceSpanIds: [ids[0]] },
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.quote).toEqual({
      sourceId: 'source-abc',
      evidenceSpanIds: [ids[0]],
      quote: 'Párrafo A sobre identidad.',
    });
  });

  it('accepts two or three contiguous spans', () => {
    const result = verifySpanSelectionV7({
      spanned,
      selection: { evidenceSpanIds: [ids[0], ids[1], ids[2]] },
    });

    expect(result.valid).toBe(true);
    expect(result.quote?.quote).toContain('Párrafo A');
    expect(result.quote?.quote).toContain('Párrafo C');
  });

  it('rejects an empty selection', () => {
    const result = verifySpanSelectionV7({
      spanned,
      selection: { evidenceSpanIds: [] },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('empty');
    expect(result.quote).toBeNull();
  });

  it('rejects more than three spans', () => {
    const more = segmentCaptureIntoSpansV7(capture(
      Array.from({ length: 5 }, (_, index) => `Párrafo ${index + 1}.\n\n`).join('')
    ));
    const result = verifySpanSelectionV7({
      spanned: more,
      selection: { evidenceSpanIds: more.spans.map((span) => span.evidenceSpanId) },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('count_out_of_range');
  });

  it('rejects spans from another source', () => {
    const other = segmentCaptureIntoSpansV7({
      ...capture('Contenido de otra fuente.'),
      sourceId: 'source-other',
    });
    const result = verifySpanSelectionV7({
      spanned,
      selection: { evidenceSpanIds: [other.spans[0].evidenceSpanId] },
    });

    expect(result.valid).toBe(false);
    expect(result.quote).toBeNull();
  });

  it('rejects duplicate span ids as duplicate_span', () => {
    const spanned = segmentCaptureIntoSpansV7(capture('Párrafo A.\n\nPárrafo B.'));
    const id = spanned.spans[0].evidenceSpanId;
    const result = verifySpanSelectionV7({
      spanned,
      selection: { evidenceSpanIds: [id, id] },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('duplicate_span');
  });

  it('rejects non-contiguous spans', () => {
    const four = segmentCaptureIntoSpansV7(capture(
      Array.from({ length: 4 }, (_, index) => `Párrafo ${index + 1}.\n\n`).join('')
    ));
    const fourIds = four.spans.map((span) => span.evidenceSpanId);
    const result = verifySpanSelectionV7({
      spanned: four,
      selection: { evidenceSpanIds: [fourIds[0], fourIds[2]] },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_contiguous');
  });

  it('rejects spans that only look adjacent after dropping a repeated paragraph', () => {
    const spanned = segmentCaptureIntoSpansV7(capture(
      'Párrafo A.\n\nPárrafo B.\n\nPárrafo B.\n\nPárrafo C.'
    ));
    const result = verifySpanSelectionV7({
      spanned,
      selection: {
        evidenceSpanIds: [spanned.spans[1].evidenceSpanId, spanned.spans[3].evidenceSpanId],
      },
    });

    expect(spanned.spans).toHaveLength(4);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_contiguous');
  });

  it('reconstructs the exact source substring as the quote', () => {
    const spanned = segmentCaptureIntoSpansV7(capture(
      'Párrafo B.\n\nPárrafo B.'
    ));
    const result = verifySpanSelectionV7({
      spanned,
      selection: {
        evidenceSpanIds: spanned.spans.map((span) => span.evidenceSpanId),
      },
    });

    expect(result.valid).toBe(true);
    expect(result.quote?.quote).toBe('Párrafo B.\n\nPárrafo B.');
  });
});

describe('assessNarrativeStopSuffiencyV7', () => {
  it('declares a stop sufficient with identity, observable detail, historical contribution and one of function/conflict/trait', () => {
    const result = assessNarrativeStopSuffiencyV7([
      'identity_confirmed',
      'observable_detail',
      'historical_contribution',
      'function_or_conflict_or_trait',
    ]);

    expect(result.isSufficient).toBe(true);
    expect(result.missingRoles).toEqual([]);
  });

  it('flags missing minimum roles', () => {
    const result = assessNarrativeStopSuffiencyV7(['identity_confirmed']);

    expect(result.isSufficient).toBe(false);
    expect(result.missingRoles).toContain('observable_detail');
    expect(result.missingRoles).toContain('historical_contribution');
    expect(result.missingRoles).toContain('function_or_conflict_or_trait');
  });
});
