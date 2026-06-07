/**
 * Madrid Knowledge Base enrichment service.
 * Queries the turbovec semantic search index for rich context about Madrid POIs.
 */
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

const ENRICHMENT_SCRIPT = path.resolve(__dirname, '../../../../pods/llm-pod/src/enrichment/enrich.py');
const INDEX_DIR = path.resolve(__dirname, '../../../../pods/llm-pod/src/enrichment/madrid_index');
const VENV_PYTHON = process.env.ENRICHMENT_PYTHON || 'python3';

export interface EnrichedContext {
  similarity: number;
  text: string;
  place: string;
  theme: string;
}

let enrichmentAvailable: boolean | null = null;

function checkEnrichmentAvailable(): boolean {
  if (enrichmentAvailable !== null) return enrichmentAvailable;

  const indexExists = fs.existsSync(path.join(INDEX_DIR, 'index.npy'))
    && fs.existsSync(path.join(INDEX_DIR, 'texts.json'))
    && fs.existsSync(ENRICHMENT_SCRIPT);

  enrichmentAvailable = indexExists;
  if (!indexExists) {
    console.warn('[MadridKB] Enrichment index not found. Run: python3 enrich.py build');
  }
  return enrichmentAvailable;
}

export async function enrichContext(
  placeName: string,
  theme: string,
  language: string = 'es',
  k: number = 3
): Promise<EnrichedContext[]> {
  if (!checkEnrichmentAvailable()) return [];

  const query = `${placeName} ${theme}`;
  const args = [ENRICHMENT_SCRIPT, 'search', INDEX_DIR, query, '--k', String(k)];

  return new Promise((resolve) => {
    execFile(VENV_PYTHON, args, {
      timeout: 15000,
      maxBuffer: 1024 * 100,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    }, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[MadridKB] Enrichment query failed: ${error.message}`);
        return resolve([]);
      }

      try {
        const results: EnrichedContext[] = JSON.parse(stdout);
        console.log(`[MadridKB] Enriched "${placeName}" with ${results.length} passages`);
        resolve(results);
      } catch (parseError) {
        console.warn(`[MadridKB] Failed to parse enrichment results`);
        resolve([]);
      }
    });
  });
}

/**
 * Builds an enriched seed text by combining existing seeds with context from the Madrid KB.
 */
export async function enrichSeeds(
  existingSeeds: { wikipediaLead?: string; wikipediaBody?: string; osmTags?: Record<string, string> },
  placeName: string,
  theme: string,
  language: string = 'es'
): Promise<string> {
  const contexts = await enrichContext(placeName, theme, language);

  const parts: string[] = [];

  // Existing seeds
  if (existingSeeds.wikipediaLead) parts.push(existingSeeds.wikipediaLead);
  if (existingSeeds.wikipediaBody) parts.push(existingSeeds.wikipediaBody);

  // Enriched context — similarity is 1 - cosine_distance (higher = more similar)
  for (const ctx of contexts) {
    if (ctx.similarity > 0.15) {  // Only use results with at least weak semantic relevance
      parts.push(ctx.text);
    }
  }

  return parts.join('\n\n');
}
