import { activeNarrativeTemporalRuleV8, loadNarrativeTemporalRuleV8, parseNarrativeTemporalRuleV8 } from '../narrative-temporal-rule-v8';

test('requires explicit pilot selection and rejects a misspelled mode', () => {
  const previous = process.env.NARRATIVE_TEMPORAL_RULE;
  try {
    delete process.env.NARRATIVE_TEMPORAL_RULE;
    expect(activeNarrativeTemporalRuleV8()).toBeNull();
    process.env.NARRATIVE_TEMPORAL_RULE = 'selected';
    expect(activeNarrativeTemporalRuleV8()?.fingerprint).toBe(loadNarrativeTemporalRuleV8().fingerprint);
    process.env.NARRATIVE_TEMPORAL_RULE = 'typo';
    expect(() => activeNarrativeTemporalRuleV8()).toThrow('NARRATIVE_TEMPORAL_RULE');
  } finally {
    if (previous === undefined) delete process.env.NARRATIVE_TEMPORAL_RULE;
    else process.env.NARRATIVE_TEMPORAL_RULE = previous;
  }
});

test('loads only the reusable rule and fingerprints its actual instructions', () => {
  const rule = loadNarrativeTemporalRuleV8();
  expect(rule.text).toContain('Omitir un año exacto');
  expect(rule.text).not.toContain('700 palabras');
  expect(rule.text).not.toContain('Madrid');
  expect(rule.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  const wrap = (text: string) => '<!-- temporal-rule:start -->' + text + '<!-- temporal-rule:end -->';
  expect(parseNarrativeTemporalRuleV8(wrap(rule.text) + 'Informe nuevo').fingerprint).toBe(rule.fingerprint);
  expect(parseNarrativeTemporalRuleV8(wrap(rule.text + ' Cambio.')).fingerprint).not.toBe(rule.fingerprint);
  for (const document of ['', wrap(''), wrap('a') + wrap('b'), '<!-- temporal-rule:end --><!-- temporal-rule:start -->']) {
    expect(() => parseNarrativeTemporalRuleV8(document)).toThrow();
  }
  expect(() => loadNarrativeTemporalRuleV8('/missing-narrative-assets')).toThrow();
});
