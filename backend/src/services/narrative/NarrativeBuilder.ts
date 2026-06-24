import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { prismaClient } from '../../infrastructure/db/prismaClient';
import { PostgresNarrationCacheRepository } from '../../infrastructure/postgres/PostgresNarrationCacheRepository';
import { enrichSeeds } from '../enrichment/CityKnowledgeBase';

const MODEL_VERSION = process.env.NARRATIVE_MODEL_VERSION || 'qwen2.5:14b';

export interface NarrativeSections {
  arrival?: string;
  history?: string;
  significance?: string;
  transition?: string;
  [section: string]: string | undefined;
}

export interface BuiltNarration {
  narration: string;
  sections: NarrativeSections | null;
  meta?: Record<string, unknown>;
  traceId?: string;
}

export interface NarrativeStop {
  poi: EnrichedPoi;
  narration: string;
}

// ── Tour-level opening tracker (prevents repetitive starts) ──────────
const tourOpenings = new Map<string, string[]>();

const OPENING_ARCHETYPES = [
  'anecdotal: start with a specific person, event, or curious detail tied to this place',
  'sensory: open with a sound, smell, or texture that defines the atmosphere right now',
  'contrast: begin by contrasting something old vs. new, or expected vs. surprising',
  'question: start with a rhetorical question that hooks curiosity about this stop',
  'scene: open by painting a quick scene — who is here, what are they doing, what does the light look like',
  'detail: zoom in on one small architectural or urban detail and use it as a lens for the whole stop',
  'rumour: begin with something a local might tell you — not a date, but an observation passed down',
  'scale: open by describing the physical scale or position of this place within the city fabric',
];

/** Simple string hash for deterministic seeding. */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Fisher-Yates shuffle with a deterministic seed (Lehmer RNG). */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Pick an archetype deterministically per tour (seeded by tourKey) to avoid identical
 *  sequences across different tours of the same length. */
function pickArchetype(tourKey: string, stopIndex: number): string {
  const shuffled = shuffleWithSeed(OPENING_ARCHETYPES, hashCode(tourKey));
  return shuffled[stopIndex % shuffled.length];
}

function recordOpeningStyle(tourKey: string, style: string): void {
  const styles = tourOpenings.get(tourKey) || [];
  if (!styles.includes(style)) {
    styles.push(style);
    tourOpenings.set(tourKey, styles);
  }
}

function getUsedOpenings(tourKey: string): string[] {
  return tourOpenings.get(tourKey) || [];
}

const narrationCache = new PostgresNarrationCacheRepository(prismaClient, MODEL_VERSION);

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isFallbackLikeNarration(text: string): boolean {
  const trimmed = text.trim();
  return /^Visit\s+.+\.$/i.test(trimmed)
    || /^Visit\s+.+,\s+a notable/i.test(trimmed)
    || /^Visita\s+.+\.$/i.test(trimmed);
}

function summarizeTags(poi: EnrichedPoi): string {
  return Object.entries(poi.enriched.osmTags || {})
    .slice(0, 4)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'public place';
}

