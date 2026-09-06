import {
  applyNarrativeLocalPatchV6,
  assignNarrativeSentenceIdsV6,
  auditNarrativeScriptDeterministicallyV6,
  buildNarrativeAuditObjectionsV6,
  narrativeRepetitionWarningsV6,
  validateNarrativeAuditReportV6,
} from './NarrativeEditorialV6';
import { narrativeFingerprintV6 } from './NarrativeContractsV6';

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

  it('rejects a repair that duplicates the same text in two adjacent sentenceIds', () => {
    const duplicateScript = assignNarrativeSentenceIdsV6(
      'alcazar',
      'Mira las cuatro torres del Alcázar. Su historia fue siempre pacífica.'
    );
    expect(() => applyNarrativeLocalPatchV6(duplicateScript, ['alcazar-S001'], {
      replacements: [
        { sentenceId: 'alcazar-S001', text: 'Mira las cuatro torres del Alcázar.' },
        { sentenceId: 'alcazar-S002', text: 'Mira las cuatro torres del Alcázar.' },
      ],
    })).toThrow('patch cannot duplicate adjacent sentence text');
  });

  it('does not block a patch because of pre-existing duplicates outside the modified window', () => {
    const script = assignNarrativeSentenceIdsV6(
      'alcazar',
      'Mira las cuatro torres del Alcázar. Mira las cuatro torres del Alcázar. El edificio cambió de función.'
    );
    const repaired = applyNarrativeLocalPatchV6(script, ['alcazar-S003'], {
      replacements: [
        { sentenceId: 'alcazar-S003', text: 'El edificio cambió de uso con los siglos.' },
      ],
    });
    expect(repaired.sentences[0].text).toBe('Mira las cuatro torres del Alcázar.');
    expect(repaired.sentences[1].text).toBe('Mira las cuatro torres del Alcázar.');
    expect(repaired.sentences[2].text).toBe('El edificio cambió de uso con los siglos.');
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

  it('covers authorized name tokens without hiding an unknown companion name', () => {
    const authorizedNames = [
      'Fernando Chueca Goitia', 'Carlos Sidro',
      'calles del Codo, del Cordón y de Madrid',
    ];
    const warnings = (text: string) => auditNarrativeScriptDeterministicallyV6(
      assignNarrativeSentenceIdsV6('madrid', text),
      { language: 'es', authorizedNames, authorizedNumbers: [] }
    ).filter((warning) => warning.code === 'unauthorized_name');

    expect(warnings('Ganaron Fernando Chueca Goitia y Carlos Sidro.')).toEqual([]);
    expect(warnings('Las calles son las del Codo, el Cordón y Madrid.')).toEqual([]);
    expect(warnings('Napoleón llegó después.')).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Napoleón') }),
    ]);
    expect(warnings('Fernando Chueca Goitia y Napoleón llegaron después.')).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Napoleón') }),
    ]);
  });

  it('v8 policy: coordinated authorized names produce zero unauthorized_name and a single RED when one is swapped', () => {
    const authorizedNames = [
      'Jardines del Descubrimiento',
      'Descubrimiento de América',
      'Torres de Colón',
      'Museo de Artes y Oficios',
    ];
    const authorizedPropositionTexts = [
      'El lugar cuenta con los Jardines del Descubrimiento.',
      'El monumento recuerda el Descubrimiento de América.',
      'Las Torres de Colón forman parte del conjunto.',
      'El Museo de Artes y Oficios conserva piezas históricas.',
    ];

    const script = assignNarrativeSentenceIdsV6(
      'lisboa',
      'El lugar reúne los Jardines del Descubrimiento, el monumento al Descubrimiento de América y las Torres de Colón. ' +
        'El Museo de Artes y Oficios conserva piezas históricas.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames,
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts,
    }).filter((w) => w.code === 'unauthorized_name');
    expect(warnings).toEqual([]);

    const swappedScript = assignNarrativeSentenceIdsV6(
      'lisboa',
      'El lugar reúne los Jardines del Descubrimiento, el monumento al Descubrimiento de América y las Torres de Marte. ' +
        'El Museo de Artes y Oficios conserva piezas históricas.'
    );
    const swappedWarnings = auditNarrativeScriptDeterministicallyV6(swappedScript, {
      language: 'es',
      authorizedNames,
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts,
    }).filter((w) => w.code === 'unauthorized_name');
    expect(swappedWarnings).toHaveLength(1);
    expect(swappedWarnings[0].message).toContain('Torres de Marte');

    const museumOnly = assignNarrativeSentenceIdsV6(
      'lisboa',
      'El Museo de Artes y Oficios conserva piezas históricas.'
    );
    const museumWarnings = auditNarrativeScriptDeterministicallyV6(museumOnly, {
      language: 'es',
      authorizedNames,
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts,
    }).filter((w) => w.code === 'unauthorized_name');
    expect(museumWarnings).toEqual([]);
  });

  it('does not treat ordinary capitalized sentence starts as names', () => {
    const starts = [
      'Estás', 'Aunque', 'Mientras', 'Comenzó', 'Así', 'Fíjate', 'Mírale',
      'Sígueme', 'Originariamente', 'Luego', 'Nos', 'Dos', 'Todo', 'Sin', 'Fíjese',
      'Observe', 'Compárala', 'Ambos', 'Tal', 'Aun', 'Hemos', 'No',
    ];

    for (const start of starts) {
      const warnings = auditNarrativeScriptDeterministicallyV6(
        assignNarrativeSentenceIdsV6('madrid', `${start} una frase normal en español.`),
        { language: 'es', authorizedNames: [], authorizedNumbers: [] }
      ).filter((warning) => warning.code === 'unauthorized_name');
      expect(warnings).toEqual([]);
    }
  });

  it('v8 policy: authorizes Pío IX from proposition text and rejects synthetic recombination', () => {
    const script = assignNarrativeSentenceIdsV6(
      'alcazar',
      'Pío IX visitó el Alcázar. Después llegó Napoleón y Carlos III.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: ['Alcázar'],
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts: ['Pío IX fue el papa que visitó el Alcázar.'],
    }).filter((w) => w.code === 'unauthorized_name');
    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('Napoleón'),
      expect.stringContaining('Carlos III'),
    ]));
    expect(warnings.every((warning) => warning.sentenceId === 'alcazar-S002')).toBe(true);
    expect(warnings.every((warning) => warning.scriptFingerprint === script.fingerprint)).toBe(true);

    const synthetic = assignNarrativeSentenceIdsV6(
      'alcazar',
      'Carlos Napoleón llegó al Alcázar.'
    );
    const syntheticWarnings = auditNarrativeScriptDeterministicallyV6(synthetic, {
      language: 'es',
      authorizedNames: ['Alcázar'],
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts: ['Carlos III fue el rey. Napoleón visitó la ciudad.'],
    }).filter((w) => w.code === 'unauthorized_name');
    expect(syntheticWarnings).toHaveLength(1);
    expect(syntheticWarnings[0].message).toContain('Carlos Napoleón');
  });

  it('v8 policy: treats Hermanas de la Cruz and hyphenated surnames as complete spans', () => {
    const script = assignNarrativeSentenceIdsV6(
      'madrid',
      'Las Hermanas de la Cruz atendieron al paciente. María José-García llegó después.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts: [
        'Las Hermanas de la Cruz son una congregación religiosa.',
        'María José-García es una historiadora.',
      ],
    }).filter((w) => w.code === 'unauthorized_name');
    expect(warnings).toEqual([]);

    const unauthorizedScript = assignNarrativeSentenceIdsV6(
      'madrid',
      'El grupo visitó a las Hermanas de la Cruz en el barrio. Después María José-García llegó al museo.'
    );
    const unauthorizedWarnings = auditNarrativeScriptDeterministicallyV6(unauthorizedScript, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: [],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_name');
    expect(unauthorizedWarnings).toHaveLength(2);
    expect(unauthorizedWarnings[0].severity).toBe('hard');
    expect(unauthorizedWarnings[0].message).toContain('Hermanas de la Cruz');
    expect(unauthorizedWarnings[1].severity).toBe('hard');
    expect(unauthorizedWarnings[1].message).toContain('María José-García');
  });

  it('v8 policy: coordinated name second segment is unauthorized_name, not ambiguous_capitalized_start', () => {
    const script = assignNarrativeSentenceIdsV6(
      'plaza',
      'Napoleón y Carlos llegaron a la plaza.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: [],
      policy: 'v8',
    });
    const carlosWarning = warnings.find((w) => w.message.includes('Carlos'));
    expect(carlosWarning).toBeDefined();
    expect(carlosWarning!.code).toBe('unauthorized_name');
    expect(carlosWarning!.code).not.toBe('ambiguous_capitalized_start');
  });

  it('v8 policy: emits ambiguous_capitalized_start for unknown single capitalized word at sentence start', () => {
    const script = assignNarrativeSentenceIdsV6(
      'madrid',
      'Zorro caminó por la plaza. Después llegó el grupo.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: [],
      policy: 'v8',
    });
    const ambiguous = warnings.filter((w) => w.code === 'ambiguous_capitalized_start');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].severity).toBe('soft');
    expect(ambiguous[0].sentenceId).toBe('madrid-S001');
    expect(ambiguous[0].scriptFingerprint).toBe(script.fingerprint);
  });

  it('v8 policy: strips sentence-initial locative adverbs before authorized names without weakening unknown-name detection', () => {
    const locatives = ['Aquí', 'Allí', 'Hoy', 'Ahora'];
    const authorizedNames = ['Puerta de Alcalá', 'Alcazaba', 'Catedral de Toledo'];

    for (const locative of locatives) {
      for (const name of authorizedNames) {
        const script = assignNarrativeSentenceIdsV6('madrid', `${locative} la ${name} se ve desde la plaza.`);
        const warnings = auditNarrativeScriptDeterministicallyV6(script, {
          language: 'es',
          authorizedNames,
          authorizedNumbers: [],
          policy: 'v8',
        }).filter((w) => w.code === 'unauthorized_name');
        expect(warnings).toEqual([]);
      }
    }

    const singleUnknown = auditNarrativeScriptDeterministicallyV6(
      assignNarrativeSentenceIdsV6('test-city', 'Aquí Zorro saluda al grupo.'),
      { language: 'es', authorizedNames, authorizedNumbers: [], policy: 'v8' }
    );
    expect(singleUnknown).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized_name', severity: 'hard' }),
    ]));
    expect(singleUnknown.some(w => w.code === 'ambiguous_capitalized_start')).toBe(false);

    const unknownScript = assignNarrativeSentenceIdsV6('madrid', 'Aquí la Torre Inventada se ve desde la plaza.');
    const unknownWarnings = auditNarrativeScriptDeterministicallyV6(unknownScript, {
      language: 'es',
      authorizedNames,
      authorizedNumbers: [],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_name');
    expect(unknownWarnings).toHaveLength(1);
    expect(unknownWarnings[0].severity).toBe('hard');
    expect(unknownWarnings[0].message).toContain('Torre Inventada');

    const mixedScript = assignNarrativeSentenceIdsV6('madrid', 'Aquí la Alcazaba y Torre Inventada se ven desde la plaza.');
    const mixedWarnings = auditNarrativeScriptDeterministicallyV6(mixedScript, {
      language: 'es',
      authorizedNames,
      authorizedNumbers: [],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_name');
    expect(mixedWarnings).toHaveLength(1);
    expect(mixedWarnings[0].message).toContain('Torre Inventada');

    const arbitraryScript = assignNarrativeSentenceIdsV6('madrid', 'Aquí Juan Pérez llegó al museo.');
    const arbitraryWarnings = auditNarrativeScriptDeterministicallyV6(arbitraryScript, {
      language: 'es',
      authorizedNames,
      authorizedNumbers: [],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_name');
    expect(arbitraryWarnings).toHaveLength(1);
    expect(arbitraryWarnings[0].message).toContain('Juan Pérez');
  });

  it('v8 policy: repeated unauthorized names carry distinct sentence IDs', () => {
    const script = assignNarrativeSentenceIdsV6(
      'alcazar',
      'Aquí llegó Napoleón al Alcázar. Después volvió Napoleón al día siguiente.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: ['Alcázar'],
      authorizedNumbers: [],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_name');
    expect(warnings).toHaveLength(2);
    expect(warnings[0].sentenceId).toBe('alcazar-S001');
    expect(warnings[1].sentenceId).toBe('alcazar-S002');
    expect(warnings[0].scriptFingerprint).toBe(script.fingerprint);
    expect(warnings[1].scriptFingerprint).toBe(script.fingerprint);
  });

  it('v8 policy: canonicalizes equivalent Spanish thousands formats', () => {
    const script = assignNarrativeSentenceIdsV6(
      'alcazar',
      'Había 15 000 visitantes. También 15\u00A0000 personas. Luego 15\u202F000 asistentes. Y 15.000 más.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: ['15.000'],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_number');
    expect(warnings).toEqual([]);
  });

  it('v8 policy: treats year ranges as a single canonical range', () => {
    const script = assignNarrativeSentenceIdsV6(
      'alcazar',
      'La construcción ocurrió entre 1530-1540. También se cita 1530\u20131540.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: ['1530-1540'],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_number');
    expect(warnings).toEqual([]);
  });

  it('v8 policy: repeated unauthorized numeric occurrences have distinct sentence IDs', () => {
    const script = assignNarrativeSentenceIdsV6(
      'alcazar',
      'En 1937 llegó el grupo. Después en 1937 volvió.'
    );
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: [],
      policy: 'v8',
    }).filter((w) => w.code === 'unauthorized_number');
    expect(warnings).toHaveLength(2);
    expect(warnings[0].sentenceId).toBe('alcazar-S001');
    expect(warnings[1].sentenceId).toBe('alcazar-S002');
    expect(warnings[0].scriptFingerprint).toBe(script.fingerprint);
    expect(warnings[1].scriptFingerprint).toBe(script.fingerprint);
  });

  it('v8 policy: numeric authorization includes literals from authorized proposition texts while rejecting an unrelated number', () => {
    const script = assignNarrativeSentenceIdsV6(
      'malaga',
      'El edificio tenía 1340 metros. La obra comenzó en 1487. ' +
        'Había 40 ventanas. El cambio ocurrió en 1940. ' +
        'La reforma terminó en 1930. Se usaron 16 columnas. ' +
        'El museo abrió en 1972. Llegaron 11 guías. ' +
        'La fundación data de 1874. La ampliación fue en 1876. ' +
        'El código 9999 no aparece en el dossier.'
    );
    const authorizedPropositionTexts = [
      'El edificio tenía 1340 metros de perímetro.',
      'La obra comenzó en 1487 tras la restauración.',
      'Había 40 ventanas en la fachada.',
      'El cambio de uso ocurrió en 1940.',
      'La reforma terminó en 1930 con nuevos muros.',
      'Se usaron 16 columnas de mármol.',
      'El museo abrió en 1972 para el público.',
      'Llegaron 11 guías al recinto.',
      'La fundación data de 1874 en el archivo.',
      'La ampliación fue en 1876 con una nueva torre.',
    ];
    const warnings = auditNarrativeScriptDeterministicallyV6(script, {
      language: 'es',
      authorizedNames: [],
      authorizedNumbers: [],
      policy: 'v8',
      authorizedPropositionTexts,
    }).filter((w) => w.code === 'unauthorized_number');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('hard');
    expect(warnings[0].message).toContain('9999');
    expect(warnings[0].sentenceId).toBe('malaga-S011');
    expect(warnings[0].scriptFingerprint).toBe(script.fingerprint);
  });

  it('v8 policy: preserves complete sentences containing a. C. and d. C. era abbreviations', () => {
    const text = 'El templo se construyó en el siglo II a. C. y se amplió en el siglo I d. C. Después llegó el grupo.';
    const script = assignNarrativeSentenceIdsV6('alcazar', text, { sentenceBoundaryPolicy: 'v8' });
    expect(script.sentences.map((sentence) => sentence.text)).toEqual([
      'El templo se construyó en el siglo II a. C. y se amplió en el siglo I d. C.',
      'Después llegó el grupo.',
    ]);
  });

  it('legacy default: fragments era abbreviations the same way as before', () => {
    const text = 'El templo se construyó en el siglo II a. C. y se amplió en el siglo I d. C. Después llegó el grupo.';
    const script = assignNarrativeSentenceIdsV6('alcazar', text);
    expect(script.sentences.map((sentence) => sentence.text)).toEqual([
      'El templo se construyó en el siglo II a.',
      'C. y se amplió en el siglo I d.',
      'C.',
      'Después llegó el grupo.',
    ]);
  });

  it('preserveParagraphs: normalizes CRLF, blank lines, and multiple spaces while preserving paragraph layout', () => {
    const input = 'First paragraph line one.\r\nFirst paragraph line two.\r\n\r\nSecond paragraph\twith\tmultiple\tspaces.\r\nSecond paragraph line two.';
    const script = assignNarrativeSentenceIdsV6('test', input, { preserveParagraphs: true, sentenceBoundaryPolicy: 'v8' });
    expect(script.text).toBe('First paragraph line one. First paragraph line two.\n\nSecond paragraph with multiple spaces. Second paragraph line two.');
    expect(script.sentences.map((s) => s.text)).toEqual([
      'First paragraph line one.',
      'First paragraph line two.',
      'Second paragraph with multiple spaces.',
      'Second paragraph line two.',
    ]);
    expect(script.fingerprint).toBe(narrativeFingerprintV6({ stopId: 'test', text: script.text, sentences: script.sentences }));
  });

  it('preserveParagraphs: exact sentences equality vs existing flattened V8 path including era abbreviation', () => {
    const text = 'El templo se construyó en el siglo II a. C. y se amplió en el siglo I d. C.\n\nDespués llegó el grupo.';
    const preserved = assignNarrativeSentenceIdsV6('alcazar', text, { preserveParagraphs: true, sentenceBoundaryPolicy: 'v8' });
    const flattened = assignNarrativeSentenceIdsV6('alcazar', text, { sentenceBoundaryPolicy: 'v8' });
    expect(preserved.sentences.map((s) => s.text)).toEqual(flattened.sentences.map((s) => s.text));
    expect(preserved.sentences.map((s) => s.sentenceId)).toEqual(flattened.sentences.map((s) => s.sentenceId));
    expect(preserved.sentences.map((s) => s.index)).toEqual(flattened.sentences.map((s) => s.index));
    expect(preserved.text).toBe('El templo se construyó en el siglo II a. C. y se amplió en el siglo I d. C.\n\nDespués llegó el grupo.');
    expect(flattened.text).toBe('El templo se construyó en el siglo II a. C. y se amplió en el siglo I d. C. Después llegó el grupo.');
  });

  it('preserveParagraphs: default is still flattened', () => {
    const text = 'First line.\n\nSecond line.';
    const script = assignNarrativeSentenceIdsV6('test', text);
    expect(script.text).toBe('First line. Second line.');
  });

  it('preserveParagraphs: single paragraph equivalent and empty input still rejects', () => {
    const single = assignNarrativeSentenceIdsV6('test', 'Only one paragraph here.', { preserveParagraphs: true });
    expect(single.text).toBe('Only one paragraph here.');
    expect(single.sentences).toHaveLength(1);
    expect(() => assignNarrativeSentenceIdsV6('test', '   \n  \n  ', { preserveParagraphs: true })).toThrow('script test has no sentences');
  });
});
