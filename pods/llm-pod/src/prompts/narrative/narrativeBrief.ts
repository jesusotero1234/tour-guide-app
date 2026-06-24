// ═══════════════════════════════════════════════════════════════════
// Fase 4 — NarrativeBrief determinístico
// ═══════════════════════════════════════════════════════════════════

import { LongNarrativePromptInput, FactCategory, PROP_TO_CATEGORY } from './types';

export interface BriefFact {
  value: string;
  category: FactCategory;
  propId: string;
}

export type SeedQualityTier = 'rich' | 'medium' | 'thin';

export type NarrativeTone = 'serious-cultivated' | 'warm-practical' | 'curious-vivid';

export interface NarrativeBrief {
  poiName: string;
  city: string;
  theme: string;
  language: string;
  seedQuality: SeedQualityTier;
  allowedFacts: BriefFact[];
  visibleCues: string[];
  localContext: string[];
  forbiddenClaims: string[];
  sectionBeats: {
    arrival: string[];
    history: string[];
    significance: string[];
    transition?: string[];
  };
  tone: NarrativeTone;
  routeContext: {
    stopNumber: number;
    totalStops: number;
    previousStop?: string;
    nextStop?: string;
    role: string;
    question: string;
    handoff: string;
    route: string[];
  };
}

function buildRouteHandoff(input: LongNarrativePromptInput): string {
  if (input.position === 'first') {
    return `Use ${input.localName} to open the route question; do not preview every later stop.`;
  }
  if (input.position === 'last') {
    return `After ${input.previousStopName || 'the previous stop'}, use ${input.localName} to answer the route question with one final concrete idea.`;
  }
  return `Show what changes when the route moves from ${input.previousStopName || 'the previous stop'} to ${input.localName}, then leave one open thread for ${input.nextStopName || 'the next stop'}.`;
}

export function buildRouteQuestion(input: LongNarrativePromptInput): string {
  const theme = input.theme.toLowerCase();
  if (theme === 'history' || theme === 'histoire' || theme === 'historia') {
    return 'How has this city reinvented public life while keeping traces of each earlier era?';
  }
  if (theme === 'architecture' || theme === 'arquitectura') {
    return 'How does this city use architecture to negotiate between inherited forms and reinvention?';
  }
  if (theme === 'art' || theme === 'arte') {
    return 'How has this city turned changing ideas about art into places people can still experience?';
  }
  if (theme === 'food' || theme === 'gastronomy' || theme === 'gastronomía') {
    return "How do everyday places preserve and reshape the city's food culture?";
  }
  return `What changes across the city when we follow ${input.theme} from one place to the next?`;
}

export function describeStopRole(input: LongNarrativePromptInput): string {
  const total = Math.max(input.totalStops || input.tourStopNames?.length || 1, 1);
  const index = Math.min(Math.max(input.stopIndex || 0, 0), total - 1);
  if (index === 0) return `opening lens: establish how the visitor can read ${input.theme} in ${input.cityName || 'the city'}`;
  if (index === total - 1) return `closing synthesis: gather the route's main thread without summarizing every stop`;

  const progress = index / (total - 1);
  if (progress <= 0.34) return `origins and foundations: add historical depth to the route's opening idea`;
  if (progress <= 0.67) return `contrast and transformation: show how the city's story changes or complicates itself`;
  return `culmination: raise the route's stakes and prepare the visitor for its final idea`;
}

/** Maps architectural/art themes to a cultivated, precise tone. */
const THEME_TONE: Record<string, NarrativeTone> = {
  history: 'serious-cultivated',
  architecture: 'serious-cultivated',
  art: 'curious-vivid',
  gastronomy: 'warm-practical',
  default: 'warm-practical',
};

/** Visible cues we can safely assert from OSM tags. */
function extractVisibleCues(input: LongNarrativePromptInput): string[] {
  const tags = input.seeds?.osmTags || {};
  const cues: string[] = [];

  const materialHints: Record<string, string> = {
    'building:material': 'material de construcción',
    'roof:material': 'material del tejado',
    'wall': 'tipo de muro',
  };

  for (const [key, value] of Object.entries(tags)) {
    if (materialHints[key] && typeof value === 'string') {
      cues.push(`${materialHints[key]}: ${value}`);
    }
  }

  // Always available: the POI exists at its coordinates
  if (input.localName) cues.push(`ubicación: ${input.cityName || ''}`);

  return cues;
}

