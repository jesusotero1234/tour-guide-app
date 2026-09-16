import { draftIntroduction, NARRATION_RATES, outputLanguageInstruction, tourLocale, transferInstruction } from './TourLanguage';

it.each([
  ['en-GB', 'en', 'Discover', 'not included', 'English'],
  ['de-DE', 'de', 'Entdecke', 'nicht in', 'Deutsch'],
  ['it-IT', 'it', 'Scopri', 'escluso', 'italiano'],
] as const)('uses %s for generated introductions, transfers and author instructions', (input, locale, introduction, excluded, name) => {
  expect(tourLocale(input)).toBe(locale);
  expect(draftIntroduction('Madrid', input)).toContain(introduction);
  expect(draftIntroduction('Madrid', input)).toContain('Madrid');
  expect(transferInstruction('Plaza Mayor', input)).toContain(excluded);
  expect(transferInstruction('Plaza Mayor', input)).toContain('Plaza Mayor');
  expect(outputLanguageInstruction(input)).toContain(name);
  expect(NARRATION_RATES[locale].wordsPerMinute).toBeGreaterThan(0);
  expect(NARRATION_RATES[locale].measured).toBe(false);
});

it.each(['', 'ja', 'pt-BR', 'english'])('rejects the unsupported locale %s', language => {
  expect(() => tourLocale(language)).toThrow('UNSUPPORTED_TOUR_LANGUAGE');
});
