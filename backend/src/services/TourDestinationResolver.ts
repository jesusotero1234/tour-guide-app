import {
  NarrativeAuthorityV7Get,
  resolveCityIdentityV8,
} from './poi/NarrativeAuthoritiesV7';
import {
  MediaWikiHttpResponseV8,
  narrativeHttpHeadersV8,
  requestMediaWikiWithMaxlagPolicyV8,
} from './poi/MediaWikiRequestPolicyV8';
import { RESEARCH_POLICY_VERSION } from './tourReadiness/TourLanguage';

export interface TourDestination {
  qid: string;
  city: string;
  country: string;
  countryCode: string;
  researchLanguages: string[];
  wikimediaPages?: { wikipedia: { language: string; title: string } | null; wikivoyage: { language: string; title: string } | null };
  policyVersion: string;
}

type EntityRecord = Record<string, unknown>;

function defaultGet(
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

const defaultWait: (milliseconds: number) => Promise<void> = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

function objectValue(value: unknown, label: string): EntityRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as EntityRecord;
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

function entityClaims(entity: EntityRecord): EntityRecord {
  const claims = entity.claims;
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return {};
  return claims as EntityRecord;
}

function entityLabels(entity: EntityRecord): EntityRecord {
  const labels = entity.labels;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return {};
  return labels as EntityRecord;
}

function entitySitelinks(entity: EntityRecord): EntityRecord {
  const sitelinks = entity.sitelinks;
  if (!sitelinks || typeof sitelinks !== 'object' || Array.isArray(sitelinks)) return {};
  return sitelinks as EntityRecord;
}

function nonDeprecatedEntityIds(claims: EntityRecord, propId: string): string[] {
  const values = Array.isArray(claims[propId]) ? (claims[propId] as unknown[]) : [];
  return values
    .filter((claim) => !claimIsDeprecated(claim) && !hasQualifier(claim, 'P582'))
    .map(claimEntityValue)
    .filter((value): value is string => Boolean(value));
}

function hasQualifier(claim: unknown, propId: string): boolean {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return false;
  const qualifiers = (claim as { qualifiers?: unknown }).qualifiers;
  if (!qualifiers || typeof qualifiers !== 'object' || Array.isArray(qualifiers)) return false;
  const values = Array.isArray((qualifiers as EntityRecord)[propId]) ? ((qualifiers as EntityRecord)[propId] as unknown[]) : [];
  return values.length > 0;
}

function unqualifiedP37EntityIds(claims: EntityRecord): string[] {
  const values = Array.isArray(claims['P37']) ? (claims['P37'] as unknown[]) : [];
  return values
    .filter((claim) => !claimIsDeprecated(claim) && !hasQualifier(claim, 'P518') && !hasQualifier(claim, 'P582'))
    .map(claimEntityValue)
    .filter((value): value is string => Boolean(value));
}

function nonDeprecatedStringValue(claims: EntityRecord, propId: string): string | null {
  const values = Array.isArray(claims[propId]) ? (claims[propId] as unknown[]) : [];
  for (const claim of values) {
    if (claimIsDeprecated(claim)) continue;
    const value = claimValue(claim);
    if (typeof value === 'string') return value;
  }
  return null;
}

async function fetchEntities(
  qids: string[],
  props: string,
  get: NarrativeAuthorityV7Get,
  wait: (milliseconds: number) => Promise<void>
): Promise<Map<string, EntityRecord>> {
  const result = new Map<string, EntityRecord>();
  const unique = [...new Set(qids.filter((qid) => /^Q\d+$/u.test(qid)))];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => get('https://www.wikidata.org/w/api.php', {
        action: 'wbgetentities',
        ids: batch.join('|'),
        props,
        format: 'json',
        formatversion: '2',
        origin: '*',
      }),
      wait
    );
    const root = objectValue(response.data, 'Wikidata entity response');
    const entities = objectValue(root.entities, 'Wikidata entities');
    for (const qid of batch) {
      const entity = (entities as EntityRecord)[qid];
      if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
        result.set(qid, entity as EntityRecord);
      }
    }
  }
  return result;
}

function canonicalLabel(labels: EntityRecord, preferred: string): string | null {
  const preferredLabel = labels[preferred];
  if (preferredLabel && typeof preferredLabel === 'object') {
    const value = stringValue((preferredLabel as { value?: unknown }).value);
    if (value) return value;
  }
  const entries = Object.entries(labels)
    .map(([lang, value]) => {
      const label = stringValue((value as { value?: unknown }).value);
      return label ? { lang, label } : null;
    })
    .filter((entry): entry is { lang: string; label: string } => entry !== null)
    .sort((a, b) => a.lang.localeCompare(b.lang));
  return entries.length > 0 ? entries[0].label : null;
}