/** Extract allowed facts from Wikidata claims and Wikipedia. */
function extractAllowedFacts(input: LongNarrativePromptInput): BriefFact[] {
  const facts: BriefFact[] = [];
  const seen = new Set<string>();

  // Wikidata claims (highest confidence)
  const claims = input.seeds?.wikidataClaims || {};
  for (const [propId, value] of Object.entries(claims)) {
    const category = PROP_TO_CATEGORY[propId];
    if (!category) continue;
    const key = `${propId}:${value}`;
    if (!seen.has(key) && value) {
      seen.add(key);
      facts.push({ value: String(value), category, propId });
    }
  }

  // Extract key names from Wikipedia lead for architect/creator detection
  if (input.seeds?.wikipediaLead) {
    const lead = input.seeds.wikipediaLead;
    // Architect detection
    const architectMatch = lead.match(
      /(?:diseñad[oa] por|obra de|arquitecto[s]?|architect[s]?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})/i
    );
    if (architectMatch) {
      const key = `architect:${architectMatch[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        facts.push({ value: architectMatch[1], category: 'architect', propId: 'P84' });
      }
    }
  }

  return facts;
}

/** Determine seed quality tier based on character count. */
function determineSeedQuality(input: LongNarrativePromptInput): SeedQualityTier {
  const totalChars = (input.localName || '').length +
    (input.seeds?.wikipediaLead || '').length +
    (input.seeds?.wikipediaBody || '').length +
    (input.seeds?.enrichedContext || '').length;

  if (totalChars >= 1000) return 'rich';
  if (totalChars >= 400) return 'medium';
  return 'thin';
}

/** Build section beats — micro-objectives for each section, localized. */
function buildSectionBeats(
  input: LongNarrativePromptInput,
  seedQuality: SeedQualityTier
): NarrativeBrief['sectionBeats'] {
  const name = input.localName;
  const lang = input.language?.slice(0, 2).toLowerCase() || 'en';

  const t = (es: string, en: string) => lang === 'es' ? es : en;
  const role = describeStopRole(input);
  const routeQuestion = buildRouteQuestion(input);

  const beats: NarrativeBrief['sectionBeats'] = {
    arrival: [
      t(`Sitúa al visitante ante ${name} sin volver a presentar el tour`, `Place the visitor in front of ${name} without reintroducing the tour`),
      t('Usa un detalle exterior concreto como punto de entrada', 'Use one concrete exterior detail as the entry point'),
      seedQuality === 'thin'
        ? t('Mantén la descripción breve y observacional', 'Keep the description brief and observational')
        : t('Deja fechas, autores y cronología para la sección histórica', 'Leave dates, creators, and chronology to the history section'),
      ...(input.position === 'first'
        ? [t(`Abre de forma natural la pregunta que guiará el recorrido: ${routeQuestion}`, `Naturally open the question that will guide the route: ${routeQuestion}`)]
        : []),
    ],
    history: [
      seedQuality === 'thin'
        ? t('Ofrece un dato histórico breve si está disponible', 'Offer a brief historical fact if available')
        : t('Incluye fecha de construcción y arquitecto si están en los hechos permitidos', 'Include construction date and architect if in the allowed facts'),
      t('Cuenta un cambio, decisión o tensión histórica como una microhistoria', 'Tell one historical change, decision, or tension as a micro-story'),
      t('Avanza desde la llegada; no vuelvas a describir dónde está el visitante', 'Move forward from the arrival; do not describe where the visitor is again'),
    ],
    significance: [
      t(`Interpreta qué cambia ${name} en nuestra lectura de ${input.theme}`, `Interpret what ${name} changes in our understanding of ${input.theme}`),
      t('Parte de una consecuencia, uso o contraste concreto distinto de la cronología', 'Start from a concrete consequence, use, or contrast rather than repeating chronology'),
      t(`Cumple este papel dentro del recorrido: ${role}`, `Fulfil this role in the route: ${role}`),
    ],
    transition: input.position === 'last'
      ? [
          t('Cierra el recorrido sin despedidas forzadas', 'Close the tour without forced goodbyes'),
          t(`Responde a la pregunta de la ruta sin enumerar las paradas: ${routeQuestion}`, `Answer the route question without listing the stops: ${routeQuestion}`),
        ]
      : [
          t(`Haz que el paso hacia ${input.nextStopName || 'la siguiente parada'} parezca una continuación de la conversación`, `Make the move to ${input.nextStopName || 'the next stop'} feel like the next thought in the conversation`),
          t('Usa una sola idea puente; no resumas la parada', 'Use one bridging idea; do not summarize the stop'),
        ],
  };

  return beats;
}

/** Derive forbidden claims that the model should not mention, localized. */
function extractForbiddenClaims(input: LongNarrativePromptInput): string[] {
  const forbidden: string[] = [];
  const lang = input.language?.slice(0, 2).toLowerCase() || 'en';
  const t = (es: string, en: string) => lang === 'es' ? es : en;

  const hasArchitect = input.seeds?.wikidataClaims?.['P84'];
  if (!hasArchitect) {
    forbidden.push(t('No inventes arquitectos ni atribuciones de autoría', 'Do not invent architects or authorship claims'));
  }

  const hasStyle = input.seeds?.wikidataClaims?.['P149'];
  if (!hasStyle) {
    forbidden.push(t('No asignes estilos arquitectónicos sin evidencia', 'Do not assign architectural styles without evidence'));
  }

  if (determineSeedQuality(input) === 'thin') {
    forbidden.push(t('No inventes eventos históricos ni personajes', 'Do not invent historical events or figures'));
    forbidden.push(t('No uses frases grandilocuentes sobre la importancia del lugar', 'Do not use grandiose phrases about the place'));
  }

  forbidden.push(t(
    'No menciones fuentes de datos ni limitaciones de registros',
    'Do not mention data sources or record limitations'
  ));
  forbidden.push(t(
    'No uses adjetivación vacía: majestuoso, impresionante, increíble',
    'Do not use empty adjectives: majestic, impressive, incredible'
  ));

  return forbidden;
}

/** Local context from the city/environment. */
function buildLocalContext(input: LongNarrativePromptInput): string[] {
  const lang = input.language?.slice(0, 2).toLowerCase() || 'en';
  const t = (es: string, en: string) => lang === 'es' ? es : en;
  const ctx: string[] = [];
  if (input.cityName) ctx.push(`${t('Ciudad', 'City')}: ${input.cityName}`);
  if (input.theme) ctx.push(`${t('Tema', 'Theme')}: ${input.theme}`);
  if (input.language) ctx.push(`${t('Idioma', 'Language')}: ${input.language}`);
  return ctx;
}

/** Build the deterministic NarrativeBrief from input seeds. */
export function buildNarrativeBrief(input: LongNarrativePromptInput): NarrativeBrief {
  const seedQuality = determineSeedQuality(input);
  const allowedFacts = extractAllowedFacts(input);
  const visibleCues = extractVisibleCues(input);
  const forbiddenClaims = extractForbiddenClaims(input);
  const sectionBeats = buildSectionBeats(input, seedQuality);
  const tone = THEME_TONE[input.theme] || THEME_TONE.default;
  const localContext = buildLocalContext(input);

  return {
    poiName: input.localName,
    city: input.cityName || '',
    theme: input.theme,
    language: input.language,
    seedQuality,
    allowedFacts,
    visibleCues,
    localContext,
    forbiddenClaims,
    sectionBeats: {
      arrival: sectionBeats.arrival,
      history: sectionBeats.history,
      significance: sectionBeats.significance,
      ...(sectionBeats.transition ? { transition: sectionBeats.transition } : {}),
    },
    tone,
    routeContext: {
      stopNumber: (input.stopIndex || 0) + 1,
      totalStops: input.totalStops || input.tourStopNames?.length || 1,
      previousStop: input.previousStopName,
      nextStop: input.nextStopName,
      role: describeStopRole(input),
      question: buildRouteQuestion(input),
      handoff: buildRouteHandoff(input),
      route: input.tourStopNames || [],
    },
  };
}

/** Format the brief as a structured text block for prompt injection. */
export function formatBriefForPrompt(
  brief: NarrativeBrief,
  sectionName?: keyof NarrativeBrief['sectionBeats']
): string {
  const lines: string[] = [];

  lines.push('=== NARRATIVE BRIEF ===');
  lines.push(`POI: ${brief.poiName}`);
  lines.push(`City: ${brief.city}`);
  lines.push(`Theme: ${brief.theme}`);
  lines.push(`Tone: ${brief.tone}`);
  lines.push(`Seed Quality: ${brief.seedQuality}`);
  lines.push(`Route role: ${brief.routeContext.role}`);
  lines.push(`Shared route question: ${brief.routeContext.question}`);
  lines.push(`This stop's handoff: ${brief.routeContext.handoff}`);
  lines.push(`Route position: stop ${brief.routeContext.stopNumber} of ${brief.routeContext.totalStops}`);
  if (brief.routeContext.previousStop) lines.push(`Previous stop: ${brief.routeContext.previousStop}`);
  if (brief.routeContext.nextStop) lines.push(`Next stop: ${brief.routeContext.nextStop}`);
  if (brief.routeContext.route.length > 0) lines.push(`Whole route: ${brief.routeContext.route.join(' -> ')}`);

  if (brief.allowedFacts.length > 0) {
    lines.push('\nALLOWED FACTS (you may use these):');
    for (const fact of brief.allowedFacts) {
      lines.push(`- [${fact.category}] ${fact.value}`);
    }
  }

  if (brief.visibleCues.length > 0) {
    lines.push('\nVISIBLE CUES (safe observations):');
    for (const cue of brief.visibleCues) {
      lines.push(`- ${cue}`);
    }
  }

  if (brief.forbiddenClaims.length > 0) {
    lines.push('\nFORBIDDEN (do NOT mention):');
    for (const claim of brief.forbiddenClaims) {
      lines.push(`- ${claim}`);
    }
  }

  lines.push('\nSECTION BEATS:');
  for (const [section, beats] of Object.entries(brief.sectionBeats)) {
    if (sectionName && section !== sectionName) continue;
    if (beats && beats.length > 0) {
      lines.push(`  ${section}:`);
      for (const beat of beats) {
        lines.push(`    - ${beat}`);
      }
    }
  }

  return lines.join('\n');
}
