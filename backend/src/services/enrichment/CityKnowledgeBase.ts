/**
 * City Knowledge Base enrichment service.
 * Queries the llm-pod /enrichment/search endpoint for rich context about POIs.
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { prismaClient } from '../../infrastructure/db/prismaClient';
import { PostgresEnrichmentCacheRepository } from '../../infrastructure/postgres/PostgresEnrichmentCacheRepository';

export interface EnrichedContext {
  similarity: number;
  text: string;
  place: string;
  theme: string;
}

const INDEX_BASE_DIR = process.env.ENRICHMENT_INDEX_BASE_DIR
  || path.resolve(__dirname, '../../pods/llm-pod/enrichment');

// Feature flag: comma-separated list of cities with RAG enabled.
// Set to '*' to enable all, or 'madrid,barcelona' for specific cities.
// Default: only Madrid is enabled (backward compatible, safe rollout).
const ENABLED_CITIES = (process.env.ENRICHMENT_ENABLED_CITIES || 'madrid')
  .split(',').map(c => c.trim().toLowerCase());

function isCityEnabled(city: string): boolean {
  if (ENABLED_CITIES.includes('*')) return true;
  return ENABLED_CITIES.includes(city.toLowerCase());
}

function cityIndexExists(city: string): boolean {
  const cityKey = city.toLowerCase().replace(/\s+/g, '_');
  const indexDir = path.join(INDEX_BASE_DIR, `${cityKey}_index`);
  return fs.existsSync(path.join(indexDir, 'index.npy'))
    && fs.existsSync(path.join(indexDir, 'texts.json'));
}

const enrichmentCache = new PostgresEnrichmentCacheRepository(prismaClient);

export async function enrichContext(
  city: string,
  placeName: string,
  theme: string,
  language: string = 'es',
  k: number = 3,
  llmServiceUrl?: string
): Promise<EnrichedContext[]> {
  if (!isCityEnabled(city)) {
    console.warn(`[CityKB] RAG not enabled for city: ${city} (ENRICHMENT_ENABLED_CITIES=${ENABLED_CITIES})`);
    return [];
  }

  if (!cityIndexExists(city)) {
    console.warn(`[CityKB] No enrichment index for city: ${city}`);
    return [];
  }

  // Check cache first (best-effort — falls through if table doesn't exist)
  try {
    const cached = await enrichmentCache.get(city, placeName, theme, language);
    if (cached) return cached;
  } catch {
    // Cache miss or table missing — query enrichment server directly
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
      // Cache for future queries (best-effort)
      enrichmentCache.set(city, placeName, theme, language, query, results).catch(() => {});
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
      if (ctx.similarity > 0.35) {
        parts.push(ctx.text);
      }
    }
  }

  return parts.join('\n\n');
}
