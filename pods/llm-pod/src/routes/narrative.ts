import express from 'express';
import { model } from '../llm/model';

const router = express.Router();

const NARRATIVE_MODEL = 'qwen3:4b';

function languageCode(language: string | undefined): string {
  return (language || 'en').slice(0, 2).toLowerCase();
}

export interface NarrativeStopRequest {
  localName: string;
  wikipediaExtract: string | null;
  theme: string;
  language: string;
}

function buildNarrationFromExtract(localName: string, extract: string): string {
  const trimmed = extract.slice(0, 400).trim();
  return trimmed.length > 0 ? trimmed : `You are standing at ${localName}, a stop worth observing for how it fits into the rhythm of the city around you.`;
}

function buildGenericFallback(localName: string, theme: string, language: string): string {
  const code = languageCode(language);

  if (code === 'es') {
    return [
      `Llegamos a ${localName}, una parada de este recorrido sobre ${theme}. Aunque las fuentes disponibles sean limitadas, el lugar todavia puede leerse a partir de lo que muestra en el espacio urbano.`,
      `Mas que inventar una gran historia, conviene observar como esta parada se relaciona con el movimiento, la escala y el uso cotidiano de la ciudad.`,
      `Eso es precisamente lo que la vuelve util dentro del paseo: no solo lo que es, sino como ayuda a entender el siguiente tramo del recorrido.`
    ].join(' ');
  }

  if (code === 'fr') {
    return [
      `Nous arrivons a ${localName}, une etape de cette promenade autour de ${theme}. Meme lorsque les sources disponibles sont limitees, le lieu peut encore se lire a travers la facon dont il structure l'espace urbain.`,
      `Plutot que d'inventer une grande histoire, il vaut mieux observer comment cette etape relie le mouvement, l'echelle et l'usage quotidien de la ville.`,
      `C'est justement ce qui la rend utile dans le parcours: pas seulement ce qu'elle est, mais la facon dont elle aide la suite de la visite a prendre sens.`
    ].join(' ');
  }

  if (code === 'de') {
    return [
      `Wir erreichen ${localName}, eine Station dieses Rundgangs zu ${theme}. Selbst wenn die verfuegbaren Quellen begrenzt sind, laesst sich der Ort noch ueber die Art lesen, wie er den Stadtraum praegt.`,
      `Statt eine grosse Geschichte zu erfinden, ist es sinnvoller zu beobachten, wie diese Station Bewegung, Massstab und alltaegliche Nutzung der Stadt miteinander verbindet.`,
      `Genau das macht sie fuer die Route nuetzlich: nicht nur, was sie ist, sondern wie sie dem naechsten Abschnitt Bedeutung gibt.`
    ].join(' ');
  }

  if (code === 'it') {
    return [
      `Arriviamo a ${localName}, una tappa di questa passeggiata dedicata a ${theme}. Anche quando le fonti disponibili sono limitate, il luogo puo ancora essere letto attraverso il modo in cui modella lo spazio urbano.`,
      `Piu che inventare una grande storia, conviene osservare come questa tappa colleghi movimento, scala e uso quotidiano della citta.`,
      `E proprio questo che la rende utile nel percorso: non solo cio che e, ma il modo in cui aiuta il tratto successivo del tour ad avere senso.`
    ].join(' ');
  }

  return [
    `We arrive at ${localName}, one stop on this ${theme} walk. Even when the available sources are limited, the place can still be read through the way it shapes the space around you.`,
    `Rather than inventing a dramatic backstory, it is better to notice how this stop connects movement, scale, and everyday urban use.`,
    `That is what makes it useful in the route: not only what it is called, but how it helps the next part of the walk make sense.`
  ].join(' ');
}

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
