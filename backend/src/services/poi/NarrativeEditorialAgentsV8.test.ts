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

  it('accepts text within the 25-word lower margin and ten-percent upper margin', () => {
    expect(validateNarrativeWriterLengthV8(words(575), target)).toMatchObject({
      valid: true,
      wordCount: 575,
      minimumWords: 575,
      maximumWords: 660,
    });
    expect(validateNarrativeWriterLengthV8(words(660), target).valid).toBe(true);
  });

  it('rejects text outside the 25-word lower margin and ten-percent upper margin', () => {
    expect(validateNarrativeWriterLengthV8(words(574), target).valid).toBe(false);
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

  it('accepts a narrow repair-only margin with a 5-word lower grace', () => {
    expect(validateNarrativeRepairLengthV8(words(570), target)).toMatchObject({
      valid: true,
      wordCount: 570,
      minimumWords: 570,
      maximumWords: 680,
    });
    expect(validateNarrativeRepairLengthV8(words(575), target).valid).toBe(true);
    expect(validateNarrativeRepairLengthV8(words(672), target).valid).toBe(true);
    expect(validateNarrativeRepairLengthV8(words(680), target).valid).toBe(true);
  });

  it('rejects text outside the narrow repair-only margin', () => {
    expect(validateNarrativeRepairLengthV8(words(569), target).valid).toBe(false);
    expect(validateNarrativeRepairLengthV8(words(681), target).valid).toBe(false);
  });
});
