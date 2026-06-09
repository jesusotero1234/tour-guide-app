import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { model } from '../llm/model';
import { arrivalPrompt } from '../prompts/narrative/arrival';
import { historyPrompt } from '../prompts/narrative/history';
import { significancePrompt } from '../prompts/narrative/significance';
import { transitionPrompt } from '../prompts/narrative/transition';
import { LongNarrativePromptInput, LongNarrativeSeeds, SectionPrompt, FactCategory, PROP_TO_CATEGORY, categoryLabel } from '../prompts/narrative/types';
import { env } from '../config/env';

const router = express.Router();
const NARRATIVE_MODEL = env.narrativeModel;

type SectionName = 'arrival' | 'history' | 'significance' | 'transition';
type SeedQuality = 'rich' | 'thin';

type TraceInput = LongNarrativePromptInput & { traceId?: string };

interface NarrativePolicy {
  seedQuality: SeedQuality;
  targetWords: string;
  sectionNames: SectionName[];
}

interface SectionAttemptTrace {
  section: SectionName;
  attempt: number;
  systemPrompt?: string;
  userPrompt?: string;
  modelOptions: {
    model: string;
    temperature: number;
    max_tokens: number;
    format: 'json';
    think: boolean;
  };
  rawLlmResponse?: string;
  parseResult?: string | null;
  parseError?: string;
  validationFailure?: string | null;
  wordCount?: number;
  durationMs?: number;
  done_reason?: string;
  eval_count?: number;
  success: boolean;
  error?: string;
}

interface NarrativeDebugTrace {
  traceId: string;
  localName: string;
  cityName?: string;
  position: string;
  language: string;
  theme: string;
  seedSizes: ReturnType<typeof seedSizes>;
  seeds: LongNarrativePromptInput['seeds'];
  policy: NarrativePolicy;
  attempts: SectionAttemptTrace[];
  fallbacks: Array<{ section: SectionName; reason: string; text: string }>;
  finalSections?: Record<string, string>;
  narrationPreview?: string;
  totalDurationMs?: number;
  droppedReasons?: string[];
}

const narrativeDebug = process.env.NARRATIVE_DEBUG === 'true';

function narrativeLog(event: string, fields: Record<string, unknown>): void {
  console.log('[narrativeLong]', JSON.stringify({ event, ...fields }));
}

function narrativeWarn(event: string, fields: Record<string, unknown>): void {
  console.warn('[narrativeLong]', JSON.stringify({ event, ...fields }));
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'stop';
}

