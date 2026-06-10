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

/** Build section beats — micro-objectives for each section. */
function buildSectionBeats(
  input: LongNarrativePromptInput,
  seedQuality: SeedQualityTier
): NarrativeBrief['sectionBeats'] {
  const name = input.localName;

  const beats: NarrativeBrief['sectionBeats'] = {
    arrival: [
      `Describe la ubicación de ${name}`,
      'Menciona un detalle visible de la fachada o estructura',
      seedQuality === 'thin'
        ? 'Mantén la descripción breve y observacional'
        : 'Incluye el material o estilo si está en los hechos permitidos',
    ],
    history: [
      seedQuality === 'thin'
        ? 'Ofrece un dato histórico breve si está disponible'
        : 'Incluye fecha de construcción y arquitecto si están en los hechos permitidos',
      'Contextualiza en una frase la época o propósito original',
      'Evita narrativas grandilocuentes',
    ],
    significance: [
      `Explica por qué ${name} es relevante para este recorrido de ${input.theme}`,
      'Conecta con un detalle concreto, no con abstracciones',
      'No uses frases como "testimonio de" o "símbolo de"',
    ],
    transition: input.position === 'last' ? [
      'Cierra el recorrido sin despedidas forzadas',
      'Conecta con una observación final que dé cohesión al tour',
    ] : undefined,
  };

  return beats;
}

/** Derive forbidden claims that the model should not mention. */
function extractForbiddenClaims(input: LongNarrativePromptInput): string[] {
  const forbidden: string[] = [];

  // If we don't have an architect in the evidence, forbid architect claims
  const hasArchitect = input.seeds?.wikidataClaims?.['P84'];
  if (!hasArchitect) {
    forbidden.push('No inventes arquitectos ni atribuciones de autoría');
  }

  // If we don't have style data, forbid style claims
  const hasStyle = input.seeds?.wikidataClaims?.['P149'];
  if (!hasStyle) {
    forbidden.push('No asignes estilos arquitectónicos sin evidencia');
  }

  // Thin seeds: forbid grand historical narratives
  if (determineSeedQuality(input) === 'thin') {
    forbidden.push('No inventes eventos históricos ni personajes');
    forbidden.push('No uses frases grandilocuentes sobre la importancia del lugar');
  }

  // Always forbidden
  forbidden.push('No menciones fuentes de datos ni limitaciones de registros');
  forbidden.push('No uses adjetivación vacía: majestuoso, impresionante, increíble');

  return forbidden;
}

/** Build the deterministic NarrativeBrief from input seeds. */
export function buildNarrativeBrief(input: LongNarrativePromptInput): NarrativeBrief {
  const seedQuality = determineSeedQuality(input);
  const allowedFacts = extractAllowedFacts(input);
  const visibleCues = extractVisibleCues(input);
  const forbiddenClaims = extractForbiddenClaims(input);
  const sectionBeats = buildSectionBeats(input, seedQuality);
  const tone = THEME_TONE[input.theme] || THEME_TONE.default;

  // Local context from the city/environment
  const localContext: string[] = [];
  if (input.cityName) localContext.push(`Ciudad: ${input.cityName}`);
  if (input.theme) localContext.push(`Tema: ${input.theme}`);
  if (input.language) localContext.push(`Idioma: ${input.language}`);

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
  };
}

/** Format the brief as a structured text block for prompt injection. */
export function formatBriefForPrompt(brief: NarrativeBrief): string {
  const lines: string[] = [];

  lines.push('=== NARRATIVE BRIEF ===');
  lines.push(`POI: ${brief.poiName}`);
  lines.push(`City: ${brief.city}`);
  lines.push(`Theme: ${brief.theme}`);
  lines.push(`Tone: ${brief.tone}`);
  lines.push(`Seed Quality: ${brief.seedQuality}`);

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
    if (beats && beats.length > 0) {
      lines.push(`  ${section}:`);
      for (const beat of beats) {
        lines.push(`    - ${beat}`);
      }
    }
  }

  return lines.join('\n');
}
