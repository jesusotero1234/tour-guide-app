import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { RawPoi } from '../../domain/poi/RawPoi';
import { enrichFromWikidataBatch } from '../../infrastructure/enrichment/WikidataEnricher';
import { enrichFromWikipedia } from '../../infrastructure/enrichment/WikipediaEnricher';
import { PostgresPoiEnrichmentCacheRepository } from '../../infrastructure/postgres/PostgresPoiEnrichmentCacheRepository';

function buildOsmSeedTags(poi: RawPoi): Record<string, string> {
  return Object.fromEntries(
    ['start_date', 'architect', 'heritage', 'building', 'historic', 'tourism']
      .map((key) => [key, poi.tags[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
  );
}

export async function enrichShortlistedPois(
  pois: RawPoi[],
  language: string,
  cacheRepository: PostgresPoiEnrichmentCacheRepository | null,
  batchSize = 4
): Promise<EnrichedPoi[]> {
  const enriched: EnrichedPoi[] = [];

  for (let index = 0; index < pois.length; index += batchSize) {
    const batch = pois.slice(index, index + batchSize);
    const wikidataIds = batch
      .map((poi) => poi.tags.wikidata)
      .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0);

    const cachedWikidataEntries = cacheRepository
      ? await Promise.all(wikidataIds.map(async (wikidataId) => [wikidataId, await cacheRepository.getWikidata(wikidataId, language)] as const))
      : [];
    const cachedWikidata = Object.fromEntries(cachedWikidataEntries);
    const missingWikidataIds = wikidataIds.filter((wikidataId) => !cachedWikidata[wikidataId]);
    const fetchedWikidata = await enrichFromWikidataBatch(missingWikidataIds, language);

    if (cacheRepository) {
      await Promise.all(Object.entries(fetchedWikidata).map(async ([wikidataId, payload]) => {
        if (payload) {
          await cacheRepository.setWikidata(wikidataId, language, payload);
        }
      }));
    }

    const wikidataBatch = { ...cachedWikidata, ...fetchedWikidata };

    const batchEnriched = await Promise.all(batch.map(async (poi) => {
      let nameTranslations: Record<string, string> = {};
      let description: string | null = null;
      let wikipediaBody: string | null = null;
      let wikidataClaims: Record<string, string> | null = null;
      let descriptionLanguage: string | null = null;
      const attribution: EnrichedPoi['enriched']['attribution'] = {};

      const wikidataEnrichment = poi.tags.wikidata ? wikidataBatch[poi.tags.wikidata] ?? null : null;
      if (wikidataEnrichment) {
        nameTranslations = wikidataEnrichment.nameTranslations;
        attribution.wikidata = { url: wikidataEnrichment.wikidataUrl, id: wikidataEnrichment.wikidataId };
        wikidataClaims = wikidataEnrichment.wikidataClaims;
      }

      if (poi.tags.wikipedia) {
        const cachedWikipedia = cacheRepository
          ? await cacheRepository.getWikipedia(poi.tags.wikipedia, language)
          : null;
        const wikipediaEnrichment = cachedWikipedia ?? await enrichFromWikipedia(poi.tags.wikipedia, language);

        if (wikipediaEnrichment) {
          if (!cachedWikipedia && cacheRepository) {
            await cacheRepository.setWikipedia(poi.tags.wikipedia, language, wikipediaEnrichment);
          }

          description = wikipediaEnrichment.description;
          wikipediaBody = wikipediaEnrichment.body;
          descriptionLanguage = wikipediaEnrichment.language;
          attribution.wikipedia = { url: wikipediaEnrichment.wikipediaUrl, language: wikipediaEnrichment.language };
        }
      }

      return {
        ...poi,
        enriched: {
          nameTranslations,
          description,
          wikipediaLead: description,
          wikipediaBody,
          wikidataClaims,
          osmTags: buildOsmSeedTags(poi),
          wikivoyage: null,
          descriptionLanguage,
          attribution,
        },
      } satisfies EnrichedPoi;
    }));

    enriched.push(...batchEnriched);
  }

  return enriched;
}
