import express from 'express';
import { model } from '../llm/model';
import { env } from '../config/env';

const router = express.Router();

const NARRATIVE_MODEL = env.narrativeModel;

type NarrativeSeeds = {
  wikipediaLead?: string | null;
  wikipediaBody?: string | null;
  wikidataClaims?: Record<string, unknown> | null;
  osmTags?: Record<string, unknown> | null;
  wikivoyage?: string | null;
  enrichedContext?: string | null;
};

function languageCode(language: string | undefined): string {
  return (language || 'en').slice(0, 2).toLowerCase();
}

export interface NarrativeStopRequest {
  localName: string;
  wikipediaExtract: string | null;
  theme: string;
  language: string;
}

interface FastNarrationRequest extends NarrativeStopRequest {
  seeds?: NarrativeSeeds;
  cityName?: string;
  position?: 'first' | 'middle' | 'last';
  previousStopName?: string;
  nextStopName?: string;
  stopIndex?: number;
  totalStops?: number;
  narrativeRole?: string;
  tourPromise?: string;
  centralQuestion?: string;
  transitionPurpose?: string;
  editorialRepairInstructions?: string[];
}

const FAST_MIN_FACTS = 3;
const FAST_MIN_WORDS = 170;
const FAST_MAX_WORDS = 300;

const GENERIC_FILLER_PATTERNS = [
  /\burban fabric\b/i,
  /\btransition point\b/i,
  /\bformal boundary\b/i,
  /\brelationship with (?:the )?(?:immediate )?surroundings\b/i,
  /\bpublic life\b/i,
  /\bpivot point\b/i,
  /\bthis space\b/i,
  /\bthe city transforms\b/i,
  /\bconnects movement, scale, and urban life\b/i,
  /\bnot only what it is, but how it helps\b/i,
  /\bstands in [A-Z][A-Za-z\s]+\. Notice the building\b/i,
];

const META_PATTERNS = [
  /\b(?:facts?|sources?|provided|available data|metadata|OSM|Wikidata|Wikipedia)\b/i,
  /\b(?:I need to|the user wants|as an AI|here is)\b/i,
];

const CLAIM_LABELS: Record<string, string> = {
  inception: 'date',
  P571: 'date',
  architect: 'architect',
  P84: 'architect',
  architecturalStyle: 'architectural style',
  P149: 'architectural style',
  heritageDesignation: 'heritage status',
  P1435: 'heritage status',
  locatedIn: 'location',
  P131: 'location',
  namedAfter: 'named after',
  P138: 'named after',
};

function buildNarrationFromExtract(localName: string, extract: string): string {
  const trimmed = extract.slice(0, 400).trim();
  return trimmed.length > 0 ? trimmed : `You are standing at ${localName}, a stop worth observing for how it fits into the rhythm of the city around you.`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(text: string | null | undefined): string[] {
  if (!text) return [];

  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 240);
}

function stringifyClaim(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).replace(/-00-00$/, '').trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map(stringifyClaim).filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.slice(0, 3).join(', ') : null;
  }
  return null;
}

function addFact(facts: string[], seen: Set<string>, fact: string | null | undefined): void {
  const normalized = (fact || '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length < 12) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  facts.push(normalized);
}

function collectFactPack(input: FastNarrationRequest): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();
  const seeds = input.seeds || {};

  for (const [key, rawValue] of Object.entries(seeds.wikidataClaims || {})) {
    const value = stringifyClaim(rawValue);
    if (!value) continue;
    const label = CLAIM_LABELS[key] || key;
    addFact(facts, seen, `${input.localName} ${label}: ${value}.`);
  }

  const sourceText = [
    seeds.wikipediaLead,
    seeds.enrichedContext,
    seeds.wikivoyage,
    seeds.wikipediaBody,
    input.wikipediaExtract,
  ].filter(Boolean).join('\n');

  const datedOrNamed = splitSentences(sourceText).filter((sentence) => (
    /\b(?:1[0-9]{3}|20[0-9]{2}|[A-Z][a-z]+(?:\s+(?:de|del|of|the|la|le|du|di|da|von|[A-Z][a-z]+)){1,4})\b/.test(sentence)
  ));
  for (const sentence of datedOrNamed.slice(0, 8)) {
    addFact(facts, seen, sentence);
  }

  const osmTags = seeds.osmTags || {};
  for (const key of ['start_date', 'architect', 'name:en', 'name:es', 'heritage', 'historic']) {
    const value = stringifyClaim(osmTags[key]);
    if (value) addFact(facts, seen, `${input.localName} has ${key.replace(':', ' ')} ${value}.`);
  }

  return facts.slice(0, 10);
}

