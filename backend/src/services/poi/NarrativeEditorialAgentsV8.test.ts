import { validateNarrativeWriterLengthV8 } from './NarrativeEditorialAgentsV8';

describe('validateNarrativeWriterLengthV8', () => {
  const target = {
    stopId: 'stop-a',
    targetSeconds: 60,
    targetWords: 100,
    minPropositions: 6,
    maxPropositions: 10,
    minVisualAnchors: 2,
  };
  const words = (count: number) => Array.from({ length: count }, (_, index) => `palabra${index}`).join(' ');

  it('accepts text within the inclusive ten-percent tolerance', () => {
    expect(validateNarrativeWriterLengthV8(words(90), target)).toMatchObject({
      valid: true,
      wordCount: 90,
      minimumWords: 90,
      maximumWords: 110,
    });
    expect(validateNarrativeWriterLengthV8(words(110), target).valid).toBe(true);
  });

  it('rejects text outside the target tolerance', () => {
    expect(validateNarrativeWriterLengthV8(words(89), target).valid).toBe(false);
    expect(validateNarrativeWriterLengthV8(words(111), target).valid).toBe(false);
  });
});
