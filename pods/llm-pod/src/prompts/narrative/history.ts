import { compactRecord, formatStructuredFacts, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function historyPrompt(input: LongNarrativePromptInput): SectionPrompt {
  if (input.theme === 'food') {
    return {
      system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, input.openingArchetype),
      user: [
        `Section: culinary or market background for ${input.localName}.`,
        `Tour theme: ${input.theme}.`,
        formatStructuredFacts(input.seeds.wikidataClaims, input.language),
        `Wikipedia body: ${input.seeds.wikipediaBody || 'none'}.`,
        'Use supported facts to explain the place through food, trade, ingredients, market life, everyday commerce, or how people gathered here to buy, eat, or celebrate when that link is genuinely present in the record.',
        'If the record does not show a meaningful food connection, say that clearly and stay cautious. Do not invent restaurants, cafes, dishes, smells, menus, vendors, or culinary traditions that are not supported by the provided facts.',
      ].join('\n'),
    };
  }

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, input.openingArchetype),
    user: [
      `Section: historical background for ${input.localName}.`,
      formatStructuredFacts(input.seeds.wikidataClaims, input.language),
      `Wikipedia body: ${input.seeds.wikipediaBody || 'none'}.`,
      'Frame supported facts as a short story: begin with a hook around a real date, person, use, transformation, or broader era only when provided. Do not recite claims as a list.',
      input.seedQuality === 'thin'
        ? 'THIN-SEED: Do not mention that historical data is missing. Do not invent a backstory. Use the recorded place type, name, OSM tags, and visible urban role to create a concise guide-style observation. You may speak generally about what this kind of place lets a visitor notice, but never attach an unprovided era, event, owner, architect, or date to this POI.'
        : 'When a date is unavailable, connect cautiously to the recorded type or use of the place without inventing an era. Do not mention sparse records; simply omit unsupported claims.',
    ].join('\n'),
  };
}