function concreteSignals(facts: string[]): string[] {
  const signals = new Set<string>();
  const joined = facts.join(' ');
  for (const match of joined.matchAll(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g)) {
    signals.add(match[0]);
  }
  for (const match of joined.matchAll(/\b[A-Z][\p{L}'-]+(?:\s+(?:de|del|of|the|la|le|du|di|da|von|[A-Z][\p{L}'-]+)){1,5}\b/gu)) {
    const value = match[0].trim();
    if (value.length >= 8 && !/^(The|This|That|While|Before|After)\b/.test(value)) {
      signals.add(value);
    }
  }
  return [...signals].slice(0, 12);
}

function validateFastNarration(text: string, facts: string[]): string | null {
  const words = wordCount(text);
  if (words < FAST_MIN_WORDS || words > FAST_MAX_WORDS) return `word-count-${words}`;
  const banned = GENERIC_FILLER_PATTERNS.find((pattern) => pattern.test(text));
  if (banned) return 'generic-filler';
  const meta = META_PATTERNS.find((pattern) => pattern.test(text));
  if (meta) return 'meta-language';
  if (/^\s*(?:Hmm|Okay|Sure|Here)/i.test(text)) return 'chatty-prefix';

  const signals = concreteSignals(facts);
  const lower = text.toLocaleLowerCase();
  const signalHits = signals.filter((signal) => lower.includes(signal.toLocaleLowerCase())).length;
  const requiredHits = Math.min(3, Math.max(2, signals.length));
  if (signals.length >= 2 && signalHits < requiredHits) {
    return `fact-coverage-${signalHits}`;
  }

  return null;
}

function parseNarrationJson(raw: string): string | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return typeof parsed.narration === 'string' ? parsed.narration.trim() : null;
  } catch {
    return null;
  }
}

function fastFailure(reason: string, facts: string[], extra?: Record<string, unknown>) {
  return {
    narration: '',
    sections: {},
    meta: {
      mode: 'fast-local',
      model: NARRATIVE_MODEL,
      fallback: reason,
      sectionsGenerated: 0,
      sectionsFallbacked: 1,
      factCount: facts.length,
      droppedReasons: [reason],
      ...extra,
    },
  };
}

function buildGenericFallback(localName: string, theme: string, language: string): string {
  const code = languageCode(language);

  if (code === 'es') {
    return [
      `Llegamos a ${localName}, una parada de este recorrido sobre ${theme}. Desde aquí, la ciudad se lee en sus detalles: el ritmo de la calle, la escala de lo que nos rodea y el uso cotidiano del espacio.`,
      `Más que un dato aislado, esta parada conecta movimiento, escala y vida urbana.`,
      `Eso es lo que la hace valiosa dentro del paseo: no solo lo que es, sino cómo ayuda a que el siguiente tramo tenga sentido.`
    ].join(' ');
  }

  if (code === 'fr') {
    return [
      `Nous arrivons à ${localName}, une étape de cette promenade autour de ${theme}. Depuis ce point, la ville se lit dans ses détails: le rythme de la rue, l'échelle de ce qui nous entoure et l'usage quotidien de l'espace.`,
      `Plus qu'une donnée isolée, cette étape relie mouvement, échelle et vie urbaine.`,
      `C'est ce qui la rend précieuse dans le parcours: pas seulement ce qu'elle est, mais la façon dont elle aide la suite de la visite à prendre sens.`
    ].join(' ');
  }

  if (code === 'de') {
    return [
      `Wir erreichen ${localName}, eine Station dieses Rundgangs zu ${theme}. Von hier aus liest sich die Stadt in ihren Details: der Rhythmus der Straße, der Maßstab der Umgebung und der alltägliche Gebrauch des Raums.`,
      `Mehr als eine isolierte Angabe verbindet diese Station Bewegung, Maßstab und städtisches Leben.`,
      `Das macht sie im Rundgang wertvoll: nicht nur, was sie ist, sondern wie sie dem nächsten Abschnitt Sinn gibt.`
    ].join(' ');
  }

  if (code === 'it') {
    return [
      `Arriviamo a ${localName}, una tappa di questa passeggiata dedicata a ${theme}. Da qui, la città si legge nei suoi dettagli: il ritmo della strada, la scala di ciò che ci circonda e l'uso quotidiano dello spazio.`,
      `Più che un dato isolato, questa tappa collega movimento, scala e vita urbana.`,
      `È questo che la rende preziosa nel percorso: non solo ciò che è, ma il modo in cui aiuta il tratto successivo ad avere senso.`
    ].join(' ');
  }

  return [
    `We arrive at ${localName}, one stop on this ${theme} walk. From here, the city reads in its details: the rhythm of the street, the scale of what surrounds us, and the everyday use of space.`,
    `More than an isolated fact, this stop connects movement, scale, and urban life.`,
    `That is what makes it valuable in the route: not only what it is, but how it helps the next part of the walk make sense.`
  ].join(' ');
}

