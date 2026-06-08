import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { model } from '../llm/model';
import { arrivalPrompt } from '../prompts/narrative/arrival';
import { historyPrompt } from '../prompts/narrative/history';
import { significancePrompt } from '../prompts/narrative/significance';
import { transitionPrompt } from '../prompts/narrative/transition';
import { LongNarrativePromptInput, LongNarrativeSeeds, SectionPrompt } from '../prompts/narrative/types';
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

function validateSection(section: string, input: LongNarrativePromptInput): string | null {
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

type ClaimType = 'date' | 'style' | 'material' | 'measurement' | 'architect' | 'historical_person';
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
  const extracted: Record<ClaimType, string[]> = {
    date: extractDates(narration),
    style: extractStyles(narration),
    material: extractMaterials(narration),
    measurement: extractMeasurements(narration),
    architect: extractArchitects(narration),
    historical_person: extractHistoricalPersons(narration),
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

function fallbackSection(name: SectionName, input: LongNarrativePromptInput, reason: string): string {
  const code = input.language.slice(0, 2).toLowerCase();
  const tagSummary = Object.entries(input.seeds.osmTags || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'limited public tags';
  const nextStop = input.nextStopName || 'the next stop';
  const cityName = input.cityName || 'this city';

  if (name === 'transition' && input.position === 'last') {
    if (code === 'es') {
      return `Gracias por caminar conmigo por ${input.cityName || 'esta ciudad'}. En este recorrido de ${input.theme}, has recorrido lugares que cuentan la historia de Madrid a través de su arquitectura, sus calles y su vida cotidiana. Que disfrutes el resto de tu visita.`;
    }
    if (code === 'fr') {
      return `Merci d'avoir marché avec moi dans ${input.cityName || 'cette ville'}. Pendant cette visite de ${input.theme}, vous avez observé des lieux aux sources parfois limitées, mais bien ancrés dans l'histoire locale. Je vous souhaite une belle suite de visite.`;
    }
    if (code === 'de') {
      return `Danke, dass Sie mit mir durch ${input.cityName || 'diese Stadt'} gegangen sind. Auf dieser ${input.theme}-Tour haben Sie Orte mit begrenzten öffentlichen Angaben, aber echten Spuren lokaler Geschichte gesehen. Ich wünsche Ihnen noch einen schönen Aufenthalt.`;
    }
    return `Thank you for walking with me through ${input.cityName || 'this city'}. On this ${input.theme} tour, you have seen places with limited public records but real traces of local history. I hope the rest of your visit is warm and memorable.`;
  }

  if (code === 'es') {
    if (name === 'arrival') {
      return `Llegamos a ${input.localName}, una parada de ${input.theme} en ${cityName}. Este lugar forma parte del tejido urbano madrileño desde hace siglos, y sus detalles visibles —${tagSummary}— permiten leer la ciudad con atención.`;
    }
    if (name === 'history') {
      return `Los registros disponibles sobre ${input.localName} recogen ${tagSummary}. Aunque los datos públicos no lo cuentan todo, lo que sí es verificable es su papel dentro de la trama urbana: un espacio que ha sido testigo del crecimiento y la transformación de ${cityName}.`;
    }
    if (name === 'significance') {
      return `Dentro de este recorrido por ${input.theme}, ${input.localName} es una pieza clave del mosaico local. Su presencia ayuda a entender cómo se ha ido tejiendo ${cityName} a lo largo del tiempo, sumando capas de historia, arquitectura y vida cotidiana.`;
    }
    return `Desde aquí seguimos hacia ${nextStop}. El recorrido continúa sumando perspectivas: cada parada añade un matiz distinto sobre ${input.theme} en ${cityName}.`;
  }

  if (code === 'fr') {
    if (name === 'arrival') {
      return `Nous arrivons à ${input.localName}, une étape de ${input.theme} dans ${cityName}. Les sources publiques restent limitées, il faut donc observer le lieu avec attention et s'appuyer seulement sur les données disponibles.`;
    }
    if (name === 'history') {
      return `Les informations disponibles sur ${input.localName} indiquent ${tagSummary}. Cela ne raconte pas toute son histoire, mais donne une base prudente sans ajouter de dates, de pays, de guerres ou de personnages non vérifiés.`;
    }
    if (name === 'significance') {
      return `Dans cette visite, ${input.localName} sert de repère concret dans le tissu local. Ses données publiques sont modestes, mais elles aident à relier architecture, usage urbain et mémoire quotidienne.`;
    }
    return `Depuis ce point, nous continuons vers ${nextStop}. Gardez ces indices vérifiés en tête, car le prochain lieu ajoute une autre pièce au parcours.`;
  }
  if (code === 'de') {
    if (name === 'arrival') {
      return `Wir erreichen ${input.localName}, einen Abschnitt dieser ${input.theme}-Tour in ${cityName}. Die öffentlichen Angaben sind begrenzt, deshalb betrachten wir den Ort aufmerksam und stützen uns nur auf verfügbare Daten.`;
    }
    if (name === 'history') {
      return `Die verfügbaren Angaben zu ${input.localName} nennen ${tagSummary}. Das erzählt nicht die ganze Geschichte, bietet aber eine vorsichtige Grundlage ohne ungeprüfte Daten, Länder, Kriege oder Personen.`;
    }
    if (name === 'significance') {
      return `Für diesen Rundgang ist ${input.localName} ein konkreter Hinweis im lokalen Stadtgefüge. Die öffentlichen Daten sind knapp, helfen aber, Architektur, Nutzung und Alltagsgeschichte miteinander zu verbinden.`;
    }
    return `Von hier gehen wir weiter zu ${nextStop}. Behalten Sie diese überprüfbaren Hinweise im Kopf, denn der nächste Ort ergänzt den Rundgang um eine weitere Perspektive.`;
  }
  if (name === 'arrival') {
    return `We arrive at ${input.localName}, a ${input.theme} stop in ${cityName}. Public sources are limited, so the best approach is to observe carefully and stay grounded in the available facts.`;
  }
  if (name === 'history') {
    return `The available records for ${input.localName} give ${tagSummary}. That does not tell the whole story, but it gives us a cautious base without adding unverified dates, countries, wars, or people.`;
  }
  if (name === 'significance') {
    return `For this walk, ${input.localName} works as a concrete clue in the local fabric. Its public data is modest, but it helps connect architecture, urban use, and everyday memory.`;
  }
  return `From here, we continue toward ${nextStop}. Keep these verified clues in mind, because the next place adds another piece to the route.`;
}

async function generateSection(
  name: SectionName,
  buildPrompt: (input: LongNarrativePromptInput) => SectionPrompt,
  input: LongNarrativePromptInput,
  traceId: string,
  debugTrace?: NarrativeDebugTrace
): Promise<{ name: SectionName; section: string | null; droppedReason?: string }> {
  let lastReason = 'unknown';
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildPrompt({ ...input, retry: attempt > 0 });
    const modelOptions = {
      model: NARRATIVE_MODEL,
      temperature: attempt > 0 ? 0.25 : 0.4,
      max_tokens: input.seedQuality === 'thin' ? 220 : 260,
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

    const validationError = validateSection(section, input);
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
      wordCount: attemptTrace.wordCount,
      fallbackUsed: false,
      model: modelOptions.model,
    });
    if (!validationError) return { name, section };
    lastReason = validationError;
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