export async function resolveTourDestination(
  input: { city: string; countryCode: string },
  get?: NarrativeAuthorityV7Get
): Promise<TourDestination> {
  const countryCode = input.countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/u.test(countryCode)) {
    throw new Error('DESTINATION_REVIEW_REQUIRED: invalid two-letter country code');
  }

  const resolvedGet = get ?? defaultGet;
  const wait = defaultWait;

  const identity = await resolveCityIdentityV8({
    cityName: input.city.trim(),
    requireSettlement: true,
    countryCode,
    language: 'en',
    get: resolvedGet,
    wait,
  });
  if (identity.status !== 'ok') {
    throw new Error(`DESTINATION_REVIEW_REQUIRED: ${identity.reason}`);
  }
  const cityQid = identity.qid;

  const cityEntities = await fetchEntities([cityQid], 'labels|claims|sitelinks', resolvedGet, wait);
  const cityEntity = cityEntities.get(cityQid);
  if (!cityEntity) {
    throw new Error('DESTINATION_REVIEW_REQUIRED: city entity not found');
  }

  const cityClaims = entityClaims(cityEntity);
  const citySitelinks = entitySitelinks(cityEntity);

  const cityP17Qids = identity.countryQid ? [identity.countryQid] : nonDeprecatedEntityIds(cityClaims, 'P17');

  const visited = new Set<string>([cityQid, ...cityP17Qids]);
  const adminP37Qids: string[] = [];
  let currentLevelQids = [cityQid];

  for (let level = 0; level < 3; level++) {
    const nextLevelQids: string[] = [];
    for (const qid of currentLevelQids) {
      const entity = await fetchEntities([qid], 'claims', resolvedGet, wait).then((m) => m.get(qid));
      if (!entity) continue;
      const p131Qids = nonDeprecatedEntityIds(entityClaims(entity), 'P131');
      for (const parentQid of p131Qids) {
        if (visited.has(parentQid)) continue;
        visited.add(parentQid);
        nextLevelQids.push(parentQid);
      }
    }
    const uniqueNext = [...new Set(nextLevelQids)].slice(0, 4);
    if (uniqueNext.length === 0) break;
    const levelEntities = await fetchEntities(uniqueNext, 'claims', resolvedGet, wait);
    for (const qid of uniqueNext) {
      const entity = levelEntities.get(qid);
      if (!entity) continue;
      const p37Qids = unqualifiedP37EntityIds(entityClaims(entity));
      for (const p37Qid of p37Qids) {
        if (!adminP37Qids.includes(p37Qid)) {
          adminP37Qids.push(p37Qid);
        }
      }
    }
    currentLevelQids = uniqueNext;
  }

  const cityP37Qids = unqualifiedP37EntityIds(cityClaims);
  const allAdminP37Qids = [...new Set([...cityP37Qids, ...adminP37Qids])];

  const allQids = [...new Set([...allAdminP37Qids, ...cityP17Qids])];
  const relatedEntities = await fetchEntities(allQids, 'labels|claims', resolvedGet, wait);

  const cityP37Codes: string[] = [];
  for (const qid of allAdminP37Qids) {
    const entity = relatedEntities.get(qid);
    if (!entity) continue;
    const code = nonDeprecatedStringValue(entityClaims(entity), 'P218');
    if (code && /^[A-Z]{2}$/u.test(code.toUpperCase())) {
      cityP37Codes.push(code.toLowerCase());
    }
  }

  let selectedCountryQid: string | null = null;
  for (const qid of cityP17Qids) {
    const entity = relatedEntities.get(qid);
    if (!entity) continue;
    const p297 = nonDeprecatedStringValue(entityClaims(entity), 'P297');
    if (p297 && p297.toUpperCase() === countryCode) {
      selectedCountryQid = qid;
      break;
    }
  }
  if (!selectedCountryQid) {
    throw new Error('DESTINATION_REVIEW_REQUIRED: no country with matching P297');
  }

  const countryEntity = relatedEntities.get(selectedCountryQid);
  if (!countryEntity) {
    throw new Error('DESTINATION_REVIEW_REQUIRED: country entity not found');
  }
  const countryP37Qids = unqualifiedP37EntityIds(entityClaims(countryEntity));
  const countryP37Entities = await fetchEntities(countryP37Qids, 'labels|claims', resolvedGet, wait);

  const countryP37Codes: string[] = [];
  for (const qid of countryP37Qids) {
    const entity = countryP37Entities.get(qid);
    if (!entity) continue;
    const code = nonDeprecatedStringValue(entityClaims(entity), 'P218');
    if (code && /^[A-Z]{2}$/u.test(code.toUpperCase())) {
      countryP37Codes.push(code.toLowerCase());
    }
  }

  const citySitelinkLanguages = new Set<string>();
  for (const key of Object.keys(citySitelinks)) {
    if (key.endsWith('wiki')) {
      citySitelinkLanguages.add(key.slice(0, -4));
    }
  }

  const countryWithSitelink = countryP37Codes.filter((code) => citySitelinkLanguages.has(code)).sort((a, b) => a.localeCompare(b));
  const countryWithoutSitelink = countryP37Codes.filter((code) => !citySitelinkLanguages.has(code)).sort((a, b) => a.localeCompare(b));

  const researchLanguages: string[] = [];
  for (const code of [...cityP37Codes, ...countryWithSitelink, ...countryWithoutSitelink]) {
    if (!researchLanguages.includes(code)) researchLanguages.push(code);
  }
  if (!researchLanguages.includes('en')) {
    researchLanguages.push('en');
  }
  const capped = researchLanguages.slice(0, 3);
  if (!capped.includes('en')) capped[capped.length - 1] = 'en';

  const page = (project: 'wiki' | 'wikivoyage') => {
    for (const language of capped) {
      const sitelink = citySitelinks[language + project] as { title?: unknown } | undefined;
      if (typeof sitelink?.title === 'string' && sitelink.title.trim()) return { language, title: sitelink.title };
    }
    return null;
  };
  const wikimediaPages = { wikipedia: page('wiki'), wikivoyage: page('wikivoyage') };
  const cityLabels = entityLabels(cityEntity);
  const city = canonicalLabel(cityLabels, 'en') ?? input.city;

  const countryLabels = entityLabels(countryEntity);
  const country = canonicalLabel(countryLabels, 'en') ?? countryCode;

  return {
    qid: cityQid,
    city,
    country,
    countryCode,
    researchLanguages: capped,
    wikimediaPages,
    policyVersion: RESEARCH_POLICY_VERSION,
  };
}
