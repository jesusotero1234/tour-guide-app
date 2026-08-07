import { compactRecord, formatStructuredFacts, LongNarrativePromptInput, sectionSystem, SectionPrompt } from './types';

/**
 * Archetypes for arrival openings — rotated per POI to avoid repetition.
 * Each archetype defines a distinct narrative entry point.
 */
const ARRIVAL_ARCHETYPES = [
  'anecdotal: start with a specific person, event, or curious detail tied to this place',
  'contrast: begin by contrasting something old vs. new, or expected vs. surprising',
  'question: start with a rhetorical question that hooks curiosity about this stop',
  'detail: zoom in on one small architectural or urban detail and use it as a lens for the whole stop',
  'rumour: begin with something a local might tell you — not a date, but an observation passed down',
  'scale: open by describing the physical scale or position of this place within the city fabric',
];

function pickArchetype(index: number): string {
  return ARRIVAL_ARCHETYPES[index % ARRIVAL_ARCHETYPES.length];
}

export function arrivalPrompt(input: LongNarrativePromptInput): SectionPrompt {
  const isFirst = input.position === 'first';
  const stopIndex = input.stopIndex ?? (input.totalStops ? (input.position === 'first' ? 0 : input.position === 'last' ? (input.totalStops - 1) : undefined) : undefined);
  const archetype = input.openingArchetype || (stopIndex !== undefined ? pickArchetype(stopIndex) : '');

  const welcomeBeat = isFirst
    ? [
        'IMPORTANT: The visitor has already heard the tour introduction and welcome.',
        'Do not welcome them again, do not repeat the duration or number of stops, and do not restart the tour promise.',
        `Begin directly with the distinct editorial job of "${input.localName}".`,
      ].filter(Boolean).join(' ')
    : '';

  return {
    system: sectionSystem(input.language, input.retry, input.seedQuality, input.targetWords, input.usedOpenings, archetype),
    user: [
      welcomeBeat,
      input.narrativeBriefText ? `NARRATIVE BRIEF (primary editorial contract — use this as your guide; raw evidence is supplementary):\n${input.narrativeBriefText}` : '',
      `Section: arrival opening for ${input.localName}.`,
      `Tour theme: ${input.theme}.`,
      input.narrativeRole ? `UNIQUE ROLE FOR THIS STOP: ${input.narrativeRole}. Do not replace it with a generic idea.` : '',
      input.centralQuestion ? `WHOLE-TOUR QUESTION: ${input.centralQuestion}` : '',
      input.editorialRepairInstructions?.length ? `REPAIR INSTRUCTIONS: ${input.editorialRepairInstructions.join('; ')}` : '',
      `OSM visual/type cues: ${compactRecord(input.seeds.osmTags)}.`,
      `Wikipedia lead (primary narrative source): ${input.seeds.wikipediaLead || 'none'}.`,
      input.seeds.enrichedContext ? `Enriched context: ${input.seeds.enrichedContext.slice(0, 800)}` : '',
      formatStructuredFacts(input.seeds.wikidataClaims, input.language),
      'EDITORIAL JOB: make the visitor feel physically present. Choose one exterior anchor and speak from it; let the next section carry the chronology.',
      'Use stable observations that remain true on any visit. Do not presume the current weather, sunlight, crowd, noise, or time of day.',
      'Do not invent cardinal directions or route geometry. Connect to the previous stop by idea, not by saying north, south, east, or west.',
      'Describe only what is visible from outside: scale, materials, relationship to street/square, surrounding activity. FORBIDDEN: atmosphere, interior light, shadows, sensations that require being inside the building.',
      'If enriched context is provided, use it as your primary source — it contains rich, verified detail about this place.',
      input.seedQuality === 'thin'
        ? 'THIN-SEED: Do not invent dates, eras, architects, or styles. Do not mention sparse records or source limits. Orient the visitor through what can be seen: scale, materials, activity, and what the place type reveals about the area.'
        : 'If records are sparse, use only available cues; do not say that records are sparse and do not invent architectural details or history.',
      'Describe la escala con datos concretos cuando estén en el Fact Card: altura, materiales, año, estilo. Evita adjetivos genéricos de tamaño si puedes dar una cifra o un hecho verificable.',
      input.missingFacts && input.missingFacts.length > 0
        ? `Previous attempt failed — missing these facts: ${input.missingFacts.join(', ')}. Rewrite including them.`
        : '',
    ].filter(Boolean).join('\n'),
  };
}
