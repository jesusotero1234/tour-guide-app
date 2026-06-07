import axios, { AxiosError } from 'axios';

const USER_AGENT = 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)';
const WIKIPEDIA_API_BASE = 'https://{lang}.wikipedia.org/w/api.php';
const MIN_INTERVAL_MS = 500;

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface WikipediaEnrichment {
  description: string;
  body: string;
  language: string;
  wikipediaUrl: string;
}

async function fetchExtract(lang: string, title: string, introOnly: boolean): Promise<string | null> {
  const url = WIKIPEDIA_API_BASE.replace('{lang}', lang);
  const params: Record<string, string | boolean | number> = {
    action: 'query',
    prop: 'extracts',
    explaintext: true,
    redirects: true,
    titles: title,
    format: 'json',
    formatversion: 2,
  };

  if (introOnly) {
    params.exintro = true;
    params.exsentences = 3;
  } else {
    params.exsectionformat = 'plain';
  }

  try {
    const response = await axios.get(url, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });

    const pages = response.data?.query?.pages ?? [];
    if (!Array.isArray(pages) || pages.length === 0) return null;
    const page = pages[0];
    if (page.missing || !page.extract) return null;
    const extract = page.extract.trim();
    if (!extract) return null;
    return introOnly ? extract : extract.slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * Parse an OSM wikipedia tag of the form "lang:Title" or just "Title".
 */
function parseOsmWikipediaTag(tag: string): { lang: string; title: string } {
  const colonIdx = tag.indexOf(':');
  if (colonIdx > 0 && colonIdx < 4) {
    return { lang: tag.slice(0, colonIdx), title: tag.slice(colonIdx + 1) };
  }
  return { lang: 'en', title: tag };
}

export async function enrichFromWikipedia(
  osmWikipediaTag: string,
  preferredLang: string
): Promise<WikipediaEnrichment | null> {
  await enforceRateLimit();

  const { lang: osmLang, title } = parseOsmWikipediaTag(osmWikipediaTag);

  // Try preferred language first, then OSM language, then English
  const langCandidates = [preferredLang, osmLang, 'en'].filter(
    (l, i, arr) => arr.indexOf(l) === i
  );

  for (const lang of langCandidates) {
    const lead = await fetchExtract(lang, title, true);
    if (lead) {
      const body = await fetchExtract(lang, title, false);
      return {
        description: lead,
        body: body || lead,
        language: lang,
        wikipediaUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      };
    }
  }

  return null;
}
