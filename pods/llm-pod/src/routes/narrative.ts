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
