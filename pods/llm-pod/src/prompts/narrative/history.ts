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
        ? 'THIN-SEED: There is almost no historical data on this place. Do NOT invent a backstory. Instead, describe what the OSM tags and visible structure reveal: "This type of construction often served as..." or "In this region, such buildings were typically...". Never attribute a specific era, event, or person to this POI.'
        : 'When a date is unavailable, connect cautiously to the recorded type or use of the place without inventing an era. If records are sparse, explain that the surviving public record is limited and avoid making up details.',
    ].join('\n'),
  };
}
