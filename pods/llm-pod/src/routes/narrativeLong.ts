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
import { buildNarrativeBrief, formatBriefForPrompt } from '../prompts/narrative/narrativeBrief';
import { env } from '../config/env';
import { fallbackSection, NarrativeSectionName } from './narrativeFallback';

const router = express.Router();
const NARRATIVE_MODEL = env.narrativeModel;

type SectionName = NarrativeSectionName;
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

// ── Connector repetition detector (Board: 1x/section max) ──────

const NARRATIVE_CONNECTORS = [
  'fíjate', 'observa', 'mira', 'nota', 'imagina',
  'si miras', 'date cuenta', 'verás', 'encontrarás', 'descubrirás',
  'fíjate cómo', 'mira hacia', 'observa cómo',
  'notice how', 'look at', 'imagine', 'you will see', 'take a moment',
  'regarde', 'remarque', 'observez', 'imaginez',
  'schau', 'beachte', 'stell dir vor',
  'osserva', 'guarda', 'immagina',
];

/** Checks if a connector appears at the START of a sentence/clause, not mid-phrase.
 *  Splits on ., ;, !, ?, and newlines to find sentence boundaries. */
function findConnectorAtSentenceStart(text: string, connector: string): number {
  const normalized = normalizeNFD(text);
  const escapedCon = connector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  // Match connector at: start of text, after sentence-ending punctuation, after newline
  const re = new RegExp(`(^|[.!?;]\\s+|\\n)\\s*${escapedCon}\\b`, 'gi');
  const matches = normalized.match(re);
  return matches ? matches.length : 0;
}

function hasRepeatedConnector(text: string): string | null {
  for (const connector of NARRATIVE_CONNECTORS) {
    const count = findConnectorAtSentenceStart(text, connector);
    if (count > 1) {
      return `repetition-connector:${connector.slice(0, 20)}`;
    }
  }
  return null;
}

// ── Long phrase repetition detector (Board: ≥5 words, ≥2 times) ──

function hasRepeatedLongPhrase(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  if (words.length < 10) return null; // need at least 5+5 words

  const seen = new Map<string, number>();

  for (let n = 7; n >= 5; n--) { // check longest first
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      const count = (seen.get(phrase) || 0) + 1;
      if (count >= 2) {
        return `repetition-long-phrase:${phrase.slice(0, 40)}`;
      }
      seen.set(phrase, count);
    }
  }

  return null;
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

