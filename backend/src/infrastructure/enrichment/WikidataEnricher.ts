import { AxiosError } from 'axios';
import { wikidataGet } from './wikidataClient';

export interface WikidataEnrichment {
  wikidataId: string;
  nameTranslations: Record<string, string>;
  wikidataUrl: string;
}

export interface WikidataEntityLike {
  id?: string;
  missing?: boolean;
  labels?: Record<string, { value?: string }>;
  claims?: Record<string, any[]>;
  sitelinks?: Record<string, { title?: string }>;
}

export interface WikidataBatchEnrichment extends WikidataEnrichment {
  wikidataClaims: Record<string, string> | null;
  wikipediaTag?: string;
}

const CLAIM_PROPS: Record<string, string> = {
  P31: 'instanceOf',
  P571: 'inception',
  P84: 'architect',
  P149: 'architecturalStyle',
  P1435: 'heritageDesignation',
  P131: 'locatedIn',
  P138: 'namedAfter',
};

const entityDataCache = new Map<string, Promise<WikidataEntityLike | null>>();
const labelCache = new Map<string, string>();

function extractClaimValue(claim: any): string | null {
  const value = claim?.mainsnak?.datavalue?.value;
  if (!value) return null;

  if (typeof value === 'string') return value;
  if (typeof value?.id === 'string') return value.id;
  if (typeof value?.time === 'string') return value.time.replace(/^\+/, '').split('T')[0];
  return null;
}

function extractNameTranslations(entity: WikidataEntityLike | null): Record<string, string> {
  const labels = entity?.labels ?? {};
  const nameTranslations: Record<string, string> = {};
  for (const [lang, labelObj] of Object.entries(labels)) {
    if (typeof labelObj?.value === 'string') {
      nameTranslations[lang] = labelObj.value;
    }
  }
  return nameTranslations;
}

async function fetchWikidataEntities(ids: string[]): Promise<Record<string, WikidataEntityLike>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const data = await wikidataGet<any>({
    params: {
      action: 'wbgetentities',
      ids: uniqueIds.join('|'),
      props: 'labels|claims|sitelinks',
      format: 'json',
      formatversion: 2,
    },
  });

  const entities = data?.entities;
  const entries: Array<[string, WikidataEntityLike]> = Array.isArray(entities)
    ? entities
        .filter((entity: WikidataEntityLike | null | undefined): entity is WikidataEntityLike => Boolean(entity?.id))
        .map((entity) => [entity.id as string, entity])
    : Object.entries((entities ?? {}) as Record<string, WikidataEntityLike>);

  const byId = Object.fromEntries(entries);
  for (const wikidataId of uniqueIds) {
    if (!(wikidataId in byId)) {
      byId[wikidataId] = { id: wikidataId, missing: true };
    }
  }
  return byId;
}

function extractWikipediaTag(entity: WikidataEntityLike, language: string): string | undefined {
  const preferred = entity.sitelinks?.[`${language}wiki`]?.title;
  if (preferred) return `${language}:${preferred}`;
  const english = entity.sitelinks?.enwiki?.title;
  return english ? `en:${english}` : undefined;
}

async function fetchWikidataEntity(wikidataId: string): Promise<WikidataEntityLike | null> {
  if (!entityDataCache.has(wikidataId)) {
    entityDataCache.set(wikidataId, (async () => {
      try {
        const entities = await fetchWikidataEntities([wikidataId]);
        const entity = entities[wikidataId];
        return entity && !entity.missing ? entity : null;
      } catch (err) {
        entityDataCache.delete(wikidataId);
        throw err;
      }
    })());
  }

  return entityDataCache.get(wikidataId)!;
}

