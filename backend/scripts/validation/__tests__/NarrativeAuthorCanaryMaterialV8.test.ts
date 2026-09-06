import { prepareAuthorCanaryMaterialV8, appendAuthorStyleHistoryV8 } from '../narrative-author-canary-material-v8';

const template = '# Ejemplo\n\nEscribe una historia fiel e inmersiva.\n\n## Caso y objetivo de esta respuesta\nCASO_ANTIGUO_NO_IMPORTAR';
const reference = '# Voz\n\n## Guion para narrar\nREFERENCIA_SOLO_ESTILO\n## Notas de revisión\nNotas';
const fixture = (): any => ({
  route: { city: 'Villa del Río', country: 'País de prueba', language: 'es', durationMinutes: 60,
    stops: [
      { stopId: 'A', name: 'Puente', position: 0, previousStopId: null, nextStopId: 'B' },
      { stopId: 'B', name: 'Torre', position: 1, previousStopId: 'A', nextStopId: null }
    ] },
  narrationTargets: [{ stopId: 'A', targetWords: 600, targetSeconds: 300 }, { stopId: 'B', targetWords: 562, targetSeconds: 281 }],
  research: ['A', 'B'].map(id => ({ routeStopId: id, result: { dossier: {
    stopId: id, language: 'es', sources: [{ sourceId: 'source-' + id, title: id, finalUrl: 'https://example.org/' + id }],
    passages: [{ passageId: 'passage-' + id, sourceId: 'source-' + id, quote: 'EVIDENCIA_' + id + ' original.  Dos espacios.' }],
    propositions: [], discrepancies: [], limits: []
  } } })),
  arc: { stops: ['A', 'B'].map(stopId => ({ stopId, bridgePropositionIds: [] })) }, evidenceManifest: {}
});
const prepare = (c = fixture()) => prepareAuthorCanaryMaterialV8(c, template, reference, 'A');

describe('author canary material, offline and city independent', () => {
  test('preserves order, original targets, quotations, source isolation and checkpoint', () => {
    const c = fixture(), before = JSON.stringify(c), m = prepare(c);
    expect(m.map(s => s.stopId)).toEqual(['A', 'B']);
    expect(m.map(s => s.targetWords)).toEqual([600, 562]);
    expect(m[0].authorPrompt).toContain('EVIDENCIA_A original.  Dos espacios.');
    expect(m[0].authorPrompt).not.toContain('EVIDENCIA_B');
    expect(m[1].authorPrompt).not.toContain('EVIDENCIA_A');
    expect(m[0].frozen.inputs[0].preparedRequest.input.passages).toEqual(c.research[0].result.dossier.passages);
    expect(JSON.stringify(c)).toBe(before);
  });
  test('shares exact canonical context with auditor and renders matching route identity to writer', () => {
    const m = prepare();
    expect(m[0].frozen.inputs[0].auditInput.canonicalContext).toEqual(m[0].canonicalContext);
    expect(m[0].canonicalContext.nextStop).toEqual({ stopId: 'B', name: 'Torre' });
    expect(m[1].canonicalContext.nextStop).toBeNull();
    expect(m[0].canonicalContext.playbackAssumption).toBe('on_site_exterior');
    expect(m[0].authorPrompt).toContain('Parada 1 de 2');
    expect(m[0].authorPrompt).toContain('Enlaza brevemente hacia Torre');
    expect(m[1].authorPrompt).toContain('Esta es la última parada: concluye');
    expect(m[0].frozen.auditPrompt).toContain('No autoriza orientación exacta');
  });
  test('omits own-stop example and all old case-specific briefing', () => {
    const m = prepare();
    expect(m[0].referenceIncluded).toBe(false);
    expect(m[0].authorPrompt).not.toContain('REFERENCIA_SOLO_ESTILO');
    expect(m[1].referenceIncluded).toBe(true);
    expect(m[1].authorPrompt).toContain('REFERENCIA_SOLO_ESTILO');
    for (const s of m) expect(s.authorPrompt).not.toContain('CASO_ANTIGUO_NO_IMPORTAR');
  });
  test('rejects bad order, targets and research before any execution', () => {
    const mutations = [
      (c: any) => { c.route.stops[1].stopId = 'A'; },
      (c: any) => { c.route.stops[1].position = 0; },
      (c: any) => { c.route.stops[0].nextStopId = null; },
      (c: any) => { c.narrationTargets.pop(); },
      (c: any) => { c.narrationTargets.push(c.narrationTargets[0]); },
      (c: any) => { c.narrationTargets[0].targetWords = NaN; },
      (c: any) => { c.narrationTargets[0].targetSeconds = -1; },
      (c: any) => { c.research.pop(); },
      (c: any) => { c.research[0].result.dossier.stopId = 'B'; },
      (c: any) => { c.research[0].result.dossier.language = 'fr'; },
      (c: any) => { c.research[0].result.dossier.passages[0].quote = ' '; },
      (c: any) => { c.research[0].result.dossier.passages[0].sourceId = 'unknown'; },
      (c: any) => { c.research[0].result.dossier.passages.push(c.research[0].result.dossier.passages[0]); }
    ];
    for (const mutate of mutations) { const c = fixture(); mutate(c); expect(() => prepare(c)).toThrow(); }
  });
  test('rejects missing instruction/reference sections', () => {
    expect(() => prepareAuthorCanaryMaterialV8(fixture(), 'none', reference, 'A')).toThrow();
    expect(() => prepareAuthorCanaryMaterialV8(fixture(), template, 'none', 'A')).toThrow();
  });
  test('history is bounded and explicitly not evidence', () => {
    expect(appendAuthorStyleHistoryV8('prompt', [])).toBe('prompt');
    const text = Array.from({ length: 100 }, (_, i) => 'word' + i).join(' ');
    const actual = appendAuthorStyleHistoryV8('prompt', [{ name: 'Earlier', text }]);
    expect(actual).toContain('NO es evidencia factual');
    expect(actual).toContain('word24');
    expect(actual).toContain('word75');
    expect(actual).not.toContain('word50');
  });
});
