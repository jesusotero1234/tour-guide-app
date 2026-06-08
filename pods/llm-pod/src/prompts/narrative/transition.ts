import { LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function transitionPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const nextStop = input.nextStopName || 'the next stop';
  const isLast = input.position === 'last';

  const userBlock = isLast
    ? [
        `Section: GOODBYE — this is the final stop of the tour.`,
        `Do not guide to a next stop. Do not mention walking onward.`,
        `Thank the visitor for walking with you through ${input.cityName ?? 'this city'}.`,
        `Reflect briefly on what they have seen during this ${input.theme} tour, with a satisfying closing beat rather than a generic farewell.`,
        `Wish them well. Write about ${input.targetWords ?? '35 to 55'} words.`,
      ].join('\n')
    : [
        `Section: walking-tour transition from ${input.localName}.`,
        `Tour position: ${input.position}.`,
        `Next stop: ${nextStop}.`,
        'Write a reflective closing beat and guide the visitor onward. If the theme naturally connects this stop to the next, include a brief callback or contrast. Do not add new historical facts. Do not mention distance, coordinates, or street names.',
      ].join('\n');

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, input.openingArchetype),
    user: userBlock,
  };
}
