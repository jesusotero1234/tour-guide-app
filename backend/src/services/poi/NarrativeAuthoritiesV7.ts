import { NarrativeSourceAuthorityV6 } from './NarrativeSourcesV6';
import { NarrativeDiscoveryResultV7 } from './NarrativeSourcesV7';
import {
  MediaWikiHttpResponseV8,
  narrativeHttpHeadersV8,
  requestMediaWikiWithMaxlagPolicyV8,
} from './MediaWikiRequestPolicyV8';

export interface NarrativeWikidataIdentityV7 {
  qid: string;
  labels: string[];
  aliases: string[];
  officialDomains: Array<{ domain: string; origin: string }>;
  administrativeAncestors: string[];
  revision: { revisionId: number; timestamp: string } | null;
}

export interface NarrativeAuthorityV7 {
  domain: string;
  origin:
    | 'place_p856'
    | 'city_p856'
    | 'admin_level_1'
    | 'admin_level_2'
    | 'admin_level_3';
  qid: string;
  wikidataRevision: { revisionId: number; timestamp: string } | null;
  url: string | null;
}

export interface NarrativeAuthorityRegistryV7 {
  authorities: NarrativeAuthorityV7[];
  aliases: string[];
  labels: string[];
}

export type NarrativeAuthorityV7Get = (
  url: string,
  params: Record<string, string>
) => Promise<MediaWikiHttpResponseV8<unknown>>;

export type NarrativeAuthorityV7Wait = (milliseconds: number) => Promise<void>;

const defaultAuthorityWaitV7: NarrativeAuthorityV7Wait = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export function normalizeNarrativeIdentityTextV8(text: string): string {
  return text.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export class CityIdentityReviewRequiredErrorV8 extends Error {
  readonly code = 'city_identity_review_required';

  constructor(message: string) {
    super(message);
    this.name = 'CityIdentityReviewRequiredErrorV8';
  }
}

export interface ResolveCityIdentityV8Input {
  cityName: string;
  language: string;
  countryCode?: string;
  get?: NarrativeAuthorityV7Get;
  wait?: NarrativeAuthorityV7Wait;
}

export type CityIdentityResolutionV8 =
  | { status: 'ok'; qid: string }
  | { status: 'city_identity_review_required'; reason: string };

function claimEntityIdValuesV8(claims: Record<string, unknown>, propId: string): string[] {
  const values = Array.isArray(claims[propId]) ? (claims[propId] as unknown[]) : [];
  return values
    .map(claimEntityValue)
    .filter((value): value is string => Boolean(value));
}

async function fetchEntityV8(
  qid: string,
  props: string,
  get: NarrativeAuthorityV7Get,
  wait: NarrativeAuthorityV7Wait
): Promise<Record<string, unknown> | null> {
  const response = await requestMediaWikiWithMaxlagPolicyV8(
    () => get('https://www.wikidata.org/w/api.php', {
      action: 'wbgetentities',
      ids: qid,
      props,
      languages: 'en',
      format: 'json',
      formatversion: '2',
      origin: '*',
    }),
    wait
  );
  const root = objectValue(response.data, 'Wikidata entity response');
  const entities = objectValue(root.entities, 'Wikidata entities');
  const entity = (entities as Record<string, unknown>)[qid];
  return entity && typeof entity === 'object' ? entity as Record<string, unknown> : null;
}

async function fetchCityEntitiesV8(
  qids: string[],
  get: NarrativeAuthorityV7Get,
  wait: NarrativeAuthorityV7Wait
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < qids.length; offset += 50) {
    const batch = qids.slice(offset, offset + 50);
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => get('https://www.wikidata.org/w/api.php', {
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'labels|aliases|claims',
        languages: 'en',
        format: 'json',
        formatversion: '2',
        origin: '*',
      }),
      wait
    );
    const root = objectValue(response.data, 'Wikidata city entities response');
    const entities = objectValue(root.entities, 'Wikidata city entities');
    const record = entities as Record<string, unknown>;
    for (const qid of batch) {
      const entity = record[qid];
      if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
        result.set(qid, entity as Record<string, unknown>);
      }
    }
  }
  return result;
}