function buildGroundedFallbackNarration(params: {
  localName: string;
  cityName?: string;
  theme: string;
  language: string;
  position: 'first' | 'middle' | 'last';
  nextStopName?: string;
  poi: EnrichedPoi;
}): BuiltNarration {
  const cityName = params.cityName || 'this city';
  const tagSummary = summarizeTags(params.poi);
  const nextStop = params.nextStopName || 'the next stop';
  const languageCode = params.language.slice(0, 2).toLowerCase();

  if (languageCode === 'es') {
    const arrival = params.position === 'first'
      ? `Bienvenidos a esta caminata por ${cityName}. Empezamos en ${params.localName}, un lugar que merece una mirada atenta. Su arquitectura y su posición dentro de la trama urbana ya sugieren pistas sobre cómo se organiza y se vive la ciudad.`
      : `Llegamos a ${params.localName}, una parada de este recorrido por ${cityName}. Cada rincón de la ciudad ofrece señales concretas sobre su ritmo, su escala y la forma en que ${cityName} se deja recorrer a pie.`;
    const history = `Los datos disponibles lo describen con detalles como ${tagSummary}. Esa información permite hablar de este lugar con fundamento: sin necesidad de adornos, la propia geografía urbana cuenta una historia de transformación, uso y permanencia.`;
    const significance = params.position === 'last'
      ? `Antes de cerrar la caminata, vale la pena observar cómo esta parada resume algo importante del recorrido. En un paseo sobre ${params.theme}, su valor está en conectar espacio, uso y memoria cotidiana, ofreciendo un cierre con sentido.`
      : `En este paseo sobre ${params.theme}, ${params.localName} ayuda a conectar espacio, uso y memoria. Desde aquí seguimos hacia ${nextStop}, llevando estas observaciones al siguiente tramo.`;
    return {
      narration: [arrival, history, significance].join('\n\n'),
      sections: { arrival, history, significance },
      meta: { fallback: 'grounded-template' },
    };
  }

  if (languageCode === 'fr') {
    const arrival = params.position === 'first'
      ? `Bienvenue dans cette promenade à travers ${cityName}. Nous commençons à ${params.localName}, non pas par une grande déclaration, mais par ce que la rue donne déjà à voir: l'échelle du lieu, le mouvement autour de nous et la façon dont la ville se laisse lire à pied.`
      : `Nous arrivons à ${params.localName}, une étape de cette promenade dans ${cityName}. Ici, le regard peut s'arrêter sur l'échelle du lieu, le mouvement autour de nous et la manière dont cette partie de la ville se vit à pied.`;
    const history = `Autour de ${params.localName}, quelques indices concrets comme ${tagSummary} suffisent à guider l'observation. Le lieu prend sens par sa position dans la ville, par les usages qui l'entourent et par le rythme quotidien qu'il révèle.`;
    const significance = params.position === 'last'
      ? `Avant de terminer la promenade, cette étape rassemble plusieurs fils du parcours. Dans une visite consacrée à ${params.theme}, elle rappelle que l'histoire d'une ville se lit aussi dans ses espaces ordinaires, ses passages et ses habitudes.`
      : `Dans cette visite consacrée à ${params.theme}, ${params.localName} sert de point d'appui pour relier espace, usage et mémoire urbaine. D'ici, nous continuons vers ${nextStop}, avec cette lecture du lieu en tête.`;
    return {
      narration: [arrival, history, significance].join('\n\n'),
      sections: { arrival, history, significance },
      meta: { fallback: 'grounded-template' },
    };
  }

  if (languageCode === 'de') {
    const arrival = params.position === 'first'
      ? `Willkommen zu diesem Rundgang durch ${cityName}. Wir beginnen bei ${params.localName}, einem Ort, der sich von hier aus im Gehen erschliesst: der Rhythmus der Strasse, die Massstäbe der Fassaden und der alltägliche Gebrauch geben bereits den Ton der Führung vor.`
      : `Wir erreichen ${params.localName}, eine Station dieses Rundgangs durch ${cityName}. Von hier aus liest sich die Stadt auf Gehhöhe: Massstab, Bewegung und die Art, wie dieser Teil der Stadt zu Fuss erfahren wird.`;
    const history = `Rund um ${params.localName} genügen die Hinweise (${tagSummary}), um den Blick zu schärfen: kein isoliertes Dekor, sondern ein Stück Stadt, in dem sich Verkehr, Architektur und Alltagsleben kreuzen.`;
    const significance = params.position === 'last'
      ? `Bevor wir den Rundgang beenden, sammelt diese Station mehrere Fäden der Route ein. In einem Rundgang zu ${params.theme} liegt ihr Wert darin, Raum, Nutzung und städtisches Gedächtnis zu verbinden — ohne grosse historische Ansage.`
      : `Auf diesem Rundgang zu ${params.theme} liegt der Wert von ${params.localName} nicht nur im Namen, sondern darin, wie der Ort Raum, Nutzung und städtisches Gedächtnis verbindet. Von hier aus gehen wir weiter nach ${nextStop}, mit diesem lesenden Blick im Kopf.`;
    return {
      narration: [arrival, history, significance].join('\n\n'),
      sections: { arrival, history, significance },
      meta: { fallback: 'grounded-template' },
    };
  }

  if (languageCode === 'it') {
    const arrival = params.position === 'first'
      ? `Benvenuti in questa passeggiata attraverso ${cityName}. Cominciamo da ${params.localName}, una tappa che vale la pena osservare con calma prima di proseguire. Da qui, la città si legge a passo d'uomo: il ritmo della strada, la scala delle facciate e l'uso quotidiano danno già il tono della visita.`
      : `Arriviamo a ${params.localName}, una tappa di questa passeggiata a ${cityName}. Qui lo sguardo può fermarsi sulla scala del luogo, sul movimento intorno a noi e sul modo in cui questa parte della città si vive a piedi.`;
    const history = `Attorno a ${params.localName}, alcuni indizi concreti come ${tagSummary} bastano a guidare l'osservazione. Il luogo prende senso dalla sua posizione nella città, dagli usi che lo circondano e dal ritmo quotidiano che rivela.`;
    const significance = params.position === 'last'
      ? `Prima di chiudere la passeggiata, questa tappa raccoglie diversi fili del percorso. In un itinerario dedicato a ${params.theme}, ricorda che la storia di una città si legge anche nei suoi spazi ordinari, nei suoi passaggi e nelle sue abitudini.`
      : `In questa passeggiata dedicata a ${params.theme}, ${params.localName} serve da punto d'appoggio per collegare spazio, uso e memoria urbana. Da qui continuiamo verso ${nextStop}, con questa lettura del luogo in testa.`;
    return {
      narration: [arrival, history, significance].join('\n\n'),
      sections: { arrival, history, significance },
      meta: { fallback: 'grounded-template' },
    };
  }

  const arrival = params.position === 'first'
    ? `Welcome to this walk through ${cityName}. We begin at ${params.localName}, not with a grand announcement, but with what the street already offers: the scale of the place, the movement around us, and the way the city lets itself be read on foot.`
    : `We arrive at ${params.localName}, one stop on this walk through ${cityName}. Here, the eye can rest on the scale of the place, the movement around us, and the way this part of the city is experienced on foot.`;
  const history = `Around ${params.localName}, a few concrete clues like ${tagSummary} are enough to guide the eye. The place takes its meaning from its position in the city, from the uses that surround it, and from the everyday rhythm it reveals.`;
  const significance = params.position === 'last'
    ? `Before we close the walk, this stop gathers several threads of the route. On a ${params.theme} walk, it reminds us that a city's story is also read in its ordinary spaces, its passages, and its habits.`
    : `On this ${params.theme} walk, ${params.localName} serves as a touchpoint for connecting space, use, and urban memory. From here we continue toward ${nextStop}, with this way of reading the place in mind.`;
  return {
    narration: [arrival, history, significance].join('\n\n'),
    sections: { arrival, history, significance },
    meta: { fallback: 'grounded-template' },
  };
}

