import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { model } from '../llm/model';
import { arrivalPrompt } from '../prompts/narrative/arrival';
import { historyPrompt } from '../prompts/narrative/history';
import { significancePrompt } from '../prompts/narrative/significance';
import { transitionPrompt } from '../prompts/narrative/transition';
import { LongNarrativePromptInput, SectionPrompt } from '../prompts/narrative/types';
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