async function resolveCountryQidForCityV8(
  entity: Record<string, unknown>,
  get: NarrativeAuthorityV7Get,
  wait: NarrativeAuthorityV7Wait
): Promise<string | null> {
  let current = entity;
  for (let level = 0; level < 4; level += 1) {
    const claims = (current.claims && typeof current.claims === 'object'
      && !Array.isArray(current.claims))
      ? current.claims as Record<string, unknown>
      : {};
    const direct = claimEntityIdValuesV8(claims, 'P17')[0];
    if (direct) return direct;
    const parent = claimEntityIdValuesV8(claims, 'P131')[0];
    if (!parent) return null;
    const parentEntity = await fetchEntityV8(parent, 'claims', get, wait);
    if (!parentEntity) return null;
    current = parentEntity;
  }
  return null;
}

async function fetchCountryCodesV8(
  countryQids: string[],
  get: NarrativeAuthorityV7Get,
  wait: NarrativeAuthorityV7Wait
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(countryQids)];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => get('https://www.wikidata.org/w/api.php', {
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'claims',
        languages: 'en',
        format: 'json',
        formatversion: '2',
        origin: '*',
      }),
      wait
    );
    const root = objectValue(response.data, 'Wikidata country entities response');
    const entities = objectValue(root.entities, 'Wikidata country entities') as Record<string, unknown>;
    for (const countryQid of batch) {
      const entity = entities[countryQid];
      if (!entity || typeof entity !== 'object' || Array.isArray(entity)) continue;
      const claims = (entity as Record<string, unknown>).claims as Record<string, unknown> | undefined;
      if (!claims) continue;
      const p297 = Array.isArray(claims.P297)
        ? (claims.P297 as unknown[]).map(claimValue).find((value): value is string => typeof value === 'string')
        : undefined;
      if (p297) result.set(countryQid, p297.toUpperCase());
    }
  }
  return result;
}

function cityIdentityTextsV8(entity: Record<string, unknown>): string[] {
  const texts: string[] = [];
  const labels = (entity.labels && typeof entity.labels === 'object' && !Array.isArray(entity.labels))
    ? entity.labels as Record<string, unknown>
    : {};
  for (const value of Object.values(labels)) {
    const label = objectValue(value, 'city label').value;
    if (typeof label === 'string') texts.push(label);
  }
  const aliases = (entity.aliases && typeof entity.aliases === 'object' && !Array.isArray(entity.aliases))
    ? entity.aliases as Record<string, unknown>
    : {};
  for (const items of Object.values(aliases)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const alias = objectValue(item, 'city alias').value;
      if (typeof alias === 'string') texts.push(alias);
    }
  }
  return texts;
}