function seedSizes(poi: EnrichedPoi): Record<string, number> {
  return {
    wikipediaLead: (poi.enriched.wikipediaLead || '').length,
    wikipediaBody: (poi.enriched.wikipediaBody || '').length,
    wikidataClaims: JSON.stringify(poi.enriched.wikidataClaims || {}).length,
    osmTags: JSON.stringify(poi.enriched.osmTags || {}).length,
    wikivoyage: (poi.enriched.wikivoyage || '').length,
  };
}

function shouldCacheBuiltNarration(meta: Record<string, unknown> | undefined): boolean {
  const sectionsGenerated = typeof meta?.sectionsGenerated === 'number' ? meta.sectionsGenerated : 0;
  const sectionsFallbacked = typeof meta?.sectionsFallbacked === 'number' ? meta.sectionsFallbacked : 0;
  return sectionsGenerated === 0 || sectionsFallbacked < sectionsGenerated;
}

/**
 * Calls the llm-pod /narrative/stop endpoint to generate a persona-driven
 * narration paragraph from factual POI seeds.
 * No coordinates or invented details are passed to or expected from the LLM.
 */
export async function buildNarration(
  poi: EnrichedPoi,
  theme: string,
  language: string,
  llmServiceUrl: string,
  position: 'first' | 'middle' | 'last' = 'middle',
  nextStopName?: string,
  tourMeta?: {
    cityName?: string;
    totalStops?: number;
    tourDurationMinutes?: number;
    stopIndex?: number;
    previousStopName?: string;
    tourStopNames?: string[];
  }
): Promise<BuiltNarration> {
  const localName = poi.enriched.nameTranslations[language] || poi.name || poi.tags.name || 'this location';
  const wikipediaExtract = poi.enriched.description;
  const poiId = `${poi.osmType}/${poi.osmId}`;
  const shouldUseCache = position === 'middle';
  const routeSignature = JSON.stringify({
    cityName: tourMeta?.cityName,
    stopIndex: tourMeta?.stopIndex,
    stops: tourMeta?.tourStopNames,
  });
  const cacheTheme = `${theme}:route-v1:${crypto.createHash('sha1').update(routeSignature).digest('hex').slice(0, 12)}`;
  const traceId = crypto.randomUUID();

  // First/last narrations include position-specific welcome/goodbye content, but the cache key has no position.
  if (shouldUseCache) {
    const cached = await narrationCache.get(poiId, language, cacheTheme);
    if (cached) {
      // Cache only applies to middle stops (first/last always regenerate).
      // Middle stops require ≥100 words to be considered quality.
      if (isFallbackLikeNarration(cached.narration) || countWords(cached.narration) < 100) {
        console.warn('[NarrativeBuilder]', JSON.stringify({
          event: 'cache-hit-ignored-weak-narration',
          traceId,
          stopName: localName,
          position,
          language,
          theme,
        }));
      } else {
      console.log('[NarrativeBuilder]', JSON.stringify({
        event: 'cache-hit',
        traceId,
        stopName: localName,
        position,
        language,
        theme,
      }));
      return { narration: cached.narration, sections: cached.sections, traceId, meta: { cacheHit: true } };
      }
    }
  }

  try {
    // ── Enrichment: always query RAG with thematic context ──────────
    // Always attempt enrichment with k=3 and let the retrieval quality
    // filter (similarity > 0.35) determine whether passages are injected.

    let enrichedText = '';
    // Always query RAG (k=3) — retrieval quality filter handles relevance
    const enrichmentK = 3;

    try {
      const lead = poi.enriched.wikipediaLead ?? undefined;
      const body = poi.enriched.wikipediaBody ?? undefined;
      enrichedText = await enrichSeeds(
        {
          wikipediaLead: lead,
          wikipediaBody: body,
          osmTags: poi.enriched.osmTags,
        },
        localName,
        theme,
        language,
        enrichmentK,
        tourMeta?.cityName,
        llmServiceUrl
      );
      if (enrichedText) {
        console.log('[NarrativeBuilder]', JSON.stringify({
          event: 'enriched-seeds',
          traceId,
          stopName: localName,
          enrichedChars: enrichedText.length,
        }));
      }
    } catch (enrichError) {
      // Enrichment is best-effort; continue with original seeds
      console.warn('[NarrativeBuilder] enrichment skipped:', (enrichError as Error).message);
    }

    // ── Track openings per tour to avoid repetition ────────────────
    const tourKey = `${tourMeta?.cityName || 'city'}-${theme}-${language}`;
    // Deterministic index per stop: first=0, last=N-1, middle=hash(tourKey+stopName)
    const stopIndex = tourMeta?.stopIndex ?? (position === 'first' ? 0
      : position === 'last' ? (tourMeta?.totalStops || 5) - 1
      : hashCode(`${tourKey}:${localName}`) % OPENING_ARCHETYPES.length);
    const archetype = pickArchetype(tourKey, stopIndex);
    const usedOpenings = getUsedOpenings(tourKey);
    recordOpeningStyle(tourKey, archetype);

    console.log('[NarrativeBuilder]', JSON.stringify({
      event: 'long-request',
      traceId,
      url: `${llmServiceUrl}/narrative/stop/long`,
      stopName: localName,
      position,
      language,
      theme,
      seedSizes: seedSizes(poi),
    }));
    const longResponse = await axios.post(
      `${llmServiceUrl}/narrative/stop/long`,
      {
        traceId,
        localName,
        seeds: {
          wikipediaLead: poi.enriched.wikipediaLead,
          wikipediaBody: poi.enriched.wikipediaBody,
          wikidataClaims: poi.enriched.wikidataClaims,
          osmTags: poi.enriched.osmTags,
          wikivoyage: poi.enriched.wikivoyage,
          enrichedContext: enrichedText || undefined,
        },
        theme,
        language,
        previousStopName: tourMeta?.previousStopName,
        nextStopName,
        tourStopNames: tourMeta?.tourStopNames,
        position,
        cityName: tourMeta?.cityName,
        totalStops: tourMeta?.totalStops,
        stopIndex,
        tourDurationMinutes: tourMeta?.tourDurationMinutes,
        usedOpenings,
        openingArchetype: archetype,
      },
      { timeout: 120000 }
    );

    const longNarration = longResponse.data?.narration;
    const sections = longResponse.data?.sections;
    const meta = longResponse.data?.meta;
    console.log('[NarrativeBuilder]', JSON.stringify({
      event: 'long-response',
      traceId,
      stopName: localName,
      position,
      language,
      theme,
      meta,
      droppedReasons: meta?.droppedReasons || [],
    }));
    if (typeof longNarration === 'string' && longNarration.trim().length > 0) {
      const built = {
        narration: longNarration.trim(),
        sections: sections && typeof sections === 'object' ? sections : null,
        meta: meta && typeof meta === 'object' ? meta : undefined,
        traceId,
      };
      if (isFallbackLikeNarration(built.narration) || countWords(built.narration) < 100) {
        const fallback = buildGroundedFallbackNarration({ localName, cityName: tourMeta?.cityName, theme, language, position, nextStopName, poi });
        return { ...fallback, traceId, meta: { ...fallback.meta, replacedWeakNarration: true } };
      }
      if (shouldUseCache && shouldCacheBuiltNarration(built.meta)) {
        await narrationCache.set(poiId, language, cacheTheme, {
          narration: built.narration,
          sections: built.sections || {},
        });
      } else if (shouldUseCache) {
        console.warn('[NarrativeBuilder]', JSON.stringify({
          event: 'cache-skip-all-fallback',
          traceId,
          stopName: localName,
          position,
          language,
          theme,
          meta: built.meta,
        }));
      }
      return built;
    }

    console.warn('[NarrativeBuilder]', JSON.stringify({ event: 'empty-long-narration', traceId, stopName: localName, position, language, theme, meta }));
    const response = await axios.post(
      `${llmServiceUrl}/narrative/stop`,
      { localName, wikipediaExtract, theme, language },
      { timeout: 30000 }
    );

    if (response.data?.narration && typeof response.data.narration === 'string') {
      const narration = response.data.narration.trim();
      if (!isFallbackLikeNarration(narration) && countWords(narration) >= 100) {
        return { narration, sections: null, traceId, meta: { fallback: 'short-endpoint' } };
      }
    }

    console.warn('[NarrativeBuilder]', JSON.stringify({ event: 'empty-short-narration', traceId, stopName: localName, position, language, theme }));
    return { ...buildGroundedFallbackNarration({ localName, cityName: tourMeta?.cityName, theme, language, position, nextStopName, poi }), traceId };

  } catch (err) {
    const axiosErr = err as AxiosError;
    console.warn('[NarrativeBuilder]', JSON.stringify({ event: 'long-request-failed', traceId, stopName: localName, position, language, theme, error: axiosErr.message }));

    try {
      const response = await axios.post(
        `${llmServiceUrl}/narrative/stop`,
        { localName, wikipediaExtract, theme, language },
        { timeout: 30000 }
      );

      if (response.data?.narration && typeof response.data.narration === 'string') {
        const narration = response.data.narration.trim();
        if (!isFallbackLikeNarration(narration) && countWords(narration) >= 100) {
          return { narration, sections: null, traceId, meta: { fallback: 'short-endpoint' } };
        }
      }
    } catch (shortErr) {
      const shortAxiosErr = shortErr as AxiosError;
      console.warn('[NarrativeBuilder]', JSON.stringify({ event: 'short-request-failed', traceId, stopName: localName, position, language, theme, error: shortAxiosErr.message }));
    }

    return { ...buildGroundedFallbackNarration({ localName, cityName: tourMeta?.cityName, theme, language, position, nextStopName, poi }), traceId };
  }
}
