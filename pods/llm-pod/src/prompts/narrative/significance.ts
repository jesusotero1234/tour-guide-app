import { compactRecord, formatStructuredFacts, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function significancePrompt(input: LongNarrativePromptInput): SectionPrompt {
  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, input.openingArchetype),
    user: [
      `Section: significance for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      formatStructuredFacts(input.seeds.wikidataClaims, input.language),
      `Wikipedia body: ${input.seeds.wikipediaBody || 'none'}.`,
      `Wikivoyage note: ${input.seeds.wikivoyage || 'none'}.`,
      `Enriched context: ${input.seeds.enrichedContext || 'none'}.`,
      'Describe what makes this place distinctive within the tour theme. Use only verifiable facts from the provided context.',
      'Show the significance through concrete details — architectural features, historical role, cultural meaning, urban function — rather than stating "this is significant because...".',
      'If facts are thin, focus on what the place type and recorded tags reveal about the neighbourhood or city.',
      'Connect this stop to the broader tour theme naturally, like a guide who knows why they chose this route.',
    ].join('\n'),
  };
}