export async function resolveCityIdentityV8(
  input: ResolveCityIdentityV8Input
): Promise<CityIdentityResolutionV8> {
  if (!input.cityName.trim()) throw new Error('city name is required');
  const get = input.get ?? defaultAuthorityGetV7;
  const wait = input.wait ?? defaultAuthorityWaitV7;
  const response = await requestMediaWikiWithMaxlagPolicyV8(
    () => get('https://www.wikidata.org/w/api.php', {
      action: 'wbsearchentities',
      search: input.cityName,
      language: input.language,
      uselang: input.language,
      type: 'item',
      limit: '10',
      format: 'json',
      formatversion: '2',
    }),
    wait
  );
  const root = objectValue(response.data, 'Wikidata search response');
  if (!Array.isArray(root.search)) {
    return { status: 'city_identity_review_required', reason: 'Wikidata search has no results' };
  }
  const candidates = root.search
    .map((raw) => {
      const item = objectValue(raw, 'Wikidata search result');
      const qid = typeof item.id === 'string' && /^Q\d+$/u.test(item.id) ? item.id : null;
      return qid;
    })
    .filter((qid): qid is string => Boolean(qid));
  if (candidates.length === 0) {
    return {
      status: 'city_identity_review_required',
      reason: `no Wikidata entity found for city ${input.cityName}`,
    };
  }
  const entities = await fetchCityEntitiesV8(candidates, get, wait);
  const countryQids = new Set<string>();
  const countryQidByCandidate = new Map<string, string>();
  for (const qid of candidates) {
    const entity = entities.get(qid);
    if (!entity) continue;
    const countryQid = await resolveCountryQidForCityV8(entity, get, wait);
    if (countryQid) {
      countryQids.add(countryQid);
      countryQidByCandidate.set(qid, countryQid);
    }
  }
  const countryCodes = await fetchCountryCodesV8([...countryQids], get, wait);
  const normalizedCity = normalizeNarrativeIdentityTextV8(input.cityName);
  const expectedCode = input.countryCode?.toUpperCase() ?? null;
  const matches = candidates.filter((qid) => {
    const entity = entities.get(qid);
    if (!entity) return false;
    const identityMatch = cityIdentityTextsV8(entity)
      .some((text) => normalizeNarrativeIdentityTextV8(text) === normalizedCity);
    if (!identityMatch) return false;
    if (expectedCode === null) return true;
    const countryQid = countryQidByCandidate.get(qid);
    const code = countryQid ? countryCodes.get(countryQid) : undefined;
    return code === expectedCode;
  });
  if (matches.length === 1) return { status: 'ok', qid: matches[0] };
  return {
    status: 'city_identity_review_required',
    reason: matches.length === 0
      ? `no candidate for ${input.cityName} matches country ${expectedCode} and the normalized name`
      : `multiple candidates for ${input.cityName} match country ${expectedCode}`,
  };
}

export async function resolveCityQidV7(input: ResolveCityIdentityV8Input): Promise<string> {
  const resolution = await resolveCityIdentityV8(input);
  if (resolution.status === 'city_identity_review_required') {
    throw new CityIdentityReviewRequiredErrorV8(resolution.reason);
  }
  return resolution.qid;
}

export async function resolveWikidataQidFromWikipediaV8(input: {
  title: string;
  language: string;
  get?: NarrativeAuthorityV7Get;
  wait?: NarrativeAuthorityV7Wait;
}): Promise<string | null> {
  if (!input.title.trim() || !/^[a-z]{2,3}$/u.test(input.language)) {
    throw new Error('Wikipedia QID resolution requires a title and a language code');
  }
  const get = input.get ?? defaultAuthorityGetV7;
  const wait = input.wait ?? defaultAuthorityWaitV7;
  const response = await requestMediaWikiWithMaxlagPolicyV8(
    () => get(`https://${input.language}.wikipedia.org/w/api.php`, {
      action: 'query',
      prop: 'pageprops',
      redirects: '1',
      converttitles: '1',
      maxlag: '5',
      titles: input.title,
      format: 'json',
      formatversion: '2',
    }),
    wait
  );
  const root = objectValue(response.data, 'Wikipedia pageprops response');
  const query = objectValue(root.query, 'Wikipedia pageprops query');
  if (!Array.isArray(query.pages) || query.pages.length === 0) return null;
  const page = objectValue(query.pages[0], 'Wikipedia pageprops page');
  const pageprops = (page.pageprops && typeof page.pageprops === 'object')
    ? page.pageprops as Record<string, unknown>
    : {};
  const qid = stringValue(pageprops.wikibase_item);
  return qid && /^Q\d+$/u.test(qid) ? qid : null;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function claimValue(claim: unknown): unknown {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  const value = (claim as { mainsnak?: unknown }).mainsnak;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const datavalue = (value as { datavalue?: unknown }).datavalue;
  if (!datavalue || typeof datavalue !== 'object' || Array.isArray(datavalue)) return null;
  return (datavalue as { value?: unknown }).value;
}

function claimUrlValue(claim: unknown): string | null {
  const value = claimValue(claim);
  if (typeof value === 'string' && /^https?:\/\//u.test(value)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const url = stringValue((value as { url?: unknown }).url);
  if (!url) return null;
  return url;
}

function claimEntityValue(claim: unknown): string | null {
  const value = claimValue(claim);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = stringValue((value as { id?: unknown }).id);
  if (!id || !/^Q\d+$/u.test(id)) return null;
  return id;
}

function claimIsDeprecated(claim: unknown): boolean {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return false;
  return (claim as { rank?: unknown }).rank === 'deprecated';
}

function domainFromOfficialUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password
    || (parsed.port && parsed.port !== '443' && parsed.port !== '80')) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return null;
  }
  return hostname;
}

