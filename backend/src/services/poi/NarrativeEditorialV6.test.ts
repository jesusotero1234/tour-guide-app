import {
  applyNarrativeLocalPatchV6,
  assignNarrativeSentenceIdsV6,
  auditNarrativeScriptDeterministicallyV6,
  buildNarrativeAuditObjectionsV6,
  narrativeRepetitionWarningsV6,
  validateNarrativeAuditReportV6,
} from './NarrativeEditorialV6';

describe('narrative v6 editorial protocol', () => {
  const script = assignNarrativeSentenceIdsV6(
    'alcazar',
    'Mira las cuatro torres del Alcázar. Su historia fue siempre pacífica. '
      + 'El edificio cambió de función. Ahora continúa hacia la catedral.'
  );

  it('assigns stable sentence ids and requires every auditor to classify every sentence', () => {
    expect(script.sentences.map((sentence) => sentence.sentenceId)).toEqual([
      'alcazar-S001', 'alcazar-S002', 'alcazar-S003', 'alcazar-S004',
    ]);
    expect(() => validateNarrativeAuditReportV6({
      auditor: 'deepseek',
      findings: [{
        sentenceId: 'alcazar-S001', classification: 'supported',
        reason: 'Visible en la fuente.', propositionIds: ['P1'],
      }],
    }, script)).toThrow('deepseek must classify every sentence exactly once');
  });

  it('keeps both auditors independent and preserves their disagreements', () => {
    const deepseek = validateNarrativeAuditReportV6({
      auditor: 'deepseek',
      findings: script.sentences.map((sentence) => ({
        sentenceId: sentence.sentenceId,
        classification: sentence.index === 1 ? 'unsupported' as const : 'supported' as const,
        reason: sentence.index === 1 ? 'No existe evidencia.' : 'Respaldada.',
        propositionIds: sentence.index === 1 ? [] : ['P1'],
      })),
    }, script);
    const gemma = validateNarrativeAuditReportV6({
      auditor: 'gemma',
      findings: script.sentences.map((sentence) => ({
        sentenceId: sentence.sentenceId,
        classification: sentence.index === 1 ? 'distorted' as const : 'supported' as const,
        reason: sentence.index === 1 ? 'Contradice la cronología.' : 'Respaldada.',
        propositionIds: ['P1'],
      })),
    }, script);

    expect(buildNarrativeAuditObjectionsV6([deepseek, gemma])).toMatchObject([
      { objectionId: 'deepseek:alcazar-S002:unsupported', auditor: 'deepseek' },
      { objectionId: 'gemma:alcazar-S002:distorted', auditor: 'gemma' },
    ]);
  });

  it('allows a repair to change only the accepted sentence and one adjacent sentence', () => {
    const repaired = applyNarrativeLocalPatchV6(script, ['alcazar-S002'], {
      replacements: [
        { sentenceId: 'alcazar-S002', text: 'Su historia incluye etapas de conflicto.' },
        { sentenceId: 'alcazar-S003', text: 'También cambió de función con los siglos.' },
      ],
    });

    expect(repaired.sentences[0].text).toBe(script.sentences[0].text);
    expect(repaired.sentences[1].text).toContain('etapas de conflicto');
    expect(() => applyNarrativeLocalPatchV6(script, ['alcazar-S002'], {
      replacements: [{ sentenceId: 'alcazar-S004', text: 'Cambio fuera de ventana.' }],
    })).toThrow('patch changes sentence alcazar-S004 outside the permitted window');
  });

  it('flags unauthorized numbers and cross-stop repetition without inventing a hard word quota', () => {
    const deterministic = auditNarrativeScriptDeterministicallyV6(
      assignNarrativeSentenceIdsV6(
        'alcazar',
        'En 1937 el edificio cambió. Este es un relato breve en español para quien escucha.'
      ),
      { language: 'es', authorizedNames: [], authorizedNumbers: ['1936'] }
    );
    expect(deterministic).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized_number', severity: 'hard' }),
    ]));

    expect(auditNarrativeScriptDeterministicallyV6(
      assignNarrativeSentenceIdsV6('alcazar', 'En 1808, Napoleón visitó el Alcázar de Toledo.'),
      { language: 'es', authorizedNames: ['Alcázar de Toledo'], authorizedNumbers: [] }
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized_name', message: expect.stringContaining('Napoleón') }),
    ]));

    const authorizedNarration = auditNarrativeScriptDeterministicallyV6(
      assignNarrativeSentenceIdsV6(
        'cibeles',
        'Fue Carlos III quien llegó. Entonces José Rodríguez Losada respondió. '
          + 'La noche terminó en Navidad junto a la Fuente de Cibeles. '
          + 'Después visitamos el Palacio Real de Madrid.'
      ),
      {
        language: 'es',
        authorizedNames: [
          'Carlos III', 'José Rodríguez Losada', 'Cibeles', 'Palacio Real', 'Madrid',
        ],
        authorizedNumbers: [],
      }
    );
    expect(authorizedNarration).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized_name' }),
    ]));
    expect(auditNarrativeScriptDeterministicallyV6(
      assignNarrativeSentenceIdsV6('mayor', 'En el siglo XVII, la plaza cambió.'),
      { language: 'es', authorizedNames: [], authorizedNumbers: [] }
    )).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized_name' }),
    ]));

    const repeated = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce final.';
    expect(narrativeRepetitionWarningsV6([
      assignNarrativeSentenceIdsV6('one', repeated),
      assignNarrativeSentenceIdsV6('two', `Inicio. ${repeated}`),
    ])).toHaveLength(1);
  });
});