/**
 * POST /narrative/stop/fast
 * One-call paid-tour narration endpoint for local models.
 */
router.post('/stop/fast', async (req, res) => {
  const input = req.body as FastNarrationRequest;
  const facts = collectFactPack(input);

  try {
    if (!input.localName || !input.language || !input.theme) {
      return res.status(400).json({
        error: { message: 'Missing required fields: localName, language, theme' },
      });
    }

    if (facts.length < FAST_MIN_FACTS) {
      return res.json(fastFailure('insufficient-facts', facts));
    }

    const bannedPhraseList = GENERIC_FILLER_PATTERNS
      .map((pattern) => pattern.source.replace(/\\b|\(\?:|\)|\?/g, ''))
      .slice(0, 8)
      .join(', ');

    let lastFailure = 'unknown';
    for (let attempt = 0; attempt < 2; attempt++) {
      const systemPrompt = [
        'Write in the voice of a warm, precise, unnamed local guide.',
        'Never claim personal memories, residency, or firsthand experience.',
        `Write in ${input.language}.`,
        'Use only the supplied facts.',
        'Every date, person, place, material, origin, and event must be explicitly supported by the supplied facts. Omit unsupported details and never correct or supplement them from prior knowledge.',
        'Make the stop feel specific enough that a visitor would pay for it.',
        'Do not mention sources, metadata, OSM, Wikidata, Wikipedia, or the prompt.',
        'Output only JSON with a narration field.',
      ].join(' ');

      const userPrompt = [
        `Stop: ${input.localName}`,
        `City: ${input.cityName || 'the city'}`,
        `Theme: ${input.theme}`,
        `Position: ${input.position || 'middle'}${typeof input.stopIndex === 'number' && input.totalStops ? ` (${input.stopIndex + 1}/${input.totalStops})` : ''}`,
        input.previousStopName ? `Previous stop: ${input.previousStopName}` : '',
        input.nextStopName ? `Next stop: ${input.nextStopName}` : '',
        input.narrativeRole ? `Unique editorial role: ${input.narrativeRole}` : '',
        input.centralQuestion ? `Whole-tour question: ${input.centralQuestion}` : '',
        input.transitionPurpose ? `Transition purpose: ${input.transitionPurpose}` : '',
        input.editorialRepairInstructions?.length
          ? `Mandatory repair instructions: ${input.editorialRepairInstructions.join('; ')}`
          : '',
        '',
        'Write one narration of 280-320 words, using at least 12 complete sentences.',
        'Do not stop before completing 12 sentences. This intentionally oversized target compensates for this model writing substantially below requested length.',
        'Before returning JSON, count the narration words. If it has fewer than 260 words, expand it using only the supplied facts.',
        'The visitor has already heard the welcome and tour introduction. Never welcome them again.',
        'Give this stop one distinct main idea. Do not use generic abstractions such as layers, transformation, identity, or memory unless a supplied fact makes the word necessary.',
        'Open and close differently from neighboring stops. The transition must advance the route idea, not merely announce the next place.',
        'Include at least three concrete facts from the list.',
        `Avoid generic filler, including: ${bannedPhraseList}.`,
        attempt > 0 ? `Previous attempt failed because: ${lastFailure}. Rewrite with more concrete facts and fewer abstract phrases.` : '',
        '',
        'Facts:',
        ...facts.map((fact, index) => `${index + 1}. ${fact}`),
        '',
        'Return JSON exactly like: {"narration":"..."}',
      ].filter(Boolean).join('\n');

      const response = await model.chat({
        systemPrompt,
        userPrompt,
        model: NARRATIVE_MODEL,
        temperature: attempt === 0 ? 0.35 : 0.25,
        max_tokens: 600,
        think: false,
        format: 'json',
      });

      if (!response.success || !response.content) {
        lastFailure = response.error || 'empty-response';
        continue;
      }

      const narration = parseNarrationJson(response.content);
      if (!narration) {
        lastFailure = 'json-parse';
        continue;
      }

      const validationFailure = validateFastNarration(narration, facts);
      if (validationFailure) {
        lastFailure = validationFailure;
        continue;
      }

      return res.json({
        narration,
        sections: { narration },
        meta: {
          mode: 'fast-local',
          model: NARRATIVE_MODEL,
          sectionsGenerated: 1,
          sectionsFallbacked: 0,
          factCount: facts.length,
          attempts: attempt + 1,
        },
      });
    }

    return res.json(fastFailure('validation-failed', facts, { validationFailure: lastFailure }));
  } catch (error) {
    console.error('[narrative-fast] generation error:', error);
    return res.json(fastFailure('handler-error', facts, {
      error: error instanceof Error ? error.message : 'unknown',
    }));
  }
});

