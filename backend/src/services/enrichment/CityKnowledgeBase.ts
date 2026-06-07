/**
 * City Knowledge Base enrichment service.
 * Queries the llm-pod /enrichment/search endpoint for rich context about POIs.
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface EnrichedContext {
  similarity: number;
  text: string;
  place: string;
  theme: string;
}

const INDEX_BASE_DIR = process.env.ENRICHMENT_INDEX_BASE_DIR
  || path.resolve(__dirname, '../../../../pods/llm-pod/src/enrichment');

function cityIndexExists(city: string): boolean {
  const cityKey = city.toLowerCase().replace(/\s+/g, '_');
  const indexDir = path.join(INDEX_BASE_DIR, `${cityKey}_index`);
  return fs.existsSync(path.join(indexDir, 'index.npy'))
    && fs.existsSync(path.join(indexDir, 'texts.json'));
}

export async function enrichContext(
  city: string,
  placeName: string,
  theme: string,
  language: string = 'es',
  k: number = 3,
  llmServiceUrl?: string
): Promise<EnrichedContext[]> {
  if (!cityIndexExists(city)) {
    console.warn(`[CityKB] No enrichment index for city: ${city}`);
    return [];
  }

  const query = `${placeName} ${theme}`;
  const baseUrl = llmServiceUrl || 'http://localhost:3002';

  try {
    const response = await axios.post(
      `${baseUrl}/enrichment/search`,
      { city, query, k, language },
      { timeout: 10000 }
    );

    const results: EnrichedContext[] = response.data?.results || [];
    if (results.length > 0) {
      console.log(`[CityKB] Enriched "${placeName}" (${city}) with ${results.length} passages`);
    }
    return results;
  } catch (error) {
    console.warn(`[CityKB] Enrichment query failed for ${city}/${placeName}: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Builds an enriched seed text for narrative generation.
 * @param k - number of enrichment passages to retrieve (progressive: 5 for very thin, 2 for medium, 0 to skip)
 */
export async function enrichSeeds(
  existingSeeds: { wikipediaLead?: string; wikipediaBody?: string; osmTags?: Record<string, string> },
  placeName: string,
  theme: string,
  language: string = 'es',
  k: number = 3,
  city?: string,
  llmServiceUrl?: string
): Promise<string> {
  const parts: string[] = [];

  if (existingSeeds.wikipediaLead) parts.push(existingSeeds.wikipediaLead);
  if (existingSeeds.wikipediaBody) parts.push(existingSeeds.wikipediaBody);

  if (city && k > 0) {
    const contexts = await enrichContext(city, placeName, theme, language, k, llmServiceUrl);
    for (const ctx of contexts) {
      if (ctx.similarity > 0.15) {
        parts.push(ctx.text);
      }
    }
  }

  return parts.join('\n\n');
}
