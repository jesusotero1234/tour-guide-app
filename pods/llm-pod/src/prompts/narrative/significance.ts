import { compactRecord, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function significancePrompt(input: LongNarrativePromptInput): SectionPrompt {
  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords),
    user: [
      `Section: significance for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      `Wikipedia body: ${input.seeds.wikipediaBody || 'none'}.`,
      `Wikidata claims: ${compactRecord(input.seeds.wikidataClaims)}.`,
      `Wikivoyage note: ${input.seeds.wikivoyage || 'none'}.`,
      'Answer the visitor\'s quiet question: "So what should I care about here, right now on this walk?" Tie the answer clearly to the tour theme and to what the place reveals about the city.',
      'Use only grounded facts; if facts are thin, make the significance about the type of place and its recorded tags rather than unsupported historical claims.',
    ].join('\n'),
  };
}
