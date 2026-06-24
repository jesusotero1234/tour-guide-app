import { describeStopRole } from './narrativeBrief';
import { LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function transitionPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const nextStop = input.nextStopName || 'the next stop';
  const isLast = input.position === 'last';
  const routeRole = describeStopRole(input);
  const tourState = input.totalStops && input.stopIndex !== undefined
    ? `Tour state: this is stop ${input.stopIndex + 1} of ${input.totalStops}. ${isLast ? 'IT IS THE LAST STOP.' : `Next stop: ${nextStop}.`}`
    : '';

  const transitionRules = isLast
    ? 'RULES FOR LAST STOP: Do NOT guide to a next stop. Do NOT mention walking onward. Thank the visitor and reflect on what they have seen. Do NOT say the tour "continues" or "we will see" — the tour ends here.'
    : 'RULES FOR TRANSITION: Do NOT say "we have reached the end" or "final stop" or "last stop" or "conclude our tour". This is NOT the last stop. Briefly reflect on this stop, then guide naturally toward the next one. Keep it short (35-55 words).';

  const userBlock = [
    input.narrativeBriefText ? `NARRATIVE BRIEF (primary editorial contract):\n${input.narrativeBriefText}` : '',
    `Section: ${isLast ? 'FINAL GOODBYE' : 'walking-tour transition'} from ${input.localName}.`,
    tourState,
    `Editorial role of this stop: ${routeRole}.`,
    input.previousSectionsText ? `What the guide has just said at this stop:\n${input.previousSectionsText}` : '',
    transitionRules,
    isLast
      ? [
          `Thank the visitor for walking with you through ${input.cityName ?? 'this city'}.`,
          `Reflect briefly on what they have seen during this ${input.theme} tour, with a satisfying closing beat rather than a generic farewell.`,
          `Wish them well. Write about ${input.targetWords ?? '35 to 55'} words.`,
        ].join('\n')
      : [
          `Next stop: ${nextStop}.`,
          'Continue from one non-numeric idea the visitor has just heard so the destination feels like the next thought in a live conversation, not an itinerary announcement.',
          'Vary the movement naturally: you do not need to say "now", "continue", or "next stop" when the destination name already makes the direction clear.',
          'Do not imply the destination is adjacent, nearby, visible, north, south, east, or west; no route geometry was provided.',
          'ABSOLUTE RULE: include no dates, centuries, architects, construction claims, architectural styles, addresses, districts, distances, coordinates, or street names.',
        ].join('\n'),
    input.missingFacts && input.missingFacts.length > 0
      ? `Previous attempt failed — ${input.missingFacts.join(' ')} Rewrite fixing these issues.`
      : '',
  ].filter(Boolean).join('\n');

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, '35 to 55'),
    user: userBlock,
  };
}
