import { validatesSecondaryContrastV8 } from './NarrativeContrastCoverageV8';

const validText =
  'Se distingue porque está separada de la iglesia o catedral, en contraste con otros campanarios integrados en el mismo edificio eclesiástico.';
const validQuote =
  'Se caracteriza porque está separada de la catedral, a diferencia de otros campanarios que se encuentran integrados en el mismo edificio eclesiástico.';
const validLeft = 'está separada';
const validRight = 'integrados en el mismo edificio eclesiástico';

describe('validatesSecondaryContrastV8', () => {
  it.each([
    ['contrairement à', 'tour séparée', 'clochers intégrés'],
    ['ao contrário de', 'torre separada', 'campanários integrados'],
  ])('normalizes connector accents: %s', (connector, left, right) => {
    const text = `${left}, ${connector} ${right}.`;
    expect(validatesSecondaryContrastV8({ text, role: 'distinctive_trait', interpretation: 'direct', coverage: { left, right }, quotes: [text] })).toBe(true);
  });
  it('rejects two-word fragments that only occur as partial words', () => {
    const text = 'préestá separada, en contraste con otros campanarios integrados.';
    expect(validatesSecondaryContrastV8({ text, role: 'distinctive_trait', interpretation: 'direct', coverage: { left: 'está separada', right: 'campanarios integrados' }, quotes: [text] })).toBe(false);
  });
  it('rejects a connector before both fragments', () => {
    const text = 'A diferencia de otros sitios, está separada y tiene campanarios integrados.';
    expect(validatesSecondaryContrastV8({ text, role: 'distinctive_trait', interpretation: 'direct', coverage: { left: 'está separada', right: 'campanarios integrados' }, quotes: [text] })).toBe(false);
  });
  it('returns true for valid El Fadri paraphrase', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(true);
  });

  it('returns true with different casing and diacritics in coverage', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'ESTÁ SEPARADA', right: 'Integrados en el mismo edificio eclesiástico' },
      quotes: [validQuote],
    });
    expect(result).toBe(true);
  });

  it('does not mutate input', () => {
    const input = {
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: [validQuote],
    };
    const snapshot = JSON.stringify(input);
    validatesSecondaryContrastV8(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('rejects missing coverage', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: undefined,
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects null coverage', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: null,
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects array coverage', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: [validLeft, validRight],
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects non-object coverage', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: 'string',
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects coverage with extra keys', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight, extra: 'x' },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects coverage with non-string left', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 123, right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects coverage with non-string right', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: null },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects wrong primary role', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'primary_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects debatable interpretation', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'debatable',
      coverage: { left: validLeft, right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects unrelated quotes', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: ['This is a completely different text about something else.'],
    });
    expect(result).toBe(false);
  });

  it('rejects left and right in different quotes', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: [
        'está separada de la catedral',
        'integrados en el mismo edificio eclesiástico',
      ],
    });
    expect(result).toBe(false);
  });

  it('rejects connector only in claim not in quote', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: ['está separada de la catedral, otros campanarios integrados en el mismo edificio eclesiástico'],
    });
    expect(result).toBe(false);
  });

  it('rejects connector only in quote not in claim', () => {
    const result = validatesSecondaryContrastV8({
      text: 'está separada de la catedral, otros campanarios integrados en el mismo edificio eclesiástico',
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects simple unique trait without contrast', () => {
    const result = validatesSecondaryContrastV8({
      text: 'Es un campanario único en la ciudad.',
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'campanario único', right: 'en la ciudad' },
      quotes: ['Es un campanario único en la ciudad.'],
    });
    expect(result).toBe(false);
  });

  it('rejects one-word left side', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'separada', right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects one-word right side', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: 'integrados' },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects identical sides', () => {
    const result = validatesSecondaryContrastV8({
      text: 'está separada en contraste con está separada',
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'está separada', right: 'está separada' },
      quotes: ['está separada en contraste con está separada'],
    });
    expect(result).toBe(false);
  });

  it('rejects overlapping fragments where one contains the other', () => {
    const result = validatesSecondaryContrastV8({
      text: 'está separada de la catedral en contraste con campanarios integrados en el mismo edificio eclesiástico',
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'está separada', right: 'está separada de la catedral' },
      quotes: ['está separada de la catedral en contraste con campanarios integrados en el mismo edificio eclesiástico'],
    });
    expect(result).toBe(false);
  });

  it('rejects partial-word matches', () => {
    const result = validatesSecondaryContrastV8({
      text: 'está separada de la catedral en contraste con campanarios integrados en el mismo edificio eclesiástico',
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'separada', right: 'integrados en el mismo edificio eclesiástico' },
      quotes: ['está separada de la catedral en contraste con campanarios integrados en el mismo edificio eclesiástico'],
    });
    expect(result).toBe(false);
  });

  it('rejects left after right in text', () => {
    const result = validatesSecondaryContrastV8({
      text: 'integrados en el mismo edificio eclesiástico en contraste con está separada',
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'está separada', right: 'integrados en el mismo edificio eclesiástico' },
      quotes: ['integrados en el mismo edificio eclesiástico en contraste con está separada'],
    });
    expect(result).toBe(false);
  });

  it('rejects empty left', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: '', right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects empty right', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: '' },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects left too short', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: 'separ', right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects right too long', () => {
    const longRight = 'a'.repeat(201);
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: longRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects non-string text', () => {
    const result = validatesSecondaryContrastV8({
      text: 123 as unknown as string,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: [validQuote],
    });
    expect(result).toBe(false);
  });

  it('rejects non-array quotes', () => {
    const result = validatesSecondaryContrastV8({
      text: validText,
      role: 'distinctive_trait',
      interpretation: 'direct',
      coverage: { left: validLeft, right: validRight },
      quotes: 'not an array' as unknown as string[],
    });
    expect(result).toBe(false);
  });
});