async function findTraceRoot(): Promise<string> {
  let current = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      await fs.access(path.join(current, 'docs', 'working'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return process.cwd();
}

async function writeDebugTrace(trace: NarrativeDebugTrace): Promise<void> {
  if (!narrativeDebug) return;
  try {
    const root = await findTraceRoot();
    const dir = path.join(root, '.dev-logs', 'narrative');
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}-${safeFilePart(trace.traceId)}-${safeFilePart(trace.localName)}.json`;
    await fs.writeFile(path.join(dir, fileName), JSON.stringify(trace, null, 2), 'utf8');
    narrativeLog('debug-trace-written', { traceId: trace.traceId, file: path.join(dir, fileName) });
  } catch (error) {
    narrativeWarn('debug-trace-write-failed', {
      traceId: trace.traceId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

const STOP_WORDS: Record<string, RegExp> = {
  es: /\b(el|la|los|las|un|una|de|del|que|está|este|esta|cuando|como|para|por|con|año)\b/gi,
  fr: /\b(le|la|les|un|une|des|de|du|que|est|cette|ce|ces|vous|nous|dans|avec|sur|pour)\b/gi,
  de: /\b(der|die|das|den|dem|ein|eine|und|ist|mit|auf|für|sich|hier)\b/gi,
  en: /\b(the|is|was|of|and|this|that|with|for|you|we|in|on)\b/gi,
};

function countLanguageHits(text: string, language: string): number {
  const rx = STOP_WORDS[language];
  return rx ? (text.match(rx) || []).length : 0;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasRepetition(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  const seen = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i++) {
    const key = words.slice(i, i + 3).join(' ');
    const count = (seen.get(key) || 0) + 1;
    if (count > 3) return true;
    seen.set(key, count);
  }
  return false;
}

function hasLanguageSignal(text: string, language: string): boolean {
  const code = language.slice(0, 2).toLowerCase();
  if (!STOP_WORDS[code]) return true;
  const targetHits = countLanguageHits(text, code);
  for (const otherCode of Object.keys(STOP_WORDS)) {
    if (otherCode === code) continue;
    const otherHits = countLanguageHits(text, otherCode);
    if (otherHits >= 5 && otherHits > targetHits) {
      return false;
    }
  }
  return targetHits >= 2;
}

function seedText(input: LongNarrativePromptInput): string {
  const seeds = input.seeds || { osmTags: {} };
  return [
    input.localName || '',
    seeds.wikipediaLead || '',
    seeds.wikipediaBody || '',
    seeds.enrichedContext || '',
    Object.values(seeds.wikidataClaims || {}).join(' '),
    Object.values(seeds.osmTags || {}).join(' '),
    seeds.wikivoyage || '',
  ].join(' ');
}

function totalSeedChars(input: LongNarrativePromptInput): number {
  return seedText(input).length;
}

function seedSizes(input: LongNarrativePromptInput): Record<string, number> {
  const seeds = input.seeds || { osmTags: {} };
  return {
    wikipediaLead: (seeds.wikipediaLead || '').length,
    wikipediaBody: (seeds.wikipediaBody || '').length,
    wikidataClaims: JSON.stringify(seeds.wikidataClaims || {}).length,
    osmTags: JSON.stringify(seeds.osmTags || {}).length,
    wikivoyage: (seeds.wikivoyage || '').length,
    totalSeedChars: totalSeedChars(input),
  };
}

function policyFor(input: LongNarrativePromptInput): NarrativePolicy {
  const seedQuality: SeedQuality = totalSeedChars(input) >= 500 ? 'rich' : 'thin';
  if (seedQuality === 'thin') {
    return {
      seedQuality,
      targetWords: '60 to 80',
      sectionNames: input.position === 'last'
        ? ['arrival', 'history', 'significance', 'transition']
        : ['arrival', 'history', 'significance'],
    };
  }
  return {
    seedQuality,
    targetWords: '70 to 90',
    sectionNames: ['arrival', 'history', 'significance', 'transition'],
  };
}

const SUSPICIOUS_DRIFT_TERMS = [
  'France',
  'French',
  'Argentina',
  'Argentine',
  'Argentinean',
  'Argentinian',
  'Buenos Aires',
  'Plaza Mariano Moreno',
  'Dominican Republic',
  'República Dominicana',
  'République dominicaine',
  'Santo Domingo',
  'Puerta del Conde',
  'Casa Rosada',
  'Parque Independencia',
  'Altar a la Patria',
  'Second World War',
  'World War II',
  'World War 2',
  'WWII',
  'Seconde Guerre mondiale',
  'Deuxième Guerre mondiale',
  'guerre mondiale',
  'Primera Guerra Mundial',
  'Segunda Guerra Mundial',
];

function hasUnsupportedDrift(section: string, input: LongNarrativePromptInput): string | null {
  if (input.seedQuality !== 'thin') return null;
  const source = seedText(input).toLowerCase();
  const output = section.toLowerCase();
  const unsupported = SUSPICIOUS_DRIFT_TERMS.find(term => {
    const normalized = term.toLowerCase();
    return output.includes(normalized) && !source.includes(normalized);
  });
  return unsupported ? `unsupported-drift-${unsupported}` : null;
}

/** Normalize text for accent/diacritic-insensitive comparison.
 *  NFD decomposition + strip combining marks + lowercase. */
function normalizeNFD(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Phrases banned in generated output — checked post-generation, not just in the prompt.
 *  Normalized forms (no accents) for reliable matching after normalizeNFD(). */
const BANNED_OUTPUT_PHRASES = [
  'mire a su alrededor', 'mira a tu alrededor', 'miren hacia arriba', 'mira hacia abajo',
  'al llegar a', 'la primera impresion', 'es un lugar emblematico', 'fachada de ladrillo rojo',
  'bienvenidos a esta caminata', 'se presenta ante ti',
  'es significativo para nuestro recorrido', 'es importante para nuestra caminata',
  'refleja como', 'muestra como',
  'must-see destination', 'steeped in history', 'hidden gem',
  'timeless charm', 'living witness', 'whisper of the past', 'echoes of history',
  'invites you to imagine', 'tells a story of', 'captivates every visitor', 'step back in time',
  // Fase 2.6: calibrated bans — normal descriptors removed, AI-isms kept
  'atmosfera', 'juego de luces', 'sombras',
  'majestuoso', 'majestuosidad', 'majestuosamente',
  'misterioso', 'la iluminacion', 'penumbra',
  'testimonio de', 'testimonio tangible', 'poder y riqueza', 'riqueza del',
  'fachada dorada', 'lujosa decoracion', 'lujosa', 'dorada fachada',
  'se alza majestuosamente', 'se alza imponente', 'imponente estructura', 'presencia imponente',
  'grandiosidad',
  'atmosphere', 'play of light', 'shadows', 'mysterious',
  'breathtaking', 'awe-inspiring',
  'atmosphere', 'jeu de lumiere', 'ombres', 'majestueux', 'imposant', 'mysterieux',
  'charme intemporel', 'temoin vivant', 'murmure du passe', "echos de l'histoire",
  'invite a imaginer', 'raconte une histoire', 'captiver chaque visiteur', 'joyau cache',
  'atmosphare', 'schatten', 'lichtspiel', 'majestatisch', 'imposant', 'geheimnisvoll',
  'zeitloser charme', 'lebendiger zeuge', 'flustern der vergangenheit', 'echos der geschichte',
  'ladt dich ein', 'erzahlt eine geschichte', 'in seinen bann', 'verborgenes juwel',
  'atmosfera', 'giochi di luce', 'ombre', 'maestoso', 'misterioso',
  'fascino senza tempo', 'testimone vivente', 'sussurro del passato', 'echi della storia',
  'invita a immaginare', 'racconta una storia', 'cattura ogni visitatore', 'gioiello nascosto',
  // Anti-meta-lenguaje: el modelo no debe mencionar sus limitaciones de datos
  'public sources are limited', 'records are limited', 'available records',
  'available public record', 'verified facts', 'unverified facts',
  'without adding unverified', 'cautious base', 'stay grounded',
  'sources are limited', 'records are sparse', 'available sources',
  'source limitations', 'available data', 'limited records',
  'sources publiques', 'donnees publiques', 'sources disponibles',
  'ne raconte pas toute', 'sans ajouter', 'non verifies',
  'donnees disponibles', 'sources limitees',
  'offentlichen angaben', 'ungeprufte', 'verfugbaren quellen',
  'begrenzten quellen', 'offentlichen quellen',
  'fonti pubbliche', 'senza inventare', 'fonti disponibili',
  'datos publicos', 'registros disponibles', 'fuentes publicas',
  'fuentes disponibles', 'datos disponibles',
];

/** Regex for Spanish formal-register markers that should never appear in "tú" narration. */
const FORMAL_REGISTER_RE = /\b(usted(es)?|miren|observen|fíjense|vean|suyo|su\s+alrededor|les\s+invito)\b/i;

/** Phrases that indicate an invalid end-of-tour transition in a non-last stop. */
const INVALID_END_PHRASES = [
  'final del recorrido', 'terminamos aquí', 'nuestra última parada',
  'para concluir el tour', 'final de nuestro paseo', 'llegado al final',
  'hemos terminado', 'se acaba aquí', 'fin del tour',
  'nuestro recorrido termina', 'despedimos aquí',
];

function hasInvalidTransition(section: string): string | null {
  const normalized = normalizeNFD(section);
  const match = INVALID_END_PHRASES.find(phrase => normalized.includes(phrase));
  return match ? `invalid-transition-${match.slice(0, 30)}` : null;
}

function hasBannedPhrase(section: string): string | null {
  const normalized = normalizeNFD(section);
  const match = BANNED_OUTPUT_PHRASES.find(phrase => normalized.includes(phrase));
  return match ? `banned-phrase-${match.slice(0, 30)}` : null;
}

function hasFormalRegister(section: string): string | null {
  return FORMAL_REGISTER_RE.test(section) ? 'formal-register' : null;
}

// ═══════════════════════════════════════════════════════════════════
// Fase 2 — Per-section unverified claim check (reuses 3-tier extractors)
// ═══════════════════════════════════════════════════════════════════

/** Lightweight per-section check: extracts critical claim types (date, architect,
 *  style, location) and flags any that are unverified or contradicted against the
 *  cached tiered corpus. Used inside the retry loop to catch invented facts. */
function hasUnverifiedClaim(
  section: string,
  input: LongNarrativePromptInput,
  corpus: TieredCorpus
): string | null {
  const whitelist = [input.localName, input.cityName, input.nextStopName].filter(Boolean) as string[];

  // Check dates (critical)
  const dates = extractDates(section);
  for (const d of dates) {
    const { found } = findClaimSource(normalizeNFD(d), 'date', corpus);
    if (!found) {
      narrativeLog('unverified-claim', { section: 'section', type: 'date', value: d });
      return `unverified-date:${d.slice(0, 30)}`;
    }
  }

  // Check styles (critical)
  const styles = extractStyles(section);
  for (const s of styles) {
    const { found } = findClaimSource(normalizeNFD(s), 'style', corpus);
    if (!found) {
      narrativeLog('unverified-claim', { section: 'section', type: 'style', value: s });
      return `unverified-style:${s.slice(0, 30)}`;
    }
  }

  // Check architects (critical)
  const architects = extractArchitects(section);
  for (const a of architects) {
    const { found } = findClaimSource(normalizeNFD(a), 'architect', corpus);
    if (!found) {
      narrativeLog('unverified-claim', { section: 'section', type: 'architect', value: a });
      return `unverified-architect:${a.slice(0, 30)}`;
    }
  }

  // Check locations (warning) — invented toponyms
  const locations = extractLocations(section, whitelist);
  for (const l of locations) {
    const { found } = findClaimSource(normalizeNFD(l), 'location', corpus);
    if (!found) {
      narrativeLog('unverified-claim', { section: 'section', type: 'location', value: l });
      return `unverified-location:${l.slice(0, 30)}`;
    }
  }

  return null;
}

function validateSection(section: string, input: LongNarrativePromptInput, name?: SectionName, corpus?: TieredCorpus): string | null {
  const count = wordCount(section);
  if (count < 45 || count > 140) return `word-count-${count}`;
  if (/^Visit .*, a notable (location|stop|place) /i.test(section)) return 'generic-shape';
  if (/^¡Hola!|^Hello!|^Bonjour!|^Hallo!/i.test(section)) return 'chatbot-opening';
  const banned = hasBannedPhrase(section);
  if (banned) return banned;
  if (hasRepetition(section)) return 'repetition';
  // Check invalid end-of-tour phrases in non-last stops
  if (input.position !== 'last') {
    const invalidTrans = hasInvalidTransition(section);
    if (invalidTrans) return invalidTrans;
  }
  if (!hasLanguageSignal(section, input.language)) return 'language-drift';
  if (/\b-?\d{1,3}\.\d{3,}\b/.test(section)) return 'coordinates';
  const unsupportedDrift = hasUnsupportedDrift(section, input);
  if (unsupportedDrift) return unsupportedDrift;
  if (input.language === 'es' || input.language?.startsWith('es-')) {
    const formal = hasFormalRegister(section);
    if (formal) return formal;
  }
  // Fase 2: Fact Card coverage check
  if (name) {
    const coverageGap = hasFactCoverageGap(section, input, name);
    if (coverageGap) return coverageGap;
  }
  // Fase 2: per-section unverified claim check (dates, architects, styles, locations)
  if (corpus) {
    const unverifiedClaim = hasUnverifiedClaim(section, input, corpus);
    if (unverifiedClaim) return unverifiedClaim;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Fase 2 — SECTION ANCHORS & FACT COVERAGE VALIDATOR
// ═══════════════════════════════════════════════════════════════════

const SECTION_ANCHORS: Record<SectionName, { categories: FactCategory[]; minCoverage: number }> = {
  history: {
    categories: ['year_built', 'architect', 'creator', 'style', 'heritage'],
    minCoverage: 3,
  },
  arrival: {
    categories: ['material', 'location'],
    minCoverage: 1,
  },
  significance: {
    categories: ['heritage', 'event'],
    minCoverage: 1,
  },
  transition: {
    categories: [],
    minCoverage: 0,
  },
};

function expandDateTerms(value: string): string[] {
  const terms = [value];
  const yearMatch = value.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    const century = Math.ceil(year / 100);
    terms.push(`siglo ${century}`);
    const romanNumerals: Record<number, string> = {
      1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii',
      9: 'ix', 10: 'x', 11: 'xi', 12: 'xii', 13: 'xiii', 14: 'xiv', 15: 'xv',
      16: 'xvi', 17: 'xvii', 18: 'xviii', 19: 'xix', 20: 'xx', 21: 'xxi',
    };
    if (romanNumerals[century]) terms.push(romanNumerals[century]);
  }
  return terms;
}

function expandFactTerms(value: string, category: FactCategory): string[] {
  const base = normalizeNFD(value).toLowerCase();
  const terms: string[] = [base];
  if (category === 'year_built') {
    terms.push(...expandDateTerms(value));
  }
  // Handle multi-values: "Filippo Juvarra y Juan Bautista Sachetti"
  const parts = value.split(/[,;]|\sy\s|\s&\s/);
  terms.push(...parts.map(p => normalizeNFD(p.trim()).toLowerCase()).filter(t => t.length > 2));
  return [...new Set(terms)];
}

function extractClaimsFromContext(input: LongNarrativePromptInput): Record<string, string> {
  if (input.seeds.wikidataClaims && Object.keys(input.seeds.wikidataClaims).length > 0) {
    return input.seeds.wikidataClaims;
  }
  // Fallback: extract from enrichedContext/wikipediaBody
  const context = input.seeds.enrichedContext || input.seeds.wikipediaBody || '';
  const claims: Record<string, string> = {};
  const yearMatch = context.match(/(\d{4})/g);
  if (yearMatch) claims['P571'] = yearMatch[0];
  const nameMatch = context.match(/diseñado por ([A-ZÁÉÍÓÚ][a-záéíóú]+ [A-ZÁÉÍÓÚ][a-záéíóú]+)/i);
  if (nameMatch) claims['P84'] = nameMatch[1];
  const styleMatch = context.match(/(barroco|gótico|renacentista|neoclásico|románico|modernista)[a-z]*/i);
  if (styleMatch) claims['P149'] = styleMatch[0];
  return claims;
}

function hasFactCoverageGap(section: string, input: LongNarrativePromptInput, name: SectionName): string | null {
  const anchors = SECTION_ANCHORS[name];
  if (!anchors || anchors.minCoverage === 0) return null;

  const claims = extractClaimsFromContext(input);
  const claimsByCategory = new Map<FactCategory, { propId: string; terms: string[] }[]>();

  for (const [propId, value] of Object.entries(claims)) {
    const category = PROP_TO_CATEGORY[propId];
    if (!category || !anchors.categories.includes(category)) continue;
    if (!claimsByCategory.has(category)) claimsByCategory.set(category, []);
    claimsByCategory.get(category)!.push({ propId, terms: expandFactTerms(value, category) });
  }

  const availableCategories = [...claimsByCategory.keys()];
  if (availableCategories.length === 0) return null;

  const effectiveMin = input.seedQuality === 'thin'
    ? Math.min(1, availableCategories.length)
    : anchors.minCoverage;

  const normalizedSection = normalizeNFD(section).toLowerCase();
  const requiredCount = Math.min(effectiveMin, availableCategories.length);

  const coveredCategories = availableCategories.filter(cat => {
    const entries = claimsByCategory.get(cat)!;
    return entries.some(entry =>
      entry.terms.some(term => normalizedSection.includes(term))
    );
  });

  if (coveredCategories.length < requiredCount) {
    const missingCategories = availableCategories.filter(c => !coveredCategories.includes(c));
    const missingPropIds = missingCategories.flatMap(c => claimsByCategory.get(c)!.map(e => e.propId));
    const missingLabels = missingCategories.map(c => {
      const langCode = input.language?.slice(0, 2)?.toLowerCase() || 'en';
      return categoryLabel(c, langCode);
    });
    // Log coverage metrics
    narrativeLog('fact-coverage-check', {
      section: name,
      requiredCount,
      coveredCount: coveredCategories.length,
      availableCount: availableCategories.length,
      missingProps: missingPropIds,
    });
    return `fact-coverage:${coveredCategories.length}/${requiredCount}:missing=${missingPropIds.join(',')}:labels=${missingLabels.join(',')}`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 3-Tier Factual Validator — VERIFIED / UNVERIFIED / CONTRADICTED
// ═══════════════════════════════════════════════════════════════════

const KNOWN_ARCHITECTURAL_STYLES = [
  'gótico', 'gótica', 'góticos', 'góticas', 'gotico', 'gotica', 'goticos', 'gotica',
  'renacentista', 'renacentistas',
  'barroco', 'barroca', 'barrocos', 'barrocas',
  'mudéjar', 'mudéjares', 'mudejar', 'mudejares',
  'románico', 'románica', 'románicos', 'románicas', 'romanico', 'romanica',
  'neoclásico', 'neoclásica', 'neoclásicos', 'neoclásicas', 'neoclasico', 'neoclasica',
  'modernista', 'modernistas',
  'herreriano', 'herreriana', 'herrerianos', 'herrerianas',
  'plateresco', 'plateresca', 'platerescos', 'platerescas',
  'visigodo', 'visigoda', 'visigodos', 'visigodas',
  'visigótico', 'visigótica', 'visigoticos', 'visigotica',
  'califal', 'califales',
  'almohade', 'almohades',
  'mozárabe', 'mozárabes', 'mozarabe', 'mozarabes',
  'isabelino', 'isabelina', 'isabelinos', 'isabelinas',
  'churrigueresco', 'churrigueresca',
];

const KNOWN_MATERIALS = [
  'granito', 'mármol', 'marmol', 'ladrillo', 'piedra caliza',
  'madera', 'hierro', 'acero', 'bronce', 'yeso',
  'pizarra', 'azulejo', 'cerámica', 'ceramica', 'adoquín', 'adoquin',
  'sillar', 'sillares', 'mampostería', 'mamposteria',
];

// ── 3-tier claim verification ────────────────────────────────────

type ClaimType = 'date' | 'style' | 'material' | 'measurement' | 'architect' | 'historical_person' | 'location';
type ClaimStatus = 'verified' | 'unverified' | 'contradicted';
type ClaimSeverity = 'critical' | 'warning' | 'info';

interface VerifiedClaim {
  type: ClaimType;
  value: string;
  status: ClaimStatus;
  severity: ClaimSeverity;
  source: string;          // e.g. 'wikidata:P571', 'wikipedia_body', 'wikidata:P149', 'none'
  context: string;         // snippet around the claim in generated text
}

interface ClaimCheckResult {
  claims: VerifiedClaim[];
  totalExtracted: number;
  verifiedCount: number;
  contradictedCount: number;
  unverifiedCount: number;
  criticalFailCount: number;
  warningCount: number;
  infoCount: number;
  // rates for dashboard
  verifiedRate: number;       // 0.0 – 1.0
  contradictedRate: number;   // 0.0 – 1.0  (true alarm)
  unverifiedRate: number;     // 0.0 – 1.0  (coverage gap)
}

// ── Severity map: which claim types cause hard-fail ──────────────

const SEVERITY_MAP: Record<ClaimType, { unverified: ClaimSeverity; contradicted: ClaimSeverity }> = {
  date:              { unverified: 'warning',  contradicted: 'critical' },
  architect:         { unverified: 'warning',  contradicted: 'critical' },
  historical_person: { unverified: 'warning',  contradicted: 'critical' },
  style:             { unverified: 'warning',  contradicted: 'critical' },
  material:          { unverified: 'info',     contradicted: 'warning' },
  measurement:       { unverified: 'info',     contradicted: 'warning' },
  location:          { unverified: 'warning',  contradicted: 'critical' },
};

// ── Extraction functions ─────────────────────────────────────────

function extractDates(text: string): string[] {
  const dates: string[] = [];
  const yearRe = /\b(\d{4})\b/g;
  let match;
  while ((match = yearRe.exec(text)) !== null) {
    const year = parseInt(match[1]);
    if (year >= 300 && year <= 2030) dates.push(match[1]);
  }
  const centuryRe = /\b(siglo\s+[IVXLCDM]+)\b/gi;
  while ((match = centuryRe.exec(text)) !== null) {
    dates.push(match[0]);
  }
  return [...new Set(dates)];
}

function extractStyles(text: string): string[] {
  const lower = normalizeNFD(text);
  const seen = new Set<string>();
  const styles: string[] = [];
  for (const s of KNOWN_ARCHITECTURAL_STYLES) {
    const n = normalizeNFD(s);
    if (lower.includes(n) && !seen.has(n)) {
      seen.add(n);
      styles.push(s);
    }
  }
  return styles;
}

function extractMaterials(text: string): string[] {
  const lower = normalizeNFD(text);
  return KNOWN_MATERIALS.filter(m => {
    const n = normalizeNFD(m);
    return lower.includes(n);
  });
}

function extractMeasurements(text: string): string[] {
  const measurements: string[] = [];
  const re = /\b(\d+(?:[.,]\d+)?)\s*(metros?|m\.|km\.|kilómetros?|hectáreas?|m²|m2)\b/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    measurements.push(match[0]);
  }
  return measurements;
}

function extractArchitects(text: string): string[] {
  const architects: string[] = [];
  const re = /(?:por|obra de|diseñad[oa] por|arquitecto[s]?|del arquitecto)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,4})/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim();
    if (!/^(el|la|los|las|su|un|una|este|esta|eso|aquel|cuando|donde|primera|segunda)\b/i.test(name)) {
      architects.push(name);
    }
  }
  return [...new Set(architects)];
}

function extractHistoricalPersons(text: string): string[] {
  const persons: string[] = [];
  // Named entities with context: "como X", "por X", "en tiempos de X", "según X"
  const re = /(?:como|por|en tiempos de|según|bajo|durante el reinado de|reinado de|época de)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim();
    if (!/^(el|la|los|las|su|un|una|este|esta|eso|aquel|cuando|donde|aqui|alli)\b/i.test(name)) {
      persons.push(name);
    }
  }
  return [...new Set(persons)];
}

function extractLocations(text: string, whitelist: string[]): string[] {
  const locations: string[] = [];
  const patterns = [
    // ES: "Plaza de Oriente", "Calle Mayor", "Palacio Real".
    /\b((?:Plaza|Calle|Barrio|Puerta|Fuente|Parque|Jard[ií]n|Paseo|Avenida|Glorieta|Ronda|Cuesta|Campo|Teatro|Museo|Palacio|Iglesia|Catedral|Bas[ií]lica|Monasterio|Convento|Torre|Puente|Estaci[oó]n|Mercado)\s+(?:(?:de|del|de\s+la|de\s+las|de\s+los)\s+)?[A-ZÁÉÍÓÚÑ][\p{L}'’-]+(?:\s+(?:(?:de|del|de\s+la|de\s+las|de\s+los)\s+)?[A-ZÁÉÍÓÚÑ][\p{L}'’-]+){0,3})\b/gu,
    // EN: "Royal Palace", "Main Street", "Hyde Park".
    /\b((?:Square|Street|Road|Avenue|Lane|Boulevard|Park|Garden|Gate|Fountain|Palace|Church|Cathedral|Basilica|Monastery|Convent|Tower|Bridge|Station|Market|Museum|Theatre|Theater|Castle)\s+(?:(?:of|the)\s+)?[A-Z][\p{L}'’-]+(?:\s+(?:(?:of|the)\s+)?[A-Z][\p{L}'’-]+){0,3})\b/gu,
    // FR: "Place Vendome", "Rue de Rivoli", "Palais Royal".
    /\b((?:Place|Rue|Avenue|Boulevard|Parc|Jardin|Porte|Fontaine|Palais|[ÉE]glise|Cath[ée]drale|Basilique|Monast[èe]re|Couvent|Tour|Pont|Gare|March[ée]|Mus[ée]e|Th[ée][aâ]tre|Ch[âa]teau)\s+(?:(?:de|du|des|d’|d'|la|le|les)\s+)?[A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ][\p{L}'’-]+(?:\s+(?:(?:de|du|des|d’|d'|la|le|les)\s+)?[A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ][\p{L}'’-]+){0,3})\b/gu,
    // DE: "Brandenburger Tor", "Museumsinsel", "Schloss Charlottenburg".
    /\b((?:Platz|Stra[ßs]e|Gasse|Allee|Park|Garten|Tor|Brunnen|Palast|Schloss|Kirche|Dom|Kathedrale|Basilika|Kloster|Turm|Br[üu]cke|Bahnhof|Markt|Museum|Theater)\s+(?:(?:von|der|die|das|am|im|zu|zum|zur)\s+)?[A-ZÄÖÜ][\p{L}'’-]+(?:\s+(?:(?:von|der|die|das|am|im|zu|zum|zur)\s+)?[A-ZÄÖÜ][\p{L}'’-]+){0,3})\b/gu,
    // IT: "Piazza Navona", "Via del Corso", "Palazzo Pitti".
    /\b((?:Piazza|Via|Viale|Corso|Vicolo|Parco|Giardino|Porta|Fontana|Palazzo|Chiesa|Cattedrale|Basilica|Monastero|Convento|Torre|Ponte|Stazione|Mercato|Museo|Teatro|Castello)\s+(?:(?:di|del|della|delle|degli|dei|da|d’|d'|la|il|le|lo|l’)\s+)?[A-ZÀÉÈÌÒÙ][\p{L}'’-]+(?:\s+(?:(?:di|del|della|delle|degli|dei|da|d’|d'|la|il|le|lo|l’)\s+)?[A-ZÀÉÈÌÒÙ][\p{L}'’-]+){0,3})\b/gu,
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const loc = match[1].trim();
      const norm = normalizeNFD(loc).toLowerCase();
      // Whitelist: skip locations that match POI name, city, or next stop
      const isWhitelisted = whitelist.some(w => normalizeNFD(w).toLowerCase().includes(norm) || norm.includes(normalizeNFD(w).toLowerCase()));
      if (!isWhitelisted) {
        locations.push(loc);
      }
    }
  }
  return [...new Set(locations)];
}

// ── Multi-source corpus builder (tiered confidence) ──────────────

interface TieredCorpus {
  high: string;      // Wikidata claims (highest confidence)
  medium: string;    // Wikipedia + POI-level enriched context
  low: string;       // Wikivoyage
  regional: string;  // City/region-level enriched context (cannot verify POI claims)
}

function buildTieredCorpus(seeds: LongNarrativeSeeds): TieredCorpus {
  // High: Wikidata claims only (structured, verified)
  const wikidataParts: string[] = [];
  if (seeds.wikidataClaims) {
    for (const v of Object.values(seeds.wikidataClaims)) {
      if (typeof v === 'string') wikidataParts.push(v);
    }
  }

  // Medium: Wikipedia + POI-level enriched context (can verify claims)
  const wikiParts: string[] = [];
  if (seeds.wikipediaLead) wikiParts.push(seeds.wikipediaLead);
  if (seeds.wikipediaBody) wikiParts.push(seeds.wikipediaBody);

  // Regional: city/comarca/province/region context (CANNOT verify POI claims)
  const regionalParts: string[] = [];

  if (seeds.enrichedContext) {
    // Parse level markers: --- DATOS DEL POI --- / --- CONTEXTO LOCAL --- / --- CONTEXTO REGIONAL ---
    // Pattern: \n--- LEVEL_HEADER ---\n followed by content until next header or end
    const LEVEL_RE = /^--- (DATOS DEL POI[^\n]*|CONTEXTO LOCAL[^\n]*|CONTEXTO REGIONAL[^\n]*|POI FACTS[^\n]*|LOCAL CONTEXT[^\n]*|REGIONAL BACKGROUND[^\n]*) ---$/;
    const lines = seeds.enrichedContext.split('\n');
    let currentLevel: 'poi' | 'regional' | 'none' = 'none';
    let currentChunk = '';

    for (const line of lines) {
      const m = line.trim().match(LEVEL_RE);
      if (m) {
        // Save previous chunk
        if (currentChunk.trim() && currentLevel !== 'none') {
          if (currentLevel === 'poi') {
            wikiParts.push(currentChunk.trim());
          } else {
            regionalParts.push(currentChunk.trim());
          }
        }
        // Determine new level
        const header = m[1];
        currentLevel = /DATOS DEL POI|POI FACTS/.test(header) ? 'poi' : 'regional';
        currentChunk = '';
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    // Save last chunk
    if (currentChunk.trim() && currentLevel !== 'none') {
      if (currentLevel === 'poi') {
        wikiParts.push(currentChunk.trim());
      } else {
        regionalParts.push(currentChunk.trim());
      }
    }
    
    // 🔥 CRITICAL: legacy content without level markers goes to regional (safe default)
    // It CANNOT verify POI claims because we don't know which level it belongs to
    if (currentLevel === 'none') {
      regionalParts.push(seeds.enrichedContext);
    }
  }

  // Low: Wikivoyage (travel guide, not factual-primary)
  const lowParts: string[] = [];
  if (seeds.wikivoyage) lowParts.push(seeds.wikivoyage);

  return {
    high: normalizeNFD(wikidataParts.join(' ')),
    medium: normalizeNFD(wikiParts.join(' ')),
    low: normalizeNFD(lowParts.join(' ')),
    regional: normalizeNFD(regionalParts.join(' ')),
  };
}

/** Extracts a short snippet around the claim for debugging. */
function claimContext(text: string, value: string): string {
  const idx = normalizeNFD(text).indexOf(normalizeNFD(value));
  if (idx < 0) return '';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + value.length + 30);
  return text.slice(start, end).replace(/\n/g, ' ');
}

// ── Source-specific claim search ──────────────────────────────────

/** Roman numeral to integer. Only handles I–XXI (1–21) for century matching. */
function romanToInt(roman: string): number {
  const map: Record<string, number> = {
    'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,
    'X':10,'XI':11,'XII':12,'XIII':13,'XIV':14,'XV':15,'XVI':16,
    'XVII':17,'XVIII':18,'XIX':19,'XX':20,'XXI':21,
  };
  return map[roman.toUpperCase()] || 0;
}

/** Expand a date claim value into multiple search variants.
 *  "siglo XIII" → ["siglo xiii", "1200", "1300", "13"]
 *  "1245"       → ["1245", "siglo xiii", "13"]
 *  This bridges the gap between narrative text (century names) and
 *  Wikidata corpus (numeric years). */
function expandDateSearchTerms(value: string): string[] {
  const n = normalizeNFD(value);
  const terms = [n];

  // "siglo XIII" → also search for numeric year range
  const sigloMatch = n.match(/\bsiglo\s+(x{0,3}(?:ix|iv|v?i{0,3}))\b/i);
  if (sigloMatch) {
    const century = romanToInt(sigloMatch[1]);
    if (century > 0) {
      const startYear = (century - 1) * 100;
      const endYear = century * 100;
      terms.push(`${startYear}`, `${endYear}`, `${century}`);
    }
  }

  // "1245" → also search for corresponding century name
  const yearMatch = n.match(/\b(\d{4})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year >= 300 && year <= 2030) {
      const century = Math.ceil(year / 100);
      const roman = Object.entries({
        'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,
        'X':10,'XI':11,'XII':12,'XIII':13,'XIV':14,'XV':15,'XVI':16,
        'XVII':17,'XVIII':18,'XIX':19,'XX':20,'XXI':21,
      }).find(([_, v]) => v === century)?.[0];
      if (roman) {
        terms.push(`siglo ${roman.toLowerCase()}`);
        terms.push(`${century}`);
      }
    }
  }

  return terms;
}

/** Search for a value across tiered corpora. Returns the tier where first found.
 *  For date/architect/historical_person: Wikidata (high) + Wikipedia (medium) only.
 *  For style: Wikidata + Wikipedia + enrichedContext.
 *  For material/measurement: all sources. */
function findClaimSource(
  normalizedValue: string,
  claimType: ClaimType,
  corpus: TieredCorpus
): { found: boolean; tier: string } {
  // For dates, expand century/year variants before searching
  const searchTerms = claimType === 'date'
    ? expandDateSearchTerms(normalizedValue)
    : [normalizedValue];

  // Always check Wikidata first (structured facts)
  for (const term of searchTerms) {
    if (corpus.high.includes(term)) {
      return { found: true, tier: 'wikidata' };
    }
  }

  // Wikipedia/enrichedContext — always relevant for styles, dates, architects
  for (const term of searchTerms) {
    if (corpus.medium.includes(term)) {
      return { found: true, tier: 'wikipedia' };
    }
  }

  // Wikivoyage — only for material/measurement (descriptive, not authorative)
  if (claimType === 'material' || claimType === 'measurement') {
    for (const term of searchTerms) {
      if (corpus.low.includes(term)) {
        return { found: true, tier: 'wikivoyage' };
      }
    }
  }

  return { found: false, tier: 'none' };
}

// ── Contradiction detection ───────────────────────────────────────

/** Maps style variants (gender/number) to a canonical root form.
 *  e.g., "visigodo"/"visigoda"/"visigodos" → "visigod"
 *        "gótico"/"gótica"/"góticos"     → "gotic"
 *  Uses the KNOWN_ARCHITECTURAL_STYLES list to group variants by
 *  their shortest unaccented form. */
const STYLE_CANONICAL_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const style of KNOWN_ARCHITECTURAL_STYLES) {
    const n = normalizeNFD(style);
    // The canonical root is the shortest variant (typically masculine singular
    // or the base form), stripped of trailing -o/-a/-os/-as/-es
    let root = n.replace(/([oa]s?|es)$/, '');
    // If stripping removed everything, fall back to original
    if (root.length < 3) root = n;
    map[n] = root;
  }
  return map;
})();

function styleCanonicalRoot(style: string): string {
  const n = normalizeNFD(style);
  // Known style: use precomputed canonical root
  if (STYLE_CANONICAL_MAP[n]) return STYLE_CANONICAL_MAP[n];
  // Unknown style: heuristic strip of gender/number suffixes
  return n.replace(/([oa]s?|es)$/, '');
}

/** Check if a claim directly contradicts known facts.
 *  Example: generated says "1911" but Wikidata says "1910" → contradicted.
 *  Example: generated says "barroco" but Wikidata says "neoclásico" → contradicted. */
function isContradicted(
  generatedValue: string,
  claimType: ClaimType,
  corpus: TieredCorpus
): boolean {
  const norm = normalizeNFD(generatedValue);

  // For dates: if a different year is present in high-confidence corpus, it's a contradiction
  if (claimType === 'date') {
    const genYear = parseInt(generatedValue);
    if (!isNaN(genYear) && genYear >= 300 && genYear <= 2030) {
      // Extract all years from high and medium corpus
      const allYears = new Set<number>();
      const yearRe = /\b(\d{4})\b/g;
      let m;
      const combinedHighMed = `${corpus.high} ${corpus.medium}`;
      while ((m = yearRe.exec(combinedHighMed)) !== null) {
        const y = parseInt(m[1]);
        if (y >= 300 && y <= 2030) allYears.add(y);
      }
      // If corpus has at least one date in range, check proximity
      if (allYears.size > 0) {
        // Find closest year in corpus
        let closest = Infinity;
        for (const cy of allYears) {
          const dist = Math.abs(genYear - cy);
          if (dist < closest) closest = dist;
        }
        // If generated year is >50 years away from any corpus year, it's contradicted
        // (50-year window accounts for "siglo XVI" ≈ 1501–1600 range)
        return closest > 50;
      }
    }
    return false;
  }

  // For style: only contradicted if corpus has style data but NONE of the
  // claim's gender/number variants appear. Multiple styles can coexist on
  // a single building (e.g., gótico + visigodo + románico), so presence
  // of a different style does NOT contradict the claim.
  if (claimType === 'style') {
    // Collect all style variants present in the high-confidence corpus
    const corpusStyleRoots = new Set<string>();
    for (const knownStyle of KNOWN_ARCHITECTURAL_STYLES) {
      const ksNorm = normalizeNFD(knownStyle);
      if (corpus.high.includes(ksNorm)) {
        corpusStyleRoots.add(styleCanonicalRoot(knownStyle));
      }
    }
    // No style data in corpus → can't contradict
    if (corpusStyleRoots.size === 0) return false;

    // The claim is only contradicted if its canonical root doesn't match
    // any style root found in the corpus
    const claimRoot = styleCanonicalRoot(generatedValue);
    return !corpusStyleRoots.has(claimRoot);
  }

  // For architect: if corpus names a different architect → contradicted
  if (claimType === 'architect') {
    // Look for proper-name patterns in the high-confidence corpus
    const nameRe = /(?:arquitecto|architect|designed by|obra de|diseñad[oa] por)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,4})/gi;
    let m;
    const corpusArchitects = new Set<string>();
    while ((m = nameRe.exec(corpus.high + ' ' + corpus.medium)) !== null) {
      corpusArchitects.add(normalizeNFD(m[1].trim()));
    }
    if (corpusArchitects.size > 0 && !corpusArchitects.has(norm)) {
      return true; // corpus names a different architect
    }
    return false;
  }

  return false;
}

// ── Main claim validation ─────────────────────────────────────────

/** Detects transition language — claims made while the narrator is
 *  bridging to the NEXT stop, not describing the current one.
 *  "una joya gótica que nos espera" → the "gótica" refers to the upcoming
 *  Cocatedral, not the current baroque Llotja. These claims should never
 *  be flagged as CONTRADICTED because they describe a different POI. */
function isTransitionContext(context: string): boolean {
  const n = normalizeNFD(context);
  const markers = [
    'nos espera', 'nos dirigimos', 'vamos a ', 'a continuacion',
    'siguiente parada', 'siguiente destino', 'visitaremos',
    'nos recibe', 'te espera', 'caminemos hacia', 'hacia ',
    'proxima parada', 'proximo destino',
  ];
  for (const marker of markers) {
    if (n.includes(marker)) return true;
  }
  return false;
}

/** Post-generation 3-tier factual validation.
 *  Extracts claims from generated narration, checks each against tiered
 *  seed corpora, and classifies as VERIFIED, UNVERIFIED, or CONTRADICTED
 *  with appropriate severity. */
function validateNarrativeClaims(
  narration: string,
  input: LongNarrativePromptInput
): ClaimCheckResult {
  const corpus = buildTieredCorpus(input.seeds);

  // Extract all claims by type
  const whitelist = [input.localName, input.cityName, input.nextStopName].filter(Boolean) as string[];
  const extracted: Record<ClaimType, string[]> = {
    date: extractDates(narration),
    style: extractStyles(narration),
    material: extractMaterials(narration),
    measurement: extractMeasurements(narration),
    architect: extractArchitects(narration),
    historical_person: extractHistoricalPersons(narration),
    location: extractLocations(narration, whitelist),
  };

  const claims: VerifiedClaim[] = [];
  let totalExtracted = 0;

  for (const [claimType, values] of Object.entries(extracted) as [ClaimType, string[]][]) {
    const type = claimType;
    const severityRules = SEVERITY_MAP[type];

    for (const value of values) {
      totalExtracted++;
      const normValue = normalizeNFD(value);
      const { found, tier } = findClaimSource(normValue, type, corpus);
      const ctx = claimContext(narration, value);
      // If a claim is in transition context (describing the NEXT stop),
      // never flag it as contradicted — it's about a different POI
      const contradicted = !found && !isTransitionContext(ctx)
        && isContradicted(value, type, corpus);

      let status: ClaimStatus;
      let severity: ClaimSeverity;

      if (found) {
        status = 'verified';
        severity = 'info'; // verified claims are always info-level (expected)
      } else if (contradicted) {
        status = 'contradicted';
        severity = severityRules.contradicted;
      } else {
        status = 'unverified';
        severity = severityRules.unverified;
      }

      claims.push({
        type,
        value,
        status,
        severity,
        source: found ? tier : 'none',
        context: ctx,
      });
    }
  }

  // Aggregate counts
  const verified = claims.filter(c => c.status === 'verified');
  const contradicted = claims.filter(c => c.status === 'contradicted');
  const unverified = claims.filter(c => c.status === 'unverified');
  const criticalFails = claims.filter(c => c.severity === 'critical');
  const warnings = claims.filter(c => c.severity === 'warning');
  const infos = claims.filter(c => c.severity === 'info');

  return {
    claims,
    totalExtracted,
    verifiedCount: verified.length,
    contradictedCount: contradicted.length,
    unverifiedCount: unverified.length,
    criticalFailCount: criticalFails.length,
    warningCount: warnings.length,
    infoCount: infos.length,
    verifiedRate: totalExtracted > 0 ? verified.length / totalExtracted : 0,
    contradictedRate: totalExtracted > 0 ? contradicted.length / totalExtracted : 0,
    unverifiedRate: totalExtracted > 0 ? unverified.length / totalExtracted : 0,
  };
}

function parseSection(content: string): string | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return typeof parsed.section === 'string' ? parsed.section.trim() : null;
  } catch {
    return null;
  }
}

const FALLBACK_FACT_ORDER = ['P571', 'P1619', 'P84', 'P170', 'P149', 'P1435', 'P186', 'P2048', 'P276', 'P793'];

function fallbackFactSummary(input: LongNarrativePromptInput): string {
  const claims = input.seeds.wikidataClaims || {};
  const facts = Object.entries(claims)
    .filter(([propId, value]) => Boolean(PROP_TO_CATEGORY[propId] && value?.trim()))
    .sort(([a], [b]) => {
      const ai = FALLBACK_FACT_ORDER.indexOf(a);
      const bi = FALLBACK_FACT_ORDER.indexOf(b);
      return (ai === -1 ? FALLBACK_FACT_ORDER.length : ai) - (bi === -1 ? FALLBACK_FACT_ORDER.length : bi);
    })
    .slice(0, 4)
    .map(([propId, value]) => `${categoryLabel(PROP_TO_CATEGORY[propId], input.language)}: ${value.trim()}`);

  return facts.join('; ');
}

function fallbackSection(name: SectionName, input: LongNarrativePromptInput, reason: string): string {
  const code = input.language.slice(0, 2).toLowerCase();
  const tagSummary = Object.entries(input.seeds.osmTags || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'limited public tags';
  const factSummary = fallbackFactSummary(input);
  const nextStop = input.nextStopName || 'the next stop';
  const cityName = input.cityName || 'this city';

  if (name === 'transition' && input.position === 'last') {
    if (code === 'es') {
      return `Gracias por caminar conmigo por ${input.cityName || 'esta ciudad'}. En este recorrido de ${input.theme}, has visto cómo la ciudad se lee a través de sus espacios, su arquitectura y su vida cotidiana. Que disfrutes el resto de tu visita.`;
    }
    if (code === 'fr') {
      return `Merci d'avoir marché avec moi dans ${input.cityName || 'cette ville'}. Pendant cette visite de ${input.theme}, vous avez observé des lieux où l'architecture, l'espace urbain et la vie quotidienne se croisent. Je vous souhaite une belle suite de visite.`;
    }
    if (code === 'de') {
      return `Danke, dass Sie mit mir durch ${input.cityName || 'diese Stadt'} gegangen sind. Auf dieser ${input.theme}-Tour haben Sie Orte gesehen, an denen sich Architektur, Stadtraum und Alltagsleben begegnen. Ich wünsche Ihnen noch einen schönen Aufenthalt.`;
    }
    return `Thank you for walking with me through ${input.cityName || 'this city'}. On this ${input.theme} tour, you have seen places where architecture, urban space, and everyday life come together. I hope the rest of your visit is warm and memorable.`;
  }

  if (code === 'es') {
    if (name === 'arrival') {
      if (factSummary) {
        return `Llegamos a ${input.localName}, una parada de ${input.theme} en ${cityName}. El punto de partida es concreto: ${factSummary}. Fíjate en cómo esos datos ayudan a leer el lugar antes de seguir con la ruta.`;
      }
      return `Llegamos a ${input.localName}, una parada de ${input.theme} en ${cityName}. Este lugar forma parte del tejido urbano, y sus detalles visibles —${tagSummary}— invitan a leer la ciudad con atención.`;
    }
    if (name === 'history') {
      if (factSummary) {
        return `${input.localName} se entiende mejor desde estos datos: ${factSummary}. No hace falta adornarlo; esas referencias bastan para situar el lugar dentro de la historia urbana de ${cityName}.`;
      }
      return `${input.localName} se inscribe en la trama de ${cityName} a través de señales como ${tagSummary}. Su valor no está en una gran fecha, sino en cómo el espacio ha acompañado el crecimiento y la transformación de la ciudad.`;
    }
    if (name === 'significance') {
      if (factSummary) {
        return `Dentro de este recorrido por ${input.theme}, ${input.localName} aporta una referencia precisa: ${factSummary}. Esa base permite entender su valor sin recurrir a elogios genéricos.`;
      }
      return `Dentro de este recorrido por ${input.theme}, ${input.localName} ayuda a entender cómo se ha ido tejiendo ${cityName}: espacio, uso y memoria cotidiana se encuentran aquí sin necesidad de un gran anuncio.`;
    }
    return `Desde aquí seguimos hacia ${nextStop}. Cada parada añade un matiz distinto sobre ${input.theme} en ${cityName}.`;
  }

  if (code === 'fr') {
    if (name === 'arrival') {
      if (factSummary) {
        return `Nous arrivons à ${input.localName}, une étape de ${input.theme} dans ${cityName}. Le point d'appui est précis: ${factSummary}. Ces repères aident à lire le lieu avant de poursuivre la visite.`;
      }
      return `Nous arrivons à ${input.localName}, une étape de ${input.theme} dans ${cityName}. Depuis ce point, la ville se lit à hauteur de marche: le rythme de la rue, l'échelle des façades et les usages quotidiens donnent déjà le ton de la visite.`;
    }
    if (name === 'history') {
      if (factSummary) {
        return `${input.localName} se comprend mieux à partir de ces repères: ${factSummary}. Ils suffisent à situer le lieu dans l'histoire urbaine de ${cityName}, sans l'alourdir d'effets.`;
      }
      return `Autour de ${input.localName}, les indices disponibles (${tagSummary}) suffisent à poser le regard: ce n'est pas un décor isolé, mais un morceau de ville où se croisent circulation, architecture et vie quotidienne.`;
    }
    if (name === 'significance') {
      if (factSummary) {
        return `Dans cette visite de ${input.theme}, ${input.localName} apporte des repères concrets: ${factSummary}. C'est par ces éléments que le lieu prend sa place dans la mémoire de ${cityName}.`;
      }
      return `Dans cette visite, ${input.localName} aide à comprendre ${cityName} par petites touches: l'espace, les usages et la mémoire urbaine se rejoignent ici sans avoir besoin d'une grande annonce historique.`;
    }
    return `Depuis ce point, nous continuons vers ${nextStop}. Gardez en tête cette manière de lire la ville par ses détails: elle donnera une autre résonance au prochain arrêt.`;
  }
  if (code === 'de') {
    if (name === 'arrival') {
      if (factSummary) {
        return `Wir erreichen ${input.localName}, einen Abschnitt dieser ${input.theme}-Tour in ${cityName}. Der konkrete Ausgangspunkt lautet: ${factSummary}. Diese Angaben helfen, den Ort vor dem Weitergehen genauer zu lesen.`;
      }
      return `Wir erreichen ${input.localName}, einen Abschnitt dieser ${input.theme}-Tour in ${cityName}. Von hier aus lässt sich die Stadt im Gehen lesen: der Rhythmus der Straße, die Maßstäbe der Fassaden und der alltägliche Gebrauch geben den Ton der Führung vor.`;
    }
    if (name === 'history') {
      if (factSummary) {
        return `${input.localName} wird durch diese Angaben greifbarer: ${factSummary}. Sie reichen aus, um den Ort in der Stadtgeschichte von ${cityName} zu verorten, ohne ihn auszuschmücken.`;
      }
      return `Rund um ${input.localName} genügen die Hinweise (${tagSummary}), um den Blick zu schärfen: kein isoliertes Dekor, sondern ein Stück Stadt, in dem sich Verkehr, Architektur und Alltagsleben kreuzen.`;
    }
    if (name === 'significance') {
      if (factSummary) {
        return `Auf dieser ${input.theme}-Tour bringt ${input.localName} konkrete Anhaltspunkte mit: ${factSummary}. Genau diese Angaben erklären seinen Platz im Gedächtnis von ${cityName}.`;
      }
      return `In diesem Rundgang hilft ${input.localName}, ${cityName} in kleinen Schritten zu verstehen: Raum, Nutzung und städtisches Gedächtnis treffen hier zusammen, ohne dass es einer großen historischen Ansage bedarf.`;
    }
    return `Von hier gehen wir weiter zu ${nextStop}. Behalten Sie diesen lesenden Blick auf die Stadt im Kopf — er wird dem nächsten Halt eine andere Resonanz geben.`;
  }
  if (name === 'arrival') {
    if (factSummary) {
      return `We arrive at ${input.localName}, a ${input.theme} stop in ${cityName}. The concrete anchors are ${factSummary}. Use those details to read the place before we continue through the route.`;
    }
    return `We arrive at ${input.localName}, a ${input.theme} stop in ${cityName}. From here, the city reads at walking height: the rhythm of the street, the scale of the facades, and the everyday uses already set the tone for this visit.`;
  }
  if (name === 'history') {
    if (factSummary) {
      return `${input.localName} becomes clearer through these facts: ${factSummary}. They are enough to place the site within the urban history of ${cityName} without adding decorative claims.`;
    }
    return `Around ${input.localName}, the available clues (${tagSummary}) are enough to sharpen the eye: not an isolated backdrop, but a piece of city where movement, architecture, and daily life intersect.`;
  }
  if (name === 'significance') {
    if (factSummary) {
      return `On this ${input.theme} walk, ${input.localName} contributes concrete anchors: ${factSummary}. Those details explain its value more clearly than broad praise would.`;
    }
    return `On this walk, ${input.localName} helps make sense of ${cityName} in small steps: space, use, and urban memory meet here without needing a grand historical announcement.`;
  }
  return `From here, we continue toward ${nextStop}. Keep this way of reading the city through its details in mind — it will give the next stop a different resonance.`;
}

