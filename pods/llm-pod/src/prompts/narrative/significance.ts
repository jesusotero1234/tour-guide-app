import { compactRecord, formatStructuredFacts, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function significancePrompt(input: LongNarrativePromptInput): SectionPrompt {
  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords),
    user: [
      input.narrativeBriefText ? `NARRATIVE BRIEF (primary editorial contract — use this as your guide; raw evidence is supplementary):\n${input.narrativeBriefText}` : '',
      `Section: significance for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      `Wikipedia lead: ${input.seeds.wikipediaLead || 'none'}.`,
      `Wikivoyage note: ${input.seeds.wikivoyage || 'none'}.`,
      `Enriched context: ${input.seeds.enrichedContext || 'none'}.`,
      formatStructuredFacts(input.seeds.wikidataClaims, input.language),
      input.previousSectionsText ? `WHAT THE VISITOR HAS ALREADY HEARD AT THIS STOP:\n${input.previousSectionsText}` : '',
      'EDITORIAL JOB: interpret the consequence of the story rather than retelling it. Build from a use, contrast, or cultural effect; assume dates and creators were already heard in the history section.',
      'NEW CONTRIBUTION TEST: add one idea the visitor has not heard yet. If no new fact is needed, interpret the consequence of the history without repeating its dates, creator, or opening description.',
      'Describe what makes this place distinctive within the tour theme. Use only verifiable facts from the provided context.',
      'Show the significance through concrete details — architectural features, historical role, cultural meaning, urban function — rather than stating "this is significant because...".',
      input.seedQuality === 'thin'
        ? 'THIN-SEED: Do not invent historical importance and do not mention limited records. Show significance through the stop\'s observable urban function, name, place type, location in the route, and relation to the tour theme. Never claim a specific role, date, owner, event, or institution unless provided.'
        : 'If facts are thin, focus on what the place type and recorded tags reveal about the neighbourhood or city without saying the facts are thin.',
      'Connect this stop to the broader tour theme naturally, like a guide who knows why they chose this route.',
      'Use a concrete detail, but avoid repeating the same date, architect, and style as a second fact list. The listener should feel the route advancing to a new idea.',
      input.missingFacts && input.missingFacts.length > 0
        ? `Previous attempt failed — missing these facts: ${input.missingFacts.join(', ')}. Rewrite including them.`
        : '',
    ].join('\n'),
  };
}
