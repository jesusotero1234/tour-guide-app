import { compactRecord, formatStructuredFacts, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

export function historyPrompt(input: LongNarrativePromptInput): SectionPrompt {
  if (input.theme === 'food') {
    const factCard = formatStructuredFacts(input.seeds.wikidataClaims, input.language);

    return {
      system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, input.openingArchetype),
      user: [
        `Section: culinary or market background for ${input.localName}.`,
        `Tour theme: ${input.theme}.`,
        factCard || 'VERIFIED FACTS: none.',
        `Wikipedia body: ${input.seeds.wikipediaBody || 'none'}.`,
        'TASK:',
        '- Use verified facts as your primary source.',
        '- Only connect this place to food, trade, ingredients, markets, eating, or celebration if that connection appears in the provided facts or context.',
        '- If no food connection is provided, write a cautious historical note using verified facts and the urban role of the place.',
        '- Do not invent restaurants, cafes, dishes, smells, menus, vendors, crowds, or culinary traditions.',
        input.missingFacts && input.missingFacts.length > 0
          ? `Previous attempt failed — missing these facts: ${input.missingFacts.join(', ')}. Rewrite including them.`
          : '',
      ].filter(Boolean).join('\n'),
    };
  }

  const factCard = formatStructuredFacts(input.seeds.wikidataClaims, input.language);

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, input.openingArchetype),
    user: [
      `Section: historical background for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      factCard || 'VERIFIED FACTS: none.',
      `Wikipedia body: ${input.seeds.wikipediaBody || 'none'}.`,
      input.seedQuality === 'thin'
        ? [
            'TASK:',
            '- Write a concise guide-style historical observation.',
            '- Do not invent dates, architects, styles, events, owners, materials, or historical functions.',
            '- Use only the place name, recorded type, OSM tags, visible urban role, and any provided context.',
            '- Do not say that records or sources are limited.',
          ].join('\n')
        : [
            'TASK:',
            '- Use the VERIFIED FACTS as the backbone of this section.',
            '- If three or more verified facts are listed, include three of them.',
            '- If fewer than three verified facts are listed, include all available ones.',
            '- Prefer this order: date or inauguration, architect or creator, style, heritage status, location.',
            '- Open with a verified fact, not with a generic spatial phrase like "Frente a ti se alza".',
            '- Turn the facts into one short story, but keep the actual date, name, style, or status intact.',
            '- You may add one visible exterior observation, but do not name materials unless provided.',
            '- Do not mention sources, Wikidata, confidence, missing records, or internal rules.',
            '- Do not use grandeur adjectives, atmospheric effects, imagined crowds, guards, ceremonies, smells, or emotions.',
            input.missingFacts && input.missingFacts.length > 0
              ? `Previous attempt failed — missing these facts: ${input.missingFacts.join(', ')}. Rewrite including them.`
              : '',
          ].join('\n'),
    ].filter(Boolean).join('\n'),
  };
}