async function generateSection(
  name: SectionName,
  buildPrompt: (input: LongNarrativePromptInput) => SectionPrompt,
  input: LongNarrativePromptInput,
  traceId: string,
  debugTrace?: NarrativeDebugTrace
): Promise<{ name: SectionName; section: string | null; droppedReason?: string }> {
  let lastReason = 'unknown';
  let missingFacts: string[] | undefined;
  // Fase 2: build tiered corpus once per section (cached for retry loop)
  const corpus = buildTieredCorpus(input.seeds);
  for (let attempt = 0; attempt < 1; attempt++) {
    const promptInput = { ...input, retry: attempt > 0, missingFacts };
    // Fase 2.6: per-section temperature calibration (lowered arrival+sig)
    const sectionTemps: Record<SectionName, [number, number]> = {
      history: [0.2, 0.15],
      significance: [0.35, 0.2],
      arrival: [0.4, 0.25],
      transition: [0.5, 0.3],
    };
    const [temp1, temp2] = sectionTemps[name] || [0.4, 0.25];
    const prompt = buildPrompt(promptInput);
    const modelOptions = {
      model: NARRATIVE_MODEL,
      temperature: attempt > 0 ? temp2 : temp1,
      max_tokens: input.seedQuality === 'thin' ? 180 : 200,
      think: false,
      format: 'json' as const,
    };
    const startedAt = Date.now();
    const response = await model.chat({
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      model: modelOptions.model,
      temperature: modelOptions.temperature,
      max_tokens: modelOptions.max_tokens,
      think: modelOptions.think,
      format: modelOptions.format,
    });
    const durationMs = response.metadata?.durationMs ?? Date.now() - startedAt;

    const attemptTrace: SectionAttemptTrace = {
      section: name,
      attempt: attempt + 1,
      ...(narrativeDebug ? { systemPrompt: prompt.system, userPrompt: prompt.user } : {}),
      modelOptions,
      ...(narrativeDebug ? { rawLlmResponse: response.content } : {}),
      durationMs,
      done_reason: response.metadata?.done_reason,
      eval_count: response.metadata?.eval_count,
      success: false,
    };

    if (!response.success || !response.content) {
      lastReason = response.error || 'empty-response';
      attemptTrace.error = lastReason;
      debugTrace?.attempts.push(attemptTrace);
      narrativeLog('section-attempt', {
        traceId,
        section: name,
        attempt: attempt + 1,
        temperature: modelOptions.temperature,
        max_tokens: modelOptions.max_tokens,
        num_predict: response.metadata?.num_predict ?? modelOptions.max_tokens,
        durationMs,
        parseSuccess: false,
        validationFailures: [lastReason],
        fallbackUsed: false,
        model: modelOptions.model,
      });
      continue;
    }

    const section = parseSection(response.content);
    if (!section) {
      lastReason = 'json-parse';
      attemptTrace.parseResult = null;
      attemptTrace.parseError = lastReason;
      debugTrace?.attempts.push(attemptTrace);
      narrativeLog('section-attempt', {
        traceId,
        section: name,
        attempt: attempt + 1,
        temperature: modelOptions.temperature,
        max_tokens: modelOptions.max_tokens,
        num_predict: response.metadata?.num_predict ?? modelOptions.max_tokens,
        durationMs,
        parseSuccess: false,
        validationFailures: [lastReason],
        fallbackUsed: false,
        model: modelOptions.model,
      });
      continue;
    }

    const validationError = validateSection(section, input, name, corpus);
    attemptTrace.parseResult = section;
    attemptTrace.validationFailure = validationError;
    attemptTrace.wordCount = wordCount(section);
    attemptTrace.success = !validationError;
    debugTrace?.attempts.push(attemptTrace);
    narrativeLog('section-attempt', {
      traceId,
      section: name,
      attempt: attempt + 1,
      temperature: modelOptions.temperature,
      max_tokens: modelOptions.max_tokens,
      num_predict: response.metadata?.num_predict ?? modelOptions.max_tokens,
      durationMs,
      parseSuccess: true,
      validationFailures: validationError ? [validationError] : [],
      validationType: validationError?.startsWith('fact-coverage') ? 'coverage' : validationError?.startsWith('banned') ? 'banned' : 'other',
      wordCount: attemptTrace.wordCount,
      fallbackUsed: false,
      model: modelOptions.model,
    });
    if (!validationError) return { name, section };
    lastReason = validationError;
    // Fase 2: if coverage gap, store missing fact labels locally for retry (don't mutate input)
    if (validationError.startsWith('fact-coverage:')) {
      const labelsMatch = validationError.match(/labels=([^)]+)/);
      if (labelsMatch) {
        missingFacts = labelsMatch[1].split(',');
      }
    }
  }

  const fallbackText = fallbackSection(name, input, lastReason);
  debugTrace?.fallbacks.push({ section: name, reason: lastReason, text: fallbackText });
  narrativeLog('section-fallback', { traceId, section: name, reason: lastReason, wordCount: wordCount(fallbackText) });
  return { name, section: fallbackText, droppedReason: `${name}:${lastReason}:fallback` };
}