function hasSourceLanguageDrift(text: string, language: string): boolean {
  const code = language.slice(0, 2).toLowerCase();
  if (code !== 'fr') return false;
  if (/(?:paleocristienne|\bbisbes\b|\bbishop\b|\bcatedral\b)/i.test(text)) return true;
  return /(?:basílica gòtica|chaque stop|\bcon su\b|fachada revestida|obra maestr[íi]a|cerámica polícroma|\b(?:paleocristiana|construida|construido|diseñada|arquitectura|edificio|barrio|vidrio)\b)/i.test(text);
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

/** Normalize a Spanish token to its root form for gender/number-insensitive matching.
 *  "góticos" → "gotic", "testimonios" → "testimoni", "majestuosa" → "majestuos"
 *  Pure deterministic suffix stripping — no external NLP deps. */
function normalizeSpanishTokenRoot(token: string): string {
  const n = normalizeNFD(token);
  // Strip common gender/number suffixes
  return n
    .replace(/([oa]s?|es)$/, '')       // -o, -a, -os, -as, -es
    .replace(/(mente)$/, '')            // -mente adverbs
    .replace(/(isimo|isima|isimos|isimas)$/, ''); // superlatives
}

/** Phrases banned in generated output — Fase 3: evidence-aware tiers.
 *
 *  Tier 1 — HARD_META_BANS: meta-language, always banned (never acceptable)
 *  Tier 2 — HARD_CLICHE_BANS: formulaic tourist phrases, always banned
 *  Tier 3 — EVIDENCE_AWARE_VISUAL: visual/sensory claims that pass if evidence supports
 *
 *  Normalized forms (no accents) for reliable matching after normalizeNFD(). */

const HARD_META_BANS = [
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

const HARD_CLICHE_BANS = [
  'mire a su alrededor', 'mira a tu alrededor', 'miren hacia arriba', 'mira hacia abajo',
  'al llegar a', 'la primera impresion', 'es un lugar emblematico', 'fachada de ladrillo rojo',
  'bienvenidos a esta caminata', 'se presenta ante ti',
  'es significativo para nuestro recorrido', 'es importante para nuestra caminata',
  'refleja como', 'muestra como',
  'must-see destination', 'steeped in history', 'hidden gem',
  'have you ever wondered', 'rumour has it', 'rumor has it',
  'timeless charm', 'living witness', 'whisper of the past', 'echoes of history',
  'invites you to imagine', 'tells a story of', 'captivates every visitor', 'step back in time',
  'poder y riqueza', 'riqueza del',
  'grandiosidad',
  'breathtaking', 'awe-inspiring',
  'charme intemporel', 'temoin vivant', 'murmure du passe', "echos de l'histoire",
  'invite a imaginer', 'raconte une histoire', 'captiver chaque visiteur', 'joyau cache',
  'zeitloser charme', 'lebendiger zeuge', 'flustern der vergangenheit', 'echos der geschichte',
  'ladt dich ein', 'erzahlt eine geschichte', 'in seinen bann', 'verborgenes juwel',
  'fascino senza tempo', 'testimone vivente', 'sussurro del passato', 'echi della storia',
  'invita a immaginare', 'racconta una storia', 'cattura ogni visitatore', 'gioiello nascosto',
];

/** Evidence-aware visual/sensory claims. Each entry maps a banned phrase to evidence
 *  keywords that, if present in the seed corpus, allow the phrase to pass.
 *  Example: "fachada dorada" passes if evidence mentions "dorado", "oro", "gold". */
const EVIDENCE_AWARE_VISUAL: Array<{ phrase: string; evidenceKeys: string[] }> = [
  { phrase: 'fachada dorada',       evidenceKeys: ['dorado', 'dorada', 'oro', 'gold', 'gilded', 'dore'] },
  { phrase: 'dorada fachada',       evidenceKeys: ['dorado', 'dorada', 'oro', 'gold', 'gilded', 'dore'] },
  { phrase: 'lujosa decoracion',    evidenceKeys: ['lujo', 'lujoso', 'lujosa', 'luxury', 'luxe'] },
  { phrase: 'lujosa',               evidenceKeys: ['lujo', 'lujoso', 'lujosa', 'luxury', 'luxe'] },
  { phrase: 'majestuoso',           evidenceKeys: [] }, // never evidenced — always banned unless...
  { phrase: 'majestuosidad',        evidenceKeys: [] },
  { phrase: 'majestuosamente',      evidenceKeys: [] },
  { phrase: 'se alza majestuosamente', evidenceKeys: [] },
  { phrase: 'se alza imponente',    evidenceKeys: [] },
  { phrase: 'imponente estructura',  evidenceKeys: [] },
  { phrase: 'presencia imponente',   evidenceKeys: [] },
  { phrase: 'atmosfera',            evidenceKeys: [] }, // sensory claims rarely documentable
  { phrase: 'la iluminacion',       evidenceKeys: [] },
  { phrase: 'penumbra',             evidenceKeys: [] },
  { phrase: 'misterioso',           evidenceKeys: [] },
  { phrase: 'juego de luces',       evidenceKeys: [] },
  { phrase: 'sombras',              evidenceKeys: [] },
  { phrase: 'testimonio de',        evidenceKeys: [] },
  { phrase: 'testimonio tangible',  evidenceKeys: [] },
  // Multilingual equivalents
  { phrase: 'atmosphere',           evidenceKeys: [] },
  { phrase: 'play of light',        evidenceKeys: [] },
  { phrase: 'shadows',              evidenceKeys: [] },
  { phrase: 'mysterious',           evidenceKeys: [] },
  { phrase: 'atmosphere',           evidenceKeys: [] },
  { phrase: 'jeu de lumiere',       evidenceKeys: [] },
  { phrase: 'ombres',               evidenceKeys: [] },
  { phrase: 'mysterieux',           evidenceKeys: [] },
  { phrase: 'atmosphare',           evidenceKeys: [] },
  { phrase: 'schatten',             evidenceKeys: [] },
  { phrase: 'lichtspiel',           evidenceKeys: [] },
  { phrase: 'majestatisch',         evidenceKeys: [] },
  { phrase: 'geheimnisvoll',        evidenceKeys: [] },
  { phrase: 'atmosfera',            evidenceKeys: [] },
  { phrase: 'giochi di luce',       evidenceKeys: [] },
  { phrase: 'ombre',                evidenceKeys: [] },
  { phrase: 'maestoso',             evidenceKeys: [] },
  { phrase: 'misterioso',           evidenceKeys: [] },
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

// ── Evidence-aware ban system (Fase 3) ──────────────────────────

/** Checks if any evidence keyword for a visual claim appears in the seed corpus.
 *  Uses word-boundary matching to avoid false positives (e.g., "oro" matching "tesoro"). */
function hasEvidenceForVisual(evidenceKeys: string[], input: LongNarrativePromptInput): boolean {
  if (evidenceKeys.length === 0) return false; // never evidenced → always ban
  const corpus = normalizeNFD(seedText(input));
  // Use word-boundary or whitespace-delimited matching
  return evidenceKeys.some(key => {
    const nKey = normalizeNFD(key);
    // Check as whole word: surrounded by word boundaries or whitespace/punctuation
    const re = new RegExp(`(^|[\\s.,;:!?()\\[\\]{}"'\\-])${nKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s.,;:!?()\\[\\]{}"'\\-])`, 'i');
    return re.test(corpus);
  });
}

function hasBannedPhrase(section: string, input?: LongNarrativePromptInput): string | null {
  const normalized = normalizeNFD(section);

  // Tier 1: HARD_META_BANS — always fail
  const metaMatch = HARD_META_BANS.find(phrase => normalized.includes(phrase));
  if (metaMatch) return `banned-meta:${metaMatch.slice(0, 30)}`;

  // Tier 2: HARD_CLICHE_BANS — always fail
  const clicheMatch = HARD_CLICHE_BANS.find(phrase => normalized.includes(phrase));
  if (clicheMatch) return `banned-cliche:${clicheMatch.slice(0, 30)}`;

  // Tier 3: EVIDENCE_AWARE_VISUAL — fail only if unsupported
  // Check ALL visual phrases, not just the first match
  if (input) {
    for (const { phrase, evidenceKeys } of EVIDENCE_AWARE_VISUAL) {
      if (normalized.includes(phrase)) {
        if (!hasEvidenceForVisual(evidenceKeys, input)) {
          return `unsupported-visual:${phrase.slice(0, 30)}`;
        }
        // Evidence supports this one — continue checking others
      }
    }
  }

  return null;
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

export function repairSectionSurfaceIssue(
  section: string,
  validationError: string,
  input: LongNarrativePromptInput
): string {
  if (validationError === 'source-language-drift' && input.language.slice(0, 2).toLowerCase() === 'fr') {
    const translated = section
      .replace(/basílica gòtica/gi, 'basilique gothique')
      .replace(/paleocristiana/gi, 'paléochrétienne')
      .replace(/paleocristienne/gi, 'paléochrétienne')
      .replace(/basílica paléochrétienne/gi, 'basilique paléochrétienne')
      .replace(/\bbisbes\b/gi, 'évêques')
      .replace(/\bbishop\b/gi, 'évêque')
      .replace(/\bcatedral\b/gi, 'cathédrale')
      .replace(/\bconstruida\b/gi, 'construite')
      .replace(/\bconstruido\b/gi, 'construit')
      .replace(/\barquitectura\b/gi, 'architecture')
      .replace(/\bedificio\b/gi, 'édifice')
      .replace(/\bbarrio\b/gi, 'quartier')
      .replace(/chaque stop/gi, 'chaque étape');
    const sentences = translated.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [translated];
    return sentences
      .filter((sentence) => !hasSourceLanguageDrift(sentence, input.language))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (validationError.startsWith('unsupported-visual:')) {
    const unsupportedTerm = normalizeNFD(validationError.slice('unsupported-visual:'.length));
    const sentences = section.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [section];
    return sentences
      .filter((sentence) => !normalizeNFD(sentence).includes(unsupportedTerm))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (validationError.startsWith('unverified-date:')) {
    const unsupportedDate = validationError.slice('unverified-date:'.length);
    const sentences = section.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [section];
    return sentences
      .filter((sentence) => !sentence.includes(unsupportedDate))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (/^unverified-(?:architect|style|location):/.test(validationError)) {
    const unsupportedValue = normalizeNFD(validationError.slice(validationError.indexOf(':') + 1));
    const sentences = section.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [section];
    return sentences
      .filter((sentence) => !normalizeNFD(sentence).includes(unsupportedValue))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (validationError.startsWith('banned-cliche:')) {
    return section
      .replace(/raconte une histoire/gi, 'exprime une évolution')
      .replace(/t[ée]moin vivant/gi, 'repère concret')
      .replace(/living witness/gi, 'concrete record')
      .replace(/testimonio vivo/gi, 'referencia concreta');
  }

  return section;
}

function hasCoordinatePair(text: string): boolean {
  return /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/.test(text);
}

export function validateSection(section: string, input: LongNarrativePromptInput, name?: SectionName, corpus?: TieredCorpus): string | null {
  const count = wordCount(section);
  const minWords = name === 'transition' ? 25 : 45;
  const maxWords = name === 'transition' ? (input.position === 'last' ? 75 : 70) : 140;
  if (count < minWords || count > maxWords) return `word-count-${count}`;
  if (/^Visit .*, a notable (location|stop|place) /i.test(section)) return 'generic-shape';
  if (/^¡Hola!|^Hello!|^Bonjour!|^Hallo!/i.test(section)) return 'chatbot-opening';
  const banned = hasBannedPhrase(section, input);
  if (banned) return banned;
  if (hasRepetition(section)) return 'repetition';
  // Board repetición: connector repetition (1x/section max)
  const repeatedConnector = hasRepeatedConnector(section);
  if (repeatedConnector) return repeatedConnector;
  // Board repetición: long phrase repetition (≥5 words, ≥2 times)
  const repeatedPhrase = hasRepeatedLongPhrase(section);
  if (repeatedPhrase) return repeatedPhrase;
  // Check invalid end-of-tour phrases in non-last stops
  if (input.position !== 'last') {
    const invalidTrans = hasInvalidTransition(section);
    if (invalidTrans) return invalidTrans;
  }
  if (name === 'transition' && /(?:juste à côté|à quelques pas|tout près|non loin|nearby|next door|a few steps away|justo al lado|a pocos pasos)/i.test(section)) {
    return 'unsupported-proximity';
  }
  if ((name === 'arrival' || name === 'transition') && /(?:vers l['’](?:est|ouest)|vers le (?:nord|sud)|au (?:nord|sud|est|ouest)|to the (?:north|south|east|west)|hacia el (?:norte|sur|este|oeste))/i.test(section)) {
    return 'unsupported-route-geometry';
  }
  if (name === 'arrival' && /(?:sous le soleil|rayons du soleil|brille sous|derniers rayons|at sunset|in the sunlight|bajo el sol|rayos del sol)/i.test(section)) {
    return 'unstable-observation';
  }
  if (hasSourceLanguageDrift(section, input.language)) return 'source-language-drift';
  if (!hasLanguageSignal(section, input.language)) return 'language-drift';
  const constructionConflict = hasConstructionDateConflict(section, input);
  if (constructionConflict) return constructionConflict;
  if (hasCoordinatePair(section)) return 'coordinates';
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
  'gothique', 'gothiques', 'baroque', 'baroques',
  'néoclassique', 'néoclassiques', 'neoclassique', 'neoclassiques',
  'roman', 'romane', 'romans', 'romanes', 'Renaissance',
  'modernisme', 'moderniste', 'modernistes', 'éclectisme', 'eclectisme',
  'brutaliste', 'brutalistes', 'Art nouveau', 'Art déco', 'Art deco',
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
  style:             { unverified: 'warning',  contradicted: 'warning' },
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
  const localizedCenturyRe = /\b(?:\d{1,2}(?:er|e)?\s+si[èe]cle|\d{1,2}(?:st|nd|rd|th)\s+century|\d{1,2}\.\s+Jahrhundert|secolo\s+[IVXLCDM]+)\b/gi;
  while ((match = localizedCenturyRe.exec(text)) !== null) {
    dates.push(match[0]);
  }
  return [...new Set(dates)];
}

export function hasConstructionDateConflict(section: string, input: LongNarrativePromptInput): string | null {
  const claims = input.seeds?.wikidataClaims || {};
  const inception = claims.inception || claims.P571;
  const inceptionYear = inception?.match(/\b(\d{4})\b/)?.[1];
  if (!inceptionYear) return null;
  const knownYear = Number(inceptionYear);
  const construction = '(?:construit(?:e|s|es)?|b[aâ]ti(?:e|s|es)?|[ée]difi[ée](?:e|s|es)?|built|erected|erbaut|errichtet|costruit[oa]|edificat[oa])';
  const yearRe = new RegExp(`${construction}[^.!?]{0,60}?\\b(\\d{4})\\b`, 'giu');
  let match: RegExpExecArray | null;
  while ((match = yearRe.exec(section)) !== null) {
    const generatedYear = Number(match[1]);
    if (Math.abs(generatedYear - knownYear) > 50) {
      return `construction-date-conflict:${generatedYear}:expected-${knownYear}`;
    }
  }
  const centuryRe = new RegExp(`${construction}[^.!?]{0,60}?\\b(\\d{1,2})(?:er|e)?\\s+si[èe]cle`, 'giu');
  while ((match = centuryRe.exec(section)) !== null) {
    const century = Number(match[1]);
    const firstYear = (century - 1) * 100 + 1;
    const lastYear = century * 100;
    if (knownYear < firstYear || knownYear > lastYear) {
      return `construction-date-conflict:${century}e-siècle:expected-${knownYear}`;
    }
  }
  return null;
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

export function extractArchitects(text: string): string[] {
  const architects: string[] = [];
  const nameToken = "(?:\\p{Lu}\\.|\\p{Lu}[\\p{L}'’\\-]+)";
  const name = `(${nameToken}(?:\\s+(?:(?:de|del|di|da|du|von|van|der|la|le)\\s+)?${nameToken}){0,4})`;
  const patterns = [
    new RegExp(`(?:obra de|diseñad[oa] por|arquitecto[s]?|del arquitecto)\\s+${name}`, 'gu'),
    new RegExp(`(?:par l['’]architecte|conçu(?:e)? par|dessiné(?:e)? par|signé(?:e)? par|œuvre de)\\s+${name}`, 'gu'),
    new RegExp(`(?:designed by|architect(?: was| is)?|a work by)\\s+${name}`, 'giu'),
    new RegExp(`(?:entworfen von|vom Architekten|Architekt(?: war| ist)?)\\s+${name}`, 'gu'),
    new RegExp(`(?:progettat[oa] da|dall['’]architetto|opera di)\\s+${name}`, 'gu'),
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const architect = match[1].trim().replace(/[.,;:!?]+$/, '');
      if (!/^(el|la|los|las|su|un|una|este|esta|eso|aquel|cuando|donde|primera|segunda)\b/i.test(architect)) {
        architects.push(architect);
      }
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
    /\b((?:quartier|district)\s+(?:(?:de|du|des|d’|d'|la|le|les)\s+)?[A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ][\p{L}'’-]+(?:\s+[A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ][\p{L}'’-]+){0,2})\b/gu,
    /\b((?:barrio|distrito)\s+(?:(?:de|del|la|el)\s+)?[A-ZÁÉÍÓÚÑ][\p{L}'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'’-]+){0,2})\b/gu,
    /\b((?:neighborhood|district)\s+(?:(?:of|the)\s+)?[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\b/gu,
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

  // For styles: use root normalization to match gender/number variants
  // "góticas" and "gótico" should both normalize to the same root
  if (claimType === 'style') {
    if (corpus.medium.includes(normalizedValue)) {
      return { found: true, tier: 'wikipedia' };
    }
    const styleRoot = normalizeSpanishTokenRoot(normalizedValue);
    for (const knownStyle of KNOWN_ARCHITECTURAL_STYLES) {
      if (normalizeSpanishTokenRoot(knownStyle) === styleRoot) {
        // Found the canonical form — now check if any variant exists in the corpus
        const variants = KNOWN_ARCHITECTURAL_STYLES.filter(s => normalizeSpanishTokenRoot(s) === styleRoot);
        for (const variant of variants) {
          if (corpus.high.includes(normalizeNFD(variant))) return { found: true, tier: 'wikidata' };
          if (corpus.medium.includes(normalizeNFD(variant))) return { found: true, tier: 'wikipedia' };
        }
        return { found: false, tier: 'none' };
      }
    }
    return { found: false, tier: 'none' };
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
    const root = normalizeSpanishTokenRoot(n);
    map[n] = root;
  }
  return map;
})();

function styleCanonicalRoot(style: string): string {
  const n = normalizeNFD(style);
  // Known style: use precomputed canonical root
  if (STYLE_CANONICAL_MAP[n]) return STYLE_CANONICAL_MAP[n];
  // Unknown style: use heuristic root normalization
  return normalizeSpanishTokenRoot(n);
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

  // For locations: similar to architect — corpus has data but not this one
  if (claimType === 'location') {
    // Only check if corpus has location data
    const locRe = /(?:plaza|calle|barrio|puerta|fuente|parque|square|street|park|gate|fountain)/gi;
    if (locRe.test(corpus.high + ' ' + corpus.medium)) {
      const normNoAccents = norm.replace(/[áéíóú]/g, m => 'aeiou'['áéíóú'.indexOf(m)]);
      if (!(corpus.high + ' ' + corpus.medium).toLowerCase().includes(normNoAccents)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

// ── Full narrative claim verification ──────────────────────────────

export function validateNarrativeClaims(
  text: string,
  input: LongNarrativePromptInput
): ClaimCheckResult {
  const corpus = buildTieredCorpus(input.seeds);
  const claims: VerifiedClaim[] = [];
  const whitelist = [input.localName, input.cityName, input.nextStopName].filter(Boolean) as string[];

  // Extract and verify each claim type
  const extractors: Array<{ fn: (text: string) => string[]; type: ClaimType; severity: ClaimSeverity; whitelistArgs?: boolean }> = [
    { fn: extractDates, type: 'date', severity: 'critical' },
    { fn: extractArchitects, type: 'architect', severity: 'critical' },
    { fn: extractHistoricalPersons, type: 'historical_person', severity: 'critical' },
    { fn: extractStyles, type: 'style', severity: 'critical' },
    { fn: extractMaterials, type: 'material', severity: 'warning' },
    { fn: extractMeasurements, type: 'measurement', severity: 'info' },
    { fn: (t: string) => extractLocations(t, whitelist), type: 'location', severity: 'warning' },
  ];

  for (const { fn, type, severity } of extractors) {
    for (const value of fn(text)) {
      const norm = normalizeNFD(value);

      // Check if claim is contradicted
      const contradicted = isContradicted(value, type, corpus);
      if (contradicted) {
        const contradictedSeverity = SEVERITY_MAP[type]?.contradicted || severity;
        claims.push({
          type,
          value,
          status: 'contradicted',
          severity: contradictedSeverity,
          source: 'none',
          context: claimContext(text, value),
        });
        continue;
      }

      // Check if claim is verified or unverified
      const { found, tier } = findClaimSource(norm, type, corpus);
      const sevMap = SEVERITY_MAP[type];
      const unverifiedSeverity = sevMap?.unverified || severity;

      if (found) {
        claims.push({
          type,
          value,
          status: 'verified',
          severity: 'info',
          source: tier,
          context: claimContext(text, value),
        });
      } else {
        claims.push({
          type,
          value,
          status: 'unverified',
          severity: unverifiedSeverity,
          source: 'none',
          context: claimContext(text, value),
        });
      }
    }
  }

  const verifiedCount = claims.filter(c => c.status === 'verified').length;
  const contradictedCount = claims.filter(c => c.status === 'contradicted').length;
  const unverifiedCount = claims.filter(c => c.status === 'unverified').length;
  const criticalFailCount = claims.filter(c => c.status === 'contradicted' && c.severity === 'critical').length;
  const warningCount = claims.filter(c => c.severity === 'warning').length;
  const infoCount = claims.filter(c => c.severity === 'info').length;
  const totalExtracted = claims.length;
  const verifiedRate = totalExtracted > 0 ? verifiedCount / totalExtracted : 0; // 0 claims = unknown, not 100% verified
  const contradictedRate = totalExtracted > 0 ? contradictedCount / totalExtracted : 0;
  const unverifiedRate = totalExtracted > 0 ? unverifiedCount / totalExtracted : 0;

  return {
    claims,
    totalExtracted,
    verifiedCount,
    contradictedCount,
    unverifiedCount,
    criticalFailCount,
    warningCount,
    infoCount,
    verifiedRate,
    contradictedRate,
    unverifiedRate,
  };
}

const BLOCKING_CLAIM_TYPES = new Set<ClaimType>(['date', 'architect', 'location']);

export function guardSectionsAgainstSources(
  sections: Record<string, string>,
  input: LongNarrativePromptInput
): { sections: Record<string, string>; reasons: string[] } {
  const guarded = { ...sections };
  const reasons: string[] = [];

  for (const name of Object.keys(guarded) as SectionName[]) {
    const claimCheck = validateNarrativeClaims(guarded[name], input);
    const blockingClaims = claimCheck.claims.filter((claim) => (
      BLOCKING_CLAIM_TYPES.has(claim.type) && claim.status !== 'verified'
    ));
    if (blockingClaims.length === 0) continue;

    const reason = `${name}:post-generation-claim-guard:${blockingClaims.map((claim) => `${claim.type}:${claim.value}`).join('|')}`;
    guarded[name] = fallbackSection(name, input, reason);
    reasons.push(reason);
  }

  return { sections: guarded, reasons };
}

// ═══════════════════════════════════════════════════════════════════
// SOFT WEAK-PHRASE SCORING + CONCURRENCY LIMITER + SECTION GENERATION
// ═══════════════════════════════════════════════════════════════════

// ── Soft weak-phrase scoring (Fase 9 — editorial layer) ──────────

interface EditorialScoreResult {
  score: number;
  hits: string[];
  severity: 'none' | 'soft' | 'heavy';
}

const WEAK_PHRASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(merece una mirada|merece la pena|vale la pena)\b/i, label: 'merece-mirada' },
  { pattern: /\b(ofrece un cierre|cierre con sentido|broche final)\b/i, label: 'cierre-formulaico' },
  { pattern: /\b(destaca por|se caracteriza por|es conocido por)\b/i, label: 'destaca-por' },
  { pattern: /\b(importante|relevante|significativo) (para|en|por)\b/i, label: 'importante-para' },
  { pattern: /\b(interesante|fascinante|sorprendente)\b/i, label: 'adjetivo-vacio' },
  { pattern: /\b(ofreciendo una|brindando una|proporcionando una)\b/i, label: 'gerundio-debil' },
  { pattern: /\b(refleja la importancia|simboliza la|representa la esencia)\b/i, label: 'simbolismo-vacio' },
];

function scoreWeakPhrases(section: string): EditorialScoreResult {
  const normalized = normalizeNFD(section);
  const hits: string[] = [];

  for (const { pattern, label } of WEAK_PHRASES) {
    if (pattern.test(normalized)) {
      hits.push(label);
    }
  }

  const score = hits.length;
  const severity: EditorialScoreResult['severity'] =
    score === 0 ? 'none' : score <= 2 ? 'soft' : 'heavy';

  return { score, hits, severity };
}

function parseSection(raw: string): string | null {
  const trimmed = raw.trim();

  // Strategy 1: Try strict JSON parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.section === 'string' && parsed.section.length > 0) return parsed.section;
    if (typeof parsed.text === 'string' && parsed.text.length > 0) return parsed.text;
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (typeof parsed[0].section === 'string') return parsed[0].section;
      if (typeof parsed[0].text === 'string') return parsed[0].text;
    }
  } catch { /* fall through to extraction strategies */ }

  // Strategy 2: Extract JSON from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const inner = JSON.parse(fenceMatch[1].trim());
      if (typeof inner.section === 'string') return inner.section;
      if (typeof inner.text === 'string') return inner.text;
      if (typeof inner === 'string') return inner;
    } catch { /* ignore */ }
  }

  // Strategy 3: Extract first JSON object from text with surrounding noise
  // LLMs often add "Here is the response:" or notes before/after JSON
  const jsonMatch = trimmed.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (typeof obj.section === 'string' && obj.section.length > 0) return obj.section;
      if (typeof obj.text === 'string' && obj.text.length > 0) return obj.text;
    } catch { /* ignore */ }
  }

  // Tolerate a missing closing brace when the JSON field itself is complete.
  // The extracted prose still passes every normal section validator.
  const looseField = trimmed.match(/"(?:section|text)"\s*:\s*"([\s\S]+)"\s*\}?\s*$/);
  if (looseField) {
    return looseField[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
  }

  // Some local models ignore JSON mode and return only the requested prose.
  if (!/[{}]/.test(trimmed) && wordCount(trimmed) >= 30) return trimmed;

  return null;
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
  for (let attempt = 0; attempt < 3; attempt++) {
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
      temperature: attempt === 0 ? temp1 : attempt === 1 ? temp2 : 0.1,
      max_tokens: input.seedQuality === 'thin' ? 200 : 260,
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
      seedQuality: input.seedQuality,
      model: modelOptions.model,
      temperature: modelOptions.temperature,
      max_tokens: modelOptions.max_tokens,
      num_predict: response.metadata?.num_predict ?? modelOptions.max_tokens,
      durationMs,
      parseSuccess: false,
      validationFailures: [lastReason],
      fallbackUsed: false,
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
      seedQuality: input.seedQuality,
      model: modelOptions.model,
      temperature: modelOptions.temperature,
      max_tokens: modelOptions.max_tokens,
      num_predict: response.metadata?.num_predict ?? modelOptions.max_tokens,
      durationMs,
        parseSuccess: false,
        validationFailures: [lastReason],
        fallbackUsed: false,
      });
      continue;
    }

    let acceptedSection = section;
    let validationError = validateSection(acceptedSection, input, name, corpus);
    if (validationError) {
      const repairedSection = repairSectionSurfaceIssue(acceptedSection, validationError, input);
      if (repairedSection !== acceptedSection) {
        const repairValidationError = validateSection(repairedSection, input, name, corpus);
        if (!repairValidationError) {
          narrativeLog('section-surface-repair', { traceId, section: name, validationError });
          acceptedSection = repairedSection;
          validationError = null;
        }
      }
    }
    attemptTrace.parseResult = acceptedSection;
    attemptTrace.validationFailure = validationError;
    attemptTrace.wordCount = wordCount(acceptedSection);
    attemptTrace.success = !validationError;
    // Soft editorial scoring (non-blocking)
    const editorialScore = scoreWeakPhrases(acceptedSection);
    debugTrace?.attempts.push(attemptTrace);
    narrativeLog('section-attempt', {
      traceId,
      section: name,
      attempt: attempt + 1,
      seedQuality: input.seedQuality,
      model: modelOptions.model,
      temperature: modelOptions.temperature,
      max_tokens: modelOptions.max_tokens,
      num_predict: response.metadata?.num_predict ?? modelOptions.max_tokens,
      durationMs,
      parseSuccess: true,
      validationFailures: validationError ? [validationError] : [],
      validationType: validationError?.startsWith('fact-coverage') ? 'coverage'
        : validationError?.startsWith('banned-meta') ? 'meta'
        : validationError?.startsWith('banned-cliche') ? 'cliche'
        : validationError?.startsWith('unsupported-visual') ? 'visual'
        : validationError?.startsWith('repetition-connector') ? 'repetition-connector'
        : validationError?.startsWith('repetition-long-phrase') ? 'repetition-long'
        : validationError?.startsWith('banned') ? 'banned'
        : 'other',
      wordCount: attemptTrace.wordCount,
      editorialScore: editorialScore.score,
      editorialHits: editorialScore.hits,
      editorialSeverity: editorialScore.severity,
      fallbackUsed: false,
    });
    if (!validationError) return { name, section: acceptedSection };
    lastReason = validationError;
    // Fase 5: targeted retry feedback per error type
    if (validationError.startsWith('fact-coverage:')) {
      const labelsMatch = validationError.match(/labels=([^)]+)/);
      if (labelsMatch) {
        missingFacts = labelsMatch[1].split(',');
      }
    } else if (validationError.startsWith('banned-meta:')) {
      missingFacts = ['NO META: no menciones fuentes, registros, datos limitados, ni reglas internas del sistema'];
    } else if (validationError.startsWith('banned-cliche:')) {
      missingFacts = ['EVITA CLICHÉS: no uses frases turísticas formulaicas. Sé concreto y específico.'];
    } else if (validationError.startsWith('unsupported-visual:')) {
      missingFacts = ['ELIMINA la afirmación visual no soportada por la evidencia. Sustitúyela por una observación verificable.'];
    } else if (validationError.startsWith('word-count-')) {
      missingFacts = [`AJUSTA longitud: objetivo ${input.targetWords} palabras. Sección actual fuera de rango.`];
    } else if (validationError.startsWith('unverified-')) {
      missingFacts = ['Verifica que cada claim (fecha, arquitecto, estilo) esté respaldado por los hechos permitidos. Elimina lo inventado.'];
    } else if (validationError.startsWith('repetition-connector:')) {
      missingFacts = ['VARÍA conectores: no uses el mismo conector de apertura dos veces en esta sección. Usa estructuras distintas para empezar las oraciones.'];
    } else if (validationError.startsWith('repetition-long-phrase:')) {
      missingFacts = ['NO REPITAS frases largas textualmente. Si necesitas decir lo mismo, reformúlalo con otras palabras.'];
    } else if (validationError === 'repetition') {
      missingFacts = ['Varía estructura de frases. Evita repetir los mismos trigramas.'];
    } else if (validationError === 'formal-register') {
      missingFacts = ['Usa "tú", no "usted". Lenguaje cercano y directo.'];
    } else if (validationError === 'language-drift') {
      missingFacts = [`Escribe exclusivamente en ${input.language}. No mezcles palabras ni plantillas de otros idiomas.`];
    } else if (validationError === 'source-language-drift') {
      missingFacts = [`Traduce al ${input.language} los términos descriptivos tomados de la fuente. Conserva sin traducir únicamente los nombres propios oficiales.`];
    } else if (validationError === 'unsupported-proximity') {
      missingFacts = ['No afirmes que la siguiente parada está cerca, al lado o visible. Conecta las ideas sin inventar geometría de la ruta.'];
    } else if (validationError === 'unsupported-route-geometry') {
      missingFacts = ['Elimina puntos cardinales y direcciones inventadas. Conecta la parada anterior y la siguiente solo por su idea narrativa.'];
    } else if (validationError === 'unstable-observation') {
      missingFacts = ['Describe solo rasgos estables del lugar. Elimina referencias al sol, la luz, el clima, la hora o la afluencia actual.'];
    } else if (validationError.startsWith('construction-date-conflict:')) {
      const inception = input.seeds?.wikidataClaims?.inception || input.seeds?.wikidataClaims?.P571;
      missingFacts = [`La fecha de construcción permitida es ${inception}. Elimina cualquier siglo o fecha incompatible.`];
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

    // Fase 4: NarrativeBrief integration (behind feature flag)
    const brief = env.narrativeBriefEnabled ? buildNarrativeBrief(input) : null;
    const briefText = brief ? formatBriefForPrompt(brief) : undefined;
    if (brief && briefText) {
      narrativeLog('brief-built', {
        traceId,
        seedQuality: brief.seedQuality,
        factCount: brief.allowedFacts.length,
        tone: brief.tone,
      });
    }
    const ordered: Array<{ name: SectionName; section: string | null; droppedReason?: string }> = [];
    let previousSectionsText = '';
    for (const sectionName of policy.sectionNames) {
      const result = await generateSection(
        sectionName,
        promptBuilders[sectionName],
        {
          ...input,
          narrativeBriefText: brief ? formatBriefForPrompt(brief, sectionName) : undefined,
          previousSectionsText: previousSectionsText || undefined,
        },
        traceId,
        debugTrace
      );
      ordered.push(result);
      if (result.section) {
        previousSectionsText = [previousSectionsText, result.section].filter(Boolean).join('\n\n');
      }
    }
    const generatedSections = Object.fromEntries(
      ordered.filter(item => item.section).map(item => [item.name, item.section])
    ) as Record<string, string>;
    const generationDroppedReasons = ordered
      .map(item => item.droppedReason)
      .filter((reason): reason is string => Boolean(reason));
    const guarded = guardSectionsAgainstSources(generatedSections, input);
    const sections = guarded.sections;
    const droppedReasons = [...generationDroppedReasons, ...guarded.reasons];
    const narration = policy.sectionNames
      .map((name) => sections[name])
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