export class WikidataAuthorityProviderV7 {
  private readonly get: NarrativeAuthorityV7Get;
  private readonly wait: NarrativeAuthorityV7Wait;
  private readonly entityCache = new Map<string, Record<string, unknown>>();

  constructor(options: { get?: NarrativeAuthorityV7Get; wait?: NarrativeAuthorityV7Wait } = {}) {
    this.get = options.get ?? defaultAuthorityGetV7;
    this.wait = options.wait ?? defaultAuthorityWaitV7;
  }

  private async wbGetEntities(
    qids: string[],
    props: string,
    languages: string[]
  ): Promise<Record<string, unknown>> {
    const unique = [...new Set(qids.filter((qid) => /^Q\d+$/u.test(qid)))];
    const result: Record<string, unknown> = {};
    for (let offset = 0; offset < unique.length; offset += 50) {
      const batch = unique.slice(offset, offset + 50);
      const cacheKey = (qid: string): string => `${qid}|${props}`;
      const missing = batch.filter((qid) => !this.entityCache.has(cacheKey(qid)));
      if (missing.length > 0) {
        const response = await requestMediaWikiWithMaxlagPolicyV8(
          () => this.get('https://www.wikidata.org/w/api.php', {
            action: 'wbgetentities',
            ids: missing.join('|'),
            props,
            languages: languages.join('|'),
            format: 'json',
            formatversion: '2',
            origin: '*',
          }),
          this.wait
        );
        const root = objectValue(response.data, 'Wikibase response');
        if (root.error) {
          throw new Error(`Wikibase error: ${JSON.stringify(root.error)}`);
        }
        const entities = objectValue(root.entities, 'Wikibase entities');
        for (const [qid, entity] of Object.entries(entities)) {
          if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
            this.entityCache.set(cacheKey(qid), entity as Record<string, unknown>);
          }
        }
      }
      for (const qid of batch) {
        const cached = this.entityCache.get(cacheKey(qid));
        if (cached) result[qid] = cached;
      }
    }
    return result;
  }

  private async revisionsOf(
    qids: string[]
  ): Promise<Map<string, { revisionId: number; timestamp: string }>> {
    const uniqueQids = [...new Set(qids.filter((qid) => /^Q\d+$/u.test(qid)))];
    const result = new Map<string, { revisionId: number; timestamp: string }>();
    if (uniqueQids.length === 0) return result;
    try {
      const response = await requestMediaWikiWithMaxlagPolicyV8(
        () => this.get('https://www.wikidata.org/w/api.php', {
          action: 'query',
          prop: 'revisions',
          rvprop: 'ids|timestamp',
          titles: uniqueQids.join('|'),
          format: 'json',
          formatversion: '2',
          origin: '*',
        }),
        this.wait
      );
      const root = objectValue(response.data, 'Wikidata revision response');
      const query = objectValue(root.query, 'Wikidata revision query');
      if (!Array.isArray(query.pages)) return result;
      query.pages.forEach((raw, index) => {
        const page = objectValue(raw, 'Wikidata revision page');
        const qid = typeof page.title === 'string' && /^Q\d+$/u.test(page.title)
          ? page.title
          : uniqueQids[index];
        if (!qid || !Array.isArray(page.revisions) || page.revisions.length === 0) return;
        const revision = objectValue(page.revisions[0], 'Wikidata revision');
        if (!Number.isInteger(revision.revid) || typeof revision.timestamp !== 'string') {
          return;
        }
        result.set(qid, { revisionId: Number(revision.revid), timestamp: revision.timestamp });
      });
      return result;
    } catch {
      return result;
    }
  }

  private identityFromEntity(qid: string, entity: Record<string, unknown>): {
    labels: string[];
    aliases: string[];
    officialDomains: Array<{ domain: string; origin: string; url: string }>;
    administrativeAncestors: string[];
  } {
    const labels = entity.labels && typeof entity.labels === 'object'
      && !Array.isArray(entity.labels)
      ? Object.entries(entity.labels as Record<string, unknown>)
        .map(([, value]) => stringValue(objectValue(value, 'label').value))
        .filter((value): value is string => Boolean(value))
      : [];
    const aliases = entity.aliases && typeof entity.aliases === 'object'
      && !Array.isArray(entity.aliases)
      ? Object.entries(entity.aliases as Record<string, unknown>)
        .flatMap(([, items]) => (
          Array.isArray(items)
            ? items.map((item) => stringValue(objectValue(item, 'alias').value))
            : []
        ))
        .filter((value): value is string => Boolean(value))
      : [];
    const claims = objectValue(entity.claims, `${qid} claims`);
    const officialDomains: Array<{ domain: string; origin: string; url: string }> = [];
    const p856 = claims.P856;
    if (Array.isArray(p856)) {
      for (const claim of p856) {
        if (claimIsDeprecated(claim)) continue;
        const url = claimUrlValue(claim) ?? '';
        const domain = domainFromOfficialUrl(url);
        if (domain && url) officialDomains.push({ domain, origin: 'place_p856', url });
      }
    }
    const administrativeAncestors: string[] = [];
    const p131 = claims.P131;
    if (Array.isArray(p131)) {
      for (const claim of p131) {
        if (claimIsDeprecated(claim)) continue;
        const qid = claimEntityValue(claim);
        if (qid) administrativeAncestors.push(qid);
      }
    }
    return { labels, aliases, officialDomains, administrativeAncestors };
  }

  private async resolveAdminAncestors(
    qids: string[],
    placeQid: string
  ): Promise<Array<{
    qid: string;
    level: number;
    domains: Array<{ domain: string; origin: string; url: string }>;
  }>> {
    const ancestors: Array<{
      qid: string;
      level: number;
      domains: Array<{ domain: string; origin: string; url: string }>;
    }> = [];
    let level = 0;
    let cursor = [...new Set(qids.filter((qid) => qid !== placeQid))];
    while (cursor.length > 0 && level < 3) {
      level += 1;
      const entities = await this.wbGetEntities(cursor, 'claims', ['en']);
      const next = new Set<string>();
      for (const rawQid of cursor) {
        if (entities[rawQid] === undefined) continue;
        const entity = objectValue(entities[rawQid], `${rawQid} entity`);
        const identity = this.identityFromEntity(rawQid, entity);
        ancestors.push({
          qid: rawQid,
          level,
          domains: identity.officialDomains,
        });
        for (const parent of identity.administrativeAncestors) {
          if (parent !== rawQid && parent !== placeQid && !next.has(parent)
            && !ancestors.some((ancestor) => ancestor.qid === parent)) {
            next.add(parent);
          }
        }
      }
      cursor = [...next];
    }
    return ancestors;
  }

  async resolveAuthorities(input: {
    qid: string;
    cityQid: string;
    language: string;
  }): Promise<NarrativeAuthorityRegistryV7> {
    if (!/^Q\d+$/u.test(input.qid)) throw new Error('place QID is required');
    if (!/^Q\d+$/u.test(input.cityQid)) throw new Error('city QID is required');
    if (!input.language.trim()) throw new Error('language is required');
    const placeIdentity = await this.identityFromEntity(
      input.qid,
      objectValue((await this.wbGetEntities(
        [input.qid],
        'labels|aliases|claims',
        [input.language, 'en']
      ))[input.qid],
        `${input.qid} entity`)
    );
    const cityEntity = objectValue((await this.wbGetEntities(
      [input.cityQid],
      'labels|aliases|claims',
      [input.language, 'en']
    ))[input.cityQid],
      `${input.cityQid} entity`);
    const cityIdentity = this.identityFromEntity(input.cityQid, cityEntity);
    const ancestors = await this.resolveAdminAncestors(
      cityIdentity.administrativeAncestors.filter((qid) => qid !== input.cityQid),
      input.cityQid
    );

    const authorities: NarrativeAuthorityV7[] = [];
    const origins: Array<{
      domain: string;
      origin: NarrativeAuthorityV7['origin'];
      qid: string;
      url: string;
    }> = [
      ...placeIdentity.officialDomains.map((item) => ({
        ...item,
        origin: 'place_p856' as const,
        qid: input.qid,
      })),
      ...cityIdentity.officialDomains.map((item) => ({
        ...item,
        origin: 'city_p856' as const,
        qid: input.cityQid,
      })),
      ...ancestors.flatMap((ancestor) => (
        ancestor.domains.map((item) => ({
          ...item,
          origin: `admin_level_${ancestor.level}` as NarrativeAuthorityV7['origin'],
          qid: ancestor.qid,
        }))
      )),
    ];
    const seen = new Set<string>();
    for (const entry of origins) {
      if (seen.has(entry.domain)) continue;
      seen.add(entry.domain);
      authorities.push({
        domain: entry.domain,
        origin: entry.origin,
        qid: entry.qid,
        wikidataRevision: null,
        url: entry.url,
      });
    }

    const revisions = await this.revisionsOf([
      input.qid,
      input.cityQid,
      ...ancestors.map((ancestor) => ancestor.qid),
    ]);
    for (const authority of authorities) {
      const revision = revisions.get(authority.qid);
      if (revision) authority.wikidataRevision = revision;
    }

    return {
      authorities,
      aliases: [...new Set(placeIdentity.aliases)],
      labels: [...new Set(placeIdentity.labels)],
    };
  }

  async resolveWikipediaSitelinkV8(input: {
    qid: string;
    language: string;
  }): Promise<{
    title: string | null;
    revision: { revisionId: number; timestamp: string } | null;
  }> {
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => this.get('https://www.wikidata.org/w/api.php', {
        action: 'wbgetentities',
        ids: input.qid,
        props: 'labels|aliases|claims|sitelinks',
        languages: [input.language, 'en'].join('|'),
        format: 'json',
        formatversion: '2',
        origin: '*',
      }),
      this.wait
    );
    const root = objectValue(response.data, 'Wikibase sitelink response');
    if (root.error) throw new Error(`Wikibase error: ${JSON.stringify(root.error)}`);
    const entities = objectValue(root.entities, 'Wikibase sitelink entities');
    const entity = objectValue((entities as Record<string, unknown>)[input.qid], `${input.qid} entity`);
    const sitelinks = (entity.sitelinks && typeof entity.sitelinks === 'object')
      ? entity.sitelinks as Record<string, unknown>
      : {};
    const raw = sitelinks[`${input.language}wiki`] ?? sitelinks.enwiki;
    const title = raw && typeof raw === 'object'
      ? stringValue((raw as { title?: unknown }).title)
      : null;
    const revision = (await this.revisionsOf([input.qid])).get(input.qid) ?? null;
    return { title, revision };
  }
}

