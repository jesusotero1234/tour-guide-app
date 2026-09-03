import { validateNarrativeWriterLengthV8, validateNarrativeRepairLengthV8 } from './NarrativeEditorialAgentsV8';

describe('validateNarrativeWriterLengthV8', () => {
  const target = {
    stopId: 'stop-a',
    targetSeconds: 300,
    targetWords: 600,
    minPropositions: 6,
    maxPropositions: 10,
    minVisualAnchors: 2,
  };
  const words = (count: number) => Array.from({ length: count }, (_, index) => `palabra${index}`).join(' ');

  it('accepts text within the 20-word lower margin and ten-percent upper margin', () => {
    expect(validateNarrativeWriterLengthV8(words(580), target)).toMatchObject({
      valid: true,
      wordCount: 580,
      minimumWords: 580,
      maximumWords: 660,
    });
    expect(validateNarrativeWriterLengthV8(words(660), target).valid).toBe(true);
  });

  it('rejects text outside the 20-word lower margin and ten-percent upper margin', () => {
    expect(validateNarrativeWriterLengthV8(words(579), target).valid).toBe(false);
    expect(validateNarrativeWriterLengthV8(words(661), target).valid).toBe(false);
  });
});

describe('validateNarrativeRepairLengthV8', () => {
  const target = {
    stopId: 'stop-a',
    targetSeconds: 300,
    targetWords: 600,
    minPropositions: 6,
    maxPropositions: 10,
    minVisualAnchors: 2,
  };
  const words = (count: number) => Array.from({ length: count }, (_, index) => `palabra${index}`).join(' ');

  it('accepts text within the five-word lower-bound grace and ten-percent upper margin', () => {
    expect(validateNarrativeRepairLengthV8(words(575), target)).toMatchObject({
      valid: true,
      wordCount: 575,
      minimumWords: 575,
      maximumWords: 660,
    });
    expect(validateNarrativeRepairLengthV8(words(578), target)).toMatchObject({
      valid: true,
      wordCount: 578,
      minimumWords: 575,
      maximumWords: 660,
    });
  });

  it('rejects text outside the five-word lower-bound grace and ten-percent upper margin', () => {
    expect(validateNarrativeRepairLengthV8(words(574), target).valid).toBe(false);
    expect(validateNarrativeRepairLengthV8(words(661), target).valid).toBe(false);
  });
});