router.post('/stop/long', async (req, res) => {
  try {
    const input = req.body as TraceInput;
    if (!input.localName || !input.language || !input.theme || !input.position) {
      return res.status(400).json({
        error: { message: 'Missing required fields: localName, language, theme, position' },
      });
    }

    input.seeds = input.seeds || { osmTags: {} };
    input.seeds.osmTags = input.seeds.osmTags || {};
    const traceId = input.traceId || crypto.randomUUID();
    const requestStartedAt = Date.now();
    const policy = policyFor(input);
    input.seedQuality = policy.seedQuality;
    input.targetWords = policy.targetWords;

    narrativeLog('request-received', {
      traceId,
      stopName: input.localName,
      position: input.position,
      language: input.language,
      theme: input.theme,
      seedSizes: seedSizes(input),
      seedQuality: policy.seedQuality,
      richThinPolicy: policy.seedQuality,
      sectionNames: policy.sectionNames,
      model: NARRATIVE_MODEL,
      targetWords: policy.targetWords,
    });

    const debugTrace: NarrativeDebugTrace | undefined = narrativeDebug ? {
      traceId,
      localName: input.localName,
      cityName: input.cityName,
      position: input.position,
      language: input.language,
      theme: input.theme,
      seedSizes: seedSizes(input),
      seeds: input.seeds,
      policy,
      attempts: [],
      fallbacks: [],
    } : undefined;

    const promptBuilders: Record<SectionName, (input: LongNarrativePromptInput) => SectionPrompt> = {
      arrival: arrivalPrompt,
      history: historyPrompt,
      significance: significancePrompt,
      transition: transitionPrompt,
    };
    const ordered = await Promise.all(
      policy.sectionNames.map(sectionName => generateSection(sectionName, promptBuilders[sectionName], input, traceId, debugTrace))
    );
    const sections = Object.fromEntries(
      ordered.filter(item => item.section).map(item => [item.name, item.section])
    ) as Record<string, string>;
    const droppedReasons = ordered
      .map(item => item.droppedReason)
      .filter((reason): reason is string => Boolean(reason));
    const narration = ordered
      .map(item => item.section)
      .filter((section): section is string => Boolean(section))
      .join('\n\n');
    const totalDurationMs = Date.now() - requestStartedAt;

    // ── Post-generation 3-tier claim validation ──────────────────
    const claimCheck = validateNarrativeClaims(narration, input);
    narrativeLog('claim-check', {
      traceId,
      stopName: input.localName,
      position: input.position,
      totalExtracted: claimCheck.totalExtracted,
      verified: claimCheck.verifiedCount,
      contradicted: claimCheck.contradictedCount,
      unverified: claimCheck.unverifiedCount,
      criticalFails: claimCheck.criticalFailCount,
      warnings: claimCheck.warningCount,
      infos: claimCheck.infoCount,
      verifiedRate: claimCheck.verifiedRate,
      contradictedRate: claimCheck.contradictedRate,
      unverifiedRate: claimCheck.unverifiedRate,
      ...(claimCheck.contradictedCount > 0 ? { contradictedClaims: claimCheck.claims.filter(c => c.status === 'contradicted') } : {}),
      ...(claimCheck.criticalFailCount > 0 ? { criticalClaims: claimCheck.claims.filter(c => c.severity === 'critical') } : {}),
    });

    narrativeLog('summary', {
      traceId,
      stopName: input.localName,
      position: input.position,
      language: input.language,
      theme: input.theme,
      sectionsGenerated: Object.keys(sections).length,
      sectionsFallbacked: droppedReasons.length,
      totalDurationMs,
      droppedReasons,
    });

    if (debugTrace) {
      debugTrace.finalSections = sections;
      debugTrace.narrationPreview = narration.slice(0, 500);
      debugTrace.totalDurationMs = totalDurationMs;
      debugTrace.droppedReasons = droppedReasons;
      await writeDebugTrace(debugTrace);
    }

    res.json({
      sections,
      narration,
      meta: {
        traceId,
        seedQuality: policy.seedQuality,
        targetWords: policy.seedQuality === 'rich' ? '280-360' : '100-160',
        sectionsGenerated: Object.keys(sections).length,
        sectionsFallbacked: droppedReasons.length,
        totalSeedChars: totalSeedChars(input),
        totalDurationMs,
        claimCheck: {
          totalExtracted: claimCheck.totalExtracted,
          verifiedRate: claimCheck.verifiedRate,
          contradictedRate: claimCheck.contradictedRate,
          unverifiedRate: claimCheck.unverifiedRate,
          verifiedCount: claimCheck.verifiedCount,
          contradictedCount: claimCheck.contradictedCount,
          unverifiedCount: claimCheck.unverifiedCount,
          criticalFailCount: claimCheck.criticalFailCount,
          warningCount: claimCheck.warningCount,
          infoCount: claimCheck.infoCount,
          ...(claimCheck.totalExtracted > 0 ? { claims: claimCheck.claims } : {}),
        },
        ...(droppedReasons.length > 0 ? { droppedReasons } : {}),
      },
    });
  } catch (error) {
    console.error('[narrativeLong] generation error:', error);
    res.json({
      sections: {},
      narration: '',
      meta: { sectionsGenerated: 0, droppedReasons: ['handler-error'] },
    });
  }
});

export default router;
