import { AxiosError } from 'axios';
import { enrichFromWikidataBatch } from './WikidataEnricher';

export async function enrichFromWikidataClaims(
  wikidataId: string,
  language: string
): Promise<Record<string, string> | null> {
  try {
    const enriched = await enrichFromWikidataBatch([wikidataId], language);
    return enriched[wikidataId]?.wikidataClaims ?? null;
  } catch (err) {
    const axiosErr = err as AxiosError;
    console.warn(`[WikidataClaimsEnricher] Failed to fetch claims for ${wikidataId}: ${axiosErr.message}`);
    return null;
  }
}