function defaultAuthorityGetV7(
  url: string,
  params: Record<string, string>
): Promise<MediaWikiHttpResponseV8<unknown>> {
  return import('axios').then(({ default: axios }) => (
    axios.get(url, { params, timeout: 30_000, headers: narrativeHttpHeadersV8() })
      .then((response) => ({
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string | number | string[] | undefined>,
      }))
  ));
}

export interface NarrativeAdaptiveSearchPlanV7 {
  deterministicQueries: string[];
  mappedDomains: string[];
  adaptiveQueries: string[];
  budget: {
    deterministicQueries: number;
    mappedDomains: number;
    captures: number;
    adaptiveQueries: number;
  };
  sufficient: boolean;
}

export interface NarrativeStopResearchBudgetV7 {
  deterministicQueries: number;
  mappedDomains: number;
  captures: number;
  adaptiveQueries: number;
}

export const NARRATIVE_STOP_BUDGET_V7: NarrativeStopResearchBudgetV7 = {
  deterministicQueries: 4,
  mappedDomains: 3,
  captures: 12,
  adaptiveQueries: 4,
};

export function buildAdaptiveSearchPlanV7(input: {
  stopName: string;
  aliases: string[];
  officialDomains: string[];
  language: string;
  countryCode: string;
  budget?: NarrativeStopResearchBudgetV7;
}): NarrativeAdaptiveSearchPlanV7 {
  const budget = input.budget ?? NARRATIVE_STOP_BUDGET_V7;
  const names = [...new Set([input.stopName, ...input.aliases])].slice(0, 2);
  const quoted = names.map((name) => `"${name}"`);
  const deterministicQueries = [
    `${quoted[0]} historia cronología sitio oficial`,
    `${quoted[0]} arquitectura función actual`,
    `${quoted[0]} publicación institucional historia`,
    ...(quoted[1] ? [`${quoted[1]} historia arquitectura`] : []),
  ].slice(0, budget.deterministicQueries);
  const mappedDomains = input.officialDomains.slice(0, budget.mappedDomains);
  return {
    deterministicQueries,
    mappedDomains,
    adaptiveQueries: [],
    budget,
    sufficient: false,
  };
}