/**
 * POST /narrative/stop
 * Generates a persona-driven narration paragraph for a single tour stop.
 * Fallback chain: qwen3:4b chat -> Wikipedia extract -> generic fallback.
 * No coordinate or POI invention by the LLM.
 */
router.post('/stop', async (req, res) => {
  try {
    console.log('\n=== Narrative Request ===');
    console.log('Body:', req.body);

    const { localName, wikipediaExtract, theme, language } = req.body as NarrativeStopRequest;

    if (!localName || !language) {
      return res.status(400).json({
        error: { message: 'Missing required fields: localName, language' }
      });
    }

    const systemPrompt = `You are a friendly local guide leading a ${theme} walking tour. You speak ${language}. You give short, engaging narrations about places — factual, warm, directly addressing the visitor as "you". Never invent dates, people, or events not in the facts provided. Never mention coordinates or street addresses.`;

    const factContext = wikipediaExtract
      ? `Facts: ${wikipediaExtract.slice(0, 400)}`
      : `This is a notable place called ${localName}.`;

    const userPrompt = `Write 2-3 sentences in ${language} about ${localName} for the tour. ${factContext} Return JSON: {"narration": "your text here"}`;

    console.log('\n=== Narrative Prompts ===');
    console.log('System:', systemPrompt);
    console.log('User:', userPrompt);

    const response = await model.chat({
      systemPrompt,
      userPrompt,
      model: NARRATIVE_MODEL,
      temperature: 0.4,
      max_tokens: 350,
      think: false,
      format: 'json'
    });

    console.log('\n=== Narrative Chat Response ===');
    console.log(response);

    if (response.success && response.content) {
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const narration = parsed.narration?.trim();
          if (narration && narration.length > 0) {
            return res.json({ narration });
          }
        }
      } catch {
        console.warn('[narrative] JSON parse failed, falling back');
      }
    }

    // Fallback 1: use Wikipedia extract directly
    if (wikipediaExtract && wikipediaExtract.trim().length > 0) {
      console.warn(`[narrative] LLM fallback for "${localName}" — using Wikipedia extract`);
      return res.json({ narration: buildNarrationFromExtract(localName, wikipediaExtract) });
    }

    // Fallback 2: generic
    console.warn(`[narrative] Generic fallback for "${localName}"`);
    res.json({ narration: buildGenericFallback(localName, theme, language) });

  } catch (error) {
    console.error('Narrative generation error:', error);
    // Don't return 500 — always give the caller something usable
    const { localName, wikipediaExtract } = req.body as NarrativeStopRequest;
    const fallback = wikipediaExtract?.slice(0, 400)?.trim() || buildGenericFallback(localName || 'this location', 'walking', req.body?.language || 'en');
    res.json({ narration: fallback });
  }
});

export default router;