export async function fetchWikidataLabels(ids: string[], language: string): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (uniqueIds.length === 0) {
    return {};
  }

  const missingIds = uniqueIds.filter((id) => !labelCache.has(`${language}:${id}`));
  if (missingIds.length > 0) {
    const data = await wikidataGet<any>({
      params: {
        action: 'wbgetentities',
        ids: missingIds.join('|'),
        props: 'labels',
        languages: [language, 'en'].filter((lang, idx, arr) => arr.indexOf(lang) === idx).join('|'),
        format: 'json',
        formatversion: 2,
      },
    });

    for (const [id, entity] of Object.entries((data?.entities ?? {}) as Record<string, WikidataEntityLike>)) {
      const labels = entity?.labels ?? {};
      const value = labels[language]?.value || labels.en?.value || id;
      labelCache.set(`${language}:${id}`, value);
    }

    for (const id of missingIds) {
      if (!labelCache.has(`${language}:${id}`)) {
        labelCache.set(`${language}:${id}`, id);
      }
    }
  }

  return Object.fromEntries(uniqueIds.map((id) => [id, labelCache.get(`${language}:${id}`) || id]));
}

function extractResolvedClaims(entity: WikidataEntityLike | null, labels: Record<string, string>): Record<string, string> | null {
  if (!entity || entity.missing) {
    return null;
  }

  const rawClaims: Record<string, string> = {};
  for (const [propId, fieldName] of Object.entries(CLAIM_PROPS)) {
    const claim = entity.claims?.[propId]?.[0];
    const rawValue = extractClaimValue(claim);
    if (!rawValue) continue;
    rawClaims[fieldName] = rawValue;
  }

  const resolvedClaims = Object.fromEntries(
    Object.entries(rawClaims).map(([key, value]) => [key, labels[value] || value])
  );

  return Object.keys(resolvedClaims).length > 0 ? resolvedClaims : null;
}

export async function enrichFromWikidataBatch(wikidataIds: string[], language = 'en'): Promise<Record<string, WikidataBatchEnrichment | null>> {
  const uniqueIds = Array.from(new Set(wikidataIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (uniqueIds.length === 0) {
    return {};
  }

  try {
    const entities = await fetchWikidataEntities(uniqueIds);
    const claimLabelIds = new Set<string>();

    for (const entity of Object.values(entities)) {
      for (const propId of Object.keys(CLAIM_PROPS)) {
        const rawValue = extractClaimValue(entity?.claims?.[propId]?.[0]);
        if (rawValue && /^Q\d+$/.test(rawValue)) {
          claimLabelIds.add(rawValue);
        }
      }
    }

    const labels = await fetchWikidataLabels([...claimLabelIds], language);
    return Object.fromEntries(uniqueIds.map((wikidataId) => {
      const entity = entities[wikidataId];
      if (!entity || entity.missing) {
        return [wikidataId, null];
      }

      return [wikidataId, {
        wikidataId,
        nameTranslations: extractNameTranslations(entity),
        wikidataUrl: `https://www.wikidata.org/wiki/${wikidataId}`,
        wikidataClaims: extractResolvedClaims(entity, labels),
        wikipediaTag: extractWikipediaTag(entity, language),
      } satisfies WikidataBatchEnrichment];
    }));
  } catch (err) {
    const axiosErr = err as AxiosError;
    console.warn(`[WikidataEnricher] Failed to batch enrich ${uniqueIds.length} entities: ${axiosErr.message}`);
    return Object.fromEntries(uniqueIds.map((wikidataId) => [wikidataId, null]));
  }
}

export async function enrichFromWikidata(wikidataId: string): Promise<WikidataEnrichment | null> {
  try {
    const entity = await fetchWikidataEntity(wikidataId);
    if (!entity) {
      return null;
    }

    return {
      wikidataId,
      nameTranslations: extractNameTranslations(entity),
      wikidataUrl: `https://www.wikidata.org/wiki/${wikidataId}`,
    };
  } catch (err) {
    const axiosErr = err as AxiosError;
    console.warn(`[WikidataEnricher] Failed to enrich ${wikidataId}: ${axiosErr.message}`);
    return null;
  }
}