export function degradeAuthorityForMismatch(
  result: NarrativeDiscoveryResultV7,
  registry: NarrativeAuthorityRegistryV7,
  stopName: string
): NarrativeDiscoveryResultV7 {
  const hostname = new URL(result.url).hostname.toLowerCase();
  const registered = registry.authorities.some((authority) => (
    hostname === authority.domain || hostname.endsWith(`.${authority.domain}`)
  ));
  if (!registered) return result;
  const aliasTerms = [...registry.aliases, ...registry.labels]
    .map(normalizeNarrativeIdentityTextV8)
    .filter((term) => term.length > 0);
  const nameTerm = normalizeNarrativeIdentityTextV8(stopName);
  const pageText = normalizeNarrativeIdentityTextV8(result.title + ' ' + result.description);
  const pageMatches = nameTerm.length > 0
    && (pageText.includes(nameTerm) || aliasTerms.some((alias) => pageText.includes(alias)));
  if (pageMatches) return result;
  return {
    ...result,
    authority: {
      tier: 'discovery_only',
      publisherKey: hostname.split('.').slice(-2).join('.'),
      rule: 'degraded_identity_mismatch',
    } as NarrativeSourceAuthorityV6,
  };
}

export function applyRegistryAuthorityV7(
  result: NarrativeDiscoveryResultV7,
  registry: NarrativeAuthorityRegistryV7
): NarrativeDiscoveryResultV7 {
  const hostname = new URL(result.url).hostname.toLowerCase();
  const authority = registry.authorities.find((candidate) => (
    hostname === candidate.domain || hostname.endsWith(`.${candidate.domain}`)
  ));
  if (!authority) return result;
  return {
    ...result,
    authority: {
      tier: 'primary_authority',
      publisherKey: authority.domain,
      rule: `registered_p856:${authority.origin}`,
    },
  };
}

export function classifyAgainstRegistryV7(
  result: NarrativeDiscoveryResultV7,
  registry: NarrativeAuthorityRegistryV7,
  stopName: string
): NarrativeDiscoveryResultV7 {
  const withRegistry = applyRegistryAuthorityV7(result, registry);
  return degradeAuthorityForMismatch(withRegistry, registry, stopName);
}
