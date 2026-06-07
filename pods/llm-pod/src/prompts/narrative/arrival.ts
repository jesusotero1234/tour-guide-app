import { compactRecord, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function arrivalPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const isFirst = input.position === 'first';
  const welcomeBeat = isFirst
    ? [
        `IMPORTANT: This is the FIRST stop of the tour. Begin the section with a warm welcome.`,
        `Open with a sentence like: "Welcome to this ${input.theme} walking tour of ${input.cityName ?? 'this city'}."`,
        input.totalStops ? `Mention there are ${input.totalStops} stops.` : '',
        input.tourDurationMinutes ? `Mention the tour takes about ${input.tourDurationMinutes} minutes.` : '',
        `Then say "Our first stop is ${input.localName}." and continue with arrival narration.`,
      ].filter(Boolean).join(' ')
    : '';

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords),
    user: [
      welcomeBeat,
      `Section: arrival opening for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      `OSM visual/type cues: ${compactRecord(input.seeds.osmTags)}.`,
      `Wikipedia lead: ${input.seeds.wikipediaLead || 'none'}.`,
      'Open visually: orient the visitor to what they can see or feel as they arrive, such as facade, scale, materials, light, activity, or atmosphere. Then explain why this arrival matters to the tour theme.',
      'If records are sparse, say so honestly and use only the available cues; do not invent architectural details or history.',
    ].filter(Boolean).join('\n'),
  };
}
