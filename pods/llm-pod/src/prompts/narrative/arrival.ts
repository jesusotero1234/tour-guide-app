import { compactRecord, formatStructuredFacts, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

/**
 * Archetypes for arrival openings — rotated per POI to avoid repetition.
 * Each archetype defines a distinct narrative entry point.
 */
const ARRIVAL_ARCHETYPES = [
  'anecdotal: start with a specific person, event, or curious detail tied to this place',
  'sensory: open with a sound, smell, or texture that defines the atmosphere right now',
  'contrast: begin by contrasting something old vs. new, or expected vs. surprising',
  'question: start with a rhetorical question that hooks curiosity about this stop',
  'scene: open by painting a quick scene — who is here, what are they doing, what does the light look like',
  'detail: zoom in on one small architectural or urban detail and use it as a lens for the whole stop',
  'rumour: begin with something a local might tell you — not a date, but an observation passed down',
  'scale: open by describing the physical scale or position of this place within the city fabric',
];

function pickArchetype(index: number): string {
  return ARRIVAL_ARCHETYPES[index % ARRIVAL_ARCHETYPES.length];
}

export function arrivalPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const isFirst = input.position === 'first';
  const stopIndex = input.totalStops ? (input.position === 'first' ? 0 : input.position === 'last' ? (input.totalStops - 1) : undefined) : undefined;
  const archetype = input.openingArchetype || (stopIndex !== undefined ? pickArchetype(stopIndex) : '');

  const welcomeBeat = isFirst
    ? [
        `IMPORTANT: This is the FIRST stop. Give a warm opening — but DO NOT say "Bienvenidos a esta caminata" or "Welcome to this walking tour".`,
        `Instead, open like a real guide who is already on the street with the visitor: drop them straight into the moment.`,
        input.totalStops ? `Naturally mention there are ${input.totalStops} stops.` : '',
        input.tourDurationMinutes ? `Naturally mention the tour takes about ${input.tourDurationMinutes} minutes.` : '',
        `Then introduce the first stop: "${input.localName}."`,
      ].filter(Boolean).join(' ')
    : '';

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, archetype),
    user: [
      welcomeBeat,
      `Section: arrival opening for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      formatStructuredFacts(input.seeds.wikidataClaims, input.language),
      `OSM visual/type cues: ${compactRecord(input.seeds.osmTags)}.`,
      `Wikipedia lead: ${input.seeds.wikipediaLead || 'none'}.`,
      input.seeds.enrichedContext ? `Enriched context (use this as the primary factual source): ${input.seeds.enrichedContext.slice(0, 800)}` : '',
      'Open visually: orient the visitor to what they can see or feel as they arrive, such as facade, scale, materials, light, activity, or atmosphere. Then explain why this arrival matters to the tour theme.',
      'If enriched context is provided, use it as your primary source — it contains rich, verified detail about this place.',
      input.seedQuality === 'thin'
        ? 'THIN-SEED: Do not invent dates, eras, architects, or styles. Do not mention sparse records or source limits. Orient the visitor through what can be seen or felt now: scale, light, activity, materials if visible or provided, atmosphere, and the role this place plays in the walk.'
        : 'If records are sparse, use only available cues; do not say that records are sparse and do not invent architectural details or history.',
    ].filter(Boolean).join('\n'),
  };
}
