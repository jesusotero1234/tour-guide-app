import {
  NarrativeAuthorityRegistryV7,
  classifyAgainstRegistryV7,
} from './NarrativeAuthoritiesV7';
import {
  NarrativeCuratorOutputV8,
  NarrativeDossierInputV8,
  NarrativeEvidenceGatesV8,
  NarrativeEvidenceTierV8,
  NarrativeRoleV8,
  buildValidatedDossierV8,
  classifyEvidenceTierV8,
} from './NarrativeDossierV8';
import {
  NarrativeCapturedSourceV7,
  NarrativeCapturedSourceV8,
  NarrativeDiscoveryResultV7,
  NarrativeSourceKindV8,
  classifyNarrativeSourceAuthorityV7,
  classifyWikipediaCaptureV8,
} from './NarrativeSourcesV7';
import {
  NarrativeEvidenceSpanV7,
  segmentCaptureIntoSpansV7,
} from './NarrativeSpansV7';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { normalizeNarrativeIdentityTextV8 } from './NarrativeAuthoritiesV7';

export const NARRATIVE_RESEARCH_BUDGET_V8 = {
  deterministicQueries: 4,
  mappedDomains: 3,
  captures: 12,
  adaptiveQueries: 4,
  packetMaxSpans: 40,
  packetMaxCharacters: 30_000,
  maxQueryLength: 500,
} as const;

export interface NarrativeStopIdentityV8 {
  qid: string;
  labels: string[];
  aliases: string[];
  wikipediaTitle: string | null;
  revision: { revisionId: number; timestamp: string } | null;
}

export interface NarrativeResearchStopInputV8 {
  runId: string;
  stopId: string;
  stopName: string;
  cityName: string;
  cityQid: string;
  countryCode: string;
  language: string;
  required: boolean;
}

export interface NarrativeCuratorPacketV8 {
  stopId: string;
  stopName: string;
  language: string;
  spans: Array<NarrativeEvidenceSpanV7 & { sourceUrl: string; publisherKey: string }>;
  publishers: string[];
  excludedSpanCount: number;
}

export interface NarrativeResearchServicesV8 {
  resolveIdentity(input: { qid: string; language: string }): Promise<NarrativeStopIdentityV8>;
  resolveAuthorities(input: {
    qid: string;
    cityQid: string;
    language: string;
  }): Promise<NarrativeAuthorityRegistryV7>;
  resolveQidFromWikipedia(input: { title: string; language: string }): Promise<string | null>;
  captureWikipedia(input: {
    title: string;
    language: string;
    expectedQid: string;
  }): Promise<NarrativeCapturedSourceV8 | null>;
  search(input: {
    query: string;
    language: string;
    countryCode: string;
    limit: number;
  }): Promise<NarrativeDiscoveryResultV7[]>;
  mapOfficialSite(input: {
    origin: string;
    search: string;
    limit: number;
    language: string;
    countryCode: string;
  }): Promise<NarrativeDiscoveryResultV7[]>;
  captureWeb(input: { url: string }): Promise<NarrativeCapturedSourceV7>;
  curate(input: NarrativeCuratorPacketV8): Promise<NarrativeCuratorOutputV8>;
  proposeAdaptiveQueries?(input: {
    stopName: string;
    aliases: string[];
    language: string;
    countryCode: string;
    officialDomains: string[];
    usedQueries: string[];
    missingRoles: NarrativeRoleV8[];
  }): Promise<string[]>;
}

export type NarrativeResearchStopResultV8 =
  | {
    status: 'sufficient';
    stopId: string;
    gates: NarrativeEvidenceGatesV8;
    dossier: NarrativeDossierV6;
    evidenceTier: Exclude<NarrativeEvidenceTierV8, 'D'>;
    routeEligible: true;
    stats: NarrativeResearchStopStatsV8;
    captures: NarrativeCapturedSourceV8[];
    captureLog: NarrativeCaptureAttemptV8[];
    authorities?: Array<{ qid: string; origin: string; domain: string; url: string | null }>;
  }
  | {
    status: 'evidence_review_required';
    stopId: string;
    gates: NarrativeEvidenceGatesV8;
    dossier: NarrativeDossierV6 | null;
    evidenceTier: 'D' | null;
    routeEligible: false;
    stats: NarrativeResearchStopStatsV8;
    captures: NarrativeCapturedSourceV8[];
    captureLog: NarrativeCaptureAttemptV8[];
    authorities?: Array<{ qid: string; origin: string; domain: string; url: string | null }>;
    reasons: string[];
  }
  | {
    status: 'failed';
    stopId: string;
    failure: { code: string; message: string };
    evidenceTier: null;
    routeEligible: false;
    stats: NarrativeResearchStopStatsV8;
    captures: NarrativeCapturedSourceV8[];
    captureLog: NarrativeCaptureAttemptV8[];
    authorities?: Array<{ qid: string; origin: string; domain: string; url: string | null }>;
  };

export interface NarrativeResearchStopStatsV8 {
  searchQueries: number;
  mappedUrlCount: number;
  attemptedUrlCount: number;
  capturedSourceCount: number;
  publisherCount: number;
  curationCount: number;
}

export type NarrativeCaptureOutcomeV8 =
  | 'discovered'
  | 'skipped_discovery_only'
  | 'capture_failed'
  | 'capture_rejected'
  | 'capture_accepted';

export interface NarrativeCaptureAttemptV8 {
  stopId: string;
  phase: 'p856' | 'deterministic_search' | 'map' | 'adaptive_search' | 'wikipedia';
  requestedUrl: string;
  finalUrl: string;
  authorityBeforeCapture: string;
  authorityAfterCapture: string;
  publisherKey: string | null;
  outcome: NarrativeCaptureOutcomeV8;
  httpStatus: number | null;
  errorClassification: string | null;
  attempt: number;
  elapsedMs: number;
}

function normalizeUrlV8(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeDomainV8(hostname: string): string | null {
  const lower = hostname.toLowerCase();
  if (!lower || lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return null;
  const labels = lower.split('.');
  if (labels.length < 2) return null;
  const domain = labels.slice(-2).join('.');
  if (domain.endsWith('.wikipedia.org') || domain.endsWith('.wikimedia.org') || domain.endsWith('.wikidata.org')) return null;
  return domain;
}

function extractWikimediaExternalLinkDomainsV8(content: string): string[] {
  const lines = content.split('\n');
  let inSection = false;
  const domains = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSection) {
      if (/^(?:==+\s*(?:Enlaces externos|External links)\s*==+|\*\s*(?:Enlaces externos|External links)|##\s*(?:Enlaces externos|External links)|(?:Enlaces externos|External links))$/iu.test(trimmed)) {
        inSection = true;
      }
      continue;
    }
    if (/^(?:==+\s*[^=]|\*\s*(?!(?:Enlaces externos|External links))|##\s*[^#])$/iu.test(trimmed)) {
      break;
    }
    const urlPattern = /https?:\/\/[a-zA-Z0-9.-]+/giu;
    for (const match of trimmed.matchAll(urlPattern)) {
      try {
        const url = new URL(match[0]);
        const domain = normalizeDomainV8(url.hostname);
        if (domain) domains.add(domain);
      } catch {
        // ignore malformed URLs
      }
    }
    const barePattern = /\bwww\.[a-zA-Z0-9.-]+/giu;
    for (const match of trimmed.matchAll(barePattern)) {
      const domain = normalizeDomainV8(match[0]);
      if (domain) domains.add(domain);
    }
  }
  return [...domains];
}

function hasIdentityTermV8(text: string, stopName: string, identity: NarrativeStopIdentityV8): boolean {
  const normalized = normalizeNarrativeIdentityTextV8(text);
  if (!normalized) return false;
  const terms = [
    normalizeNarrativeIdentityTextV8(stopName),
    normalizeNarrativeIdentityTextV8(identity.wikipediaTitle ?? ''),
    ...identity.labels.map(normalizeNarrativeIdentityTextV8),
    ...identity.aliases.map(normalizeNarrativeIdentityTextV8),
  ].filter((term) => term.length >= 3);
  return terms.some((term) => normalized.includes(term));
}

function curatorPacketProseV8(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/\S+|\bwww\.\S+/giu, ' ')
    .replace(/[#*_`>|-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function usefulCuratorPacketProseV8(value: string): boolean {
  const prose = curatorPacketProseV8(value);
  return prose.length >= 40
    && prose.split(/\s+/u).length >= 7
    && /\p{L}/u.test(prose);
}

export function buildCuratorPacketV8(input: {
  stopId: string;
  stopName: string;
  language: string;
  captures: NarrativeCapturedSourceV8[];
  spansBySource: Map<string, NarrativeEvidenceSpanV7[]>;
  aliases: string[];
}): NarrativeCuratorPacketV8 {
  const budget = NARRATIVE_RESEARCH_BUDGET_V8;
  const nameTerms = [input.stopName, ...input.aliases].map(normalizeNarrativeIdentityTextV8);
  const candidates: Array<{
    span: NarrativeEvidenceSpanV7;
    source: NarrativeCapturedSourceV8;
    score: number;
  }> = [];
  let filteredSpanCount = 0;
  for (const capture of input.captures) {
    const spans = input.spansBySource.get(capture.sourceId) ?? [];
    spans.forEach((span, index) => {
      if (!usefulCuratorPacketProseV8(span.text)) {
        filteredSpanCount += 1;
        return;
      }
      const normalized = normalizeNarrativeIdentityTextV8(span.text);
      const nameScore = nameTerms.some((term) => term.length > 0 && normalized.includes(term)) ? 4 : 0;
      const authorityScore = capture.authority.tier === 'established_source'
        ? 3 : capture.authority.tier === 'primary_authority' ? 2 : 1;
      candidates.push({
        span,
        source: capture,
        score: nameScore + authorityScore + (index === 0 ? 1 : 0),
      });
    });
  }
  candidates.sort((left, right) => (
    right.score - left.score
    || left.source.finalUrl.localeCompare(right.source.finalUrl)
    || left.span.start - right.span.start
  ));
  const reservedByPublisher = new Map<string, number>();
  const tier = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidate.source.authority.publisherKey;
    const reserved = reservedByPublisher.get(key) ?? 0;
    tier.set(candidate.span.evidenceSpanId, reserved < 3 ? 0 : 1);
    if (reserved < 3) reservedByPublisher.set(key, reserved + 1);
  }
  candidates.sort((left, right) => (
    (tier.get(left.span.evidenceSpanId) ?? 1) - (tier.get(right.span.evidenceSpanId) ?? 1)
    || right.score - left.score
    || left.source.finalUrl.localeCompare(right.source.finalUrl)
    || left.span.start - right.span.start
  ));
  const spans: Array<NarrativeEvidenceSpanV7 & { sourceUrl: string; publisherKey: string }> = [];
  let characters = 0;
  let excludedSpanCount = 0;
  for (const candidate of candidates) {
    if (spans.length >= budget.packetMaxSpans) break;
    if (characters + candidate.span.text.length > budget.packetMaxCharacters) break;
    spans.push({
      ...candidate.span,
      sourceUrl: candidate.source.finalUrl,
      publisherKey: candidate.source.authority.publisherKey,
    });
    characters += candidate.span.text.length;
  }
  excludedSpanCount = filteredSpanCount + candidates.length - spans.length;
  return {
    stopId: input.stopId,
    stopName: input.stopName,
    language: input.language,
    spans,
    publishers: [...new Set(input.captures.map((capture) => capture.authority.publisherKey))],
    excludedSpanCount,
  };
}

function classifyWebCaptureV8(
  capture: NarrativeCapturedSourceV7,
  registry: NarrativeAuthorityRegistryV7,
  stopName: string
): NarrativeCapturedSourceV8 {
  const hostname = new URL(capture.finalUrl).hostname.toLowerCase();
  const registered = registry.authorities.some((authority) => (
    hostname === authority.domain || hostname.endsWith(`.${authority.domain}`)
  ));
  const sourceKind: NarrativeSourceKindV8 = registered ? 'official_web' : 'other_web';
  const authority = registered
    ? classifyAgainstRegistryV7({
      url: capture.finalUrl,
      title: capture.title,
      description: capture.content.slice(0, 500),
      engine: 'capture',
      authority: classifyNarrativeSourceAuthorityV7(capture.finalUrl),
    }, registry, stopName).authority
    : classifyNarrativeSourceAuthorityV7(capture.finalUrl);
  return {
    ...capture,
    sourceKind,
    entityQid: null,
    publisherKey: authority.publisherKey,
    authority,
  };
}

export async function researchNarrativeStopV8(
  input: NarrativeResearchStopInputV8,
  services: NarrativeResearchServicesV8
): Promise<NarrativeResearchStopResultV8> {
  const budget = NARRATIVE_RESEARCH_BUDGET_V8;
  const identity = await services.resolveIdentity({ qid: input.stopId, language: input.language });
  const registry = await services.resolveAuthorities({
    qid: input.stopId,
    cityQid: input.cityQid,
    language: input.language,
  });
  const captures: NarrativeCapturedSourceV8[] = [];
  const spansBySource = new Map<string, NarrativeEvidenceSpanV7[]>();
  const attemptedUrls = new Set<string>();
  const mappedUrls = new Set<string>();
  const usedQueries: string[] = [];
  const captureLog: NarrativeCaptureAttemptV8[] = [];
  const wikimediaExternalDomains = new Set<string>();
  let searchQueries = 0;
  let curationCount = 0;
  const state: {
    round: { dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8 } | null;
    failure: string | null;
    lastValidCaptureCount: number;
  } = { round: null, failure: null, lastValidCaptureCount: 0 };

  const publisherCount = (): number => (
    new Set(captures.map((capture) => capture.authority.publisherKey)).size
  );

  const recordAttempt = (entry: Omit<NarrativeCaptureAttemptV8, 'stopId' | 'attempt' | 'elapsedMs'>): void => {
    captureLog.push({ ...entry, stopId: input.stopId, attempt: attemptedUrls.size, elapsedMs: 0 });
  };

  const addCapturedSource = (captured: NarrativeCapturedSourceV8): boolean => {
    if (!attemptedUrls.has(captured.requestedUrl)) attemptedUrls.add(captured.requestedUrl);
    if (attemptedUrls.size > budget.captures) return false;
    if (captured.authority.tier === 'discovery_only') return false;
    if (captures.some((existing) => existing.finalUrl === captured.finalUrl)) return false;
    const spanned = segmentCaptureIntoSpansV7(captured);
    if (captured.content.trim() && spanned.spans.length === 0) return false;
    captures.push(captured);
    spansBySource.set(captured.sourceId, spanned.spans);
    return true;
  };

  const attemptWebCapture = async (
    url: string,
    phase: NarrativeCaptureAttemptV8['phase']
  ): Promise<void> => {
    if (attemptedUrls.has(url)) return;
    attemptedUrls.add(url);
    if (attemptedUrls.size > budget.captures) return;
    const target = url.replace(/^http:\/\//iu, 'https://');
    let hostname: string;
    try {
      hostname = new URL(target).hostname.toLowerCase();
    } catch {
      recordAttempt({
        phase,
        requestedUrl: url,
        finalUrl: url,
        authorityBeforeCapture: 'invalid_url',
        authorityAfterCapture: 'invalid_url',
        publisherKey: null,
        outcome: 'capture_failed',
        httpStatus: null,
        errorClassification: 'invalid_url',
      });
      return;
    }
    const targetDomain = normalizeDomainV8(hostname);
    const registered = registry.authorities.some((authority) => (
      hostname === authority.domain || hostname.endsWith('.' + authority.domain)
    ));
    const isWikimediaExternal = phase === 'deterministic_search' && targetDomain !== null && wikimediaExternalDomains.has(targetDomain);
    if (!registered) {
      if (!isWikimediaExternal) {
        recordAttempt({
          phase,
          requestedUrl: url,
          finalUrl: url,
          authorityBeforeCapture: 'discovery_only',
          authorityAfterCapture: 'discovery_only',
          publisherKey: null,
          outcome: 'skipped_discovery_only',
          httpStatus: null,
          errorClassification: null,
        });
        return;
      }
    }
    const startedAt = Date.now();
    try {
      let captured = await services.captureWeb({ url: target });
      let asV8 = classifyWebCaptureV8(captured, registry, input.stopName);
      if (!registered && isWikimediaExternal) {
        const identityText = `${asV8.title} ${asV8.content}`;
        if (hasIdentityTermV8(identityText, input.stopName, identity)) {
          asV8 = {
            ...asV8,
            authority: {
              tier: 'established_source',
              publisherKey: asV8.authority.publisherKey,
              rule: 'wikimedia_external_link_identity_verified',
            },
          };
        }
      }
      let accepted = addCapturedSource(asV8);
      if (!accepted && asV8.authority.tier === 'discovery_only' && registered) {
        // Un scrape transitorio (cookie wall, página parcial) puede llegar sin
        // el nombre de la parada aunque la URL sea la oficial registrada:
        // reintentar una única vez; la identidad se vuelve a comprobar igual.
        captured = await services.captureWeb({ url: target });
        asV8 = classifyWebCaptureV8(captured, registry, input.stopName);
        accepted = addCapturedSource(asV8);
      }
      const log: NarrativeCaptureAttemptV8 = {
        stopId: input.stopId,
        phase,
        requestedUrl: url,
        finalUrl: asV8.finalUrl,
        authorityBeforeCapture: 'registered',
        authorityAfterCapture: asV8.authority.tier,
        publisherKey: asV8.authority.publisherKey,
        outcome: accepted ? 'capture_accepted' : 'capture_rejected',
        httpStatus: asV8.finalHttpStatus,
        errorClassification: null,
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - startedAt,
      };
      captureLog.push(log);
    } catch (error) {
      captureLog.push({
        stopId: input.stopId,
        phase,
        requestedUrl: url,
        finalUrl: url,
        authorityBeforeCapture: 'registered',
        authorityAfterCapture: 'error',
        publisherKey: null,
        outcome: 'capture_failed',
        httpStatus: (error as { response?: { status?: number } })?.response?.status ?? null,
        errorClassification: (error as { code?: string })?.code ?? null,
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - startedAt,
      });
    }
  };

  const curate = async (): Promise<
    | { ok: true; dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8; tier: NarrativeEvidenceTierV8 }
    | { ok: false; failure: string }
  > => {
    if (curationCount >= 2) return { ok: false, failure: 'curation budget exhausted' };
    curationCount += 1;
    const curated = await curateRoundV8(input, services, captures, spansBySource, identity, registry);
    if (curated && 'dossier' in curated) {
      const tier = classifyEvidenceTierV8(curated.dossier, curated.gates, captures);
      state.round = curated;
      state.failure = null;
      state.lastValidCaptureCount = captures.length;
      return { ok: true, dossier: curated.dossier, gates: curated.gates, tier };
    }
    if (curated) {
      state.failure = (curated as { failure: string }).failure;
      return { ok: false, failure: (curated as { failure: string }).failure };
    }
    return { ok: false, failure: 'curation failed' };
  };

  const sufficient = (round: { dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8 }, tier: Exclude<NarrativeEvidenceTierV8, 'D'>): NarrativeResearchStopResultV8 => {
    return {
      status: 'sufficient',
      stopId: input.stopId,
      gates: round.gates,
      dossier: round.dossier,
      evidenceTier: tier,
      routeEligible: true,
      captures,
      captureLog,
      authorities: registry.authorities.map((authority) => ({
        qid: authority.qid,
        origin: authority.origin,
        domain: authority.domain,
        url: authority.url,
      })),
      stats: {
        searchQueries,
        mappedUrlCount: mappedUrls.size,
        attemptedUrlCount: attemptedUrls.size,
        capturedSourceCount: captures.length,
        publisherCount: publisherCount(),
        curationCount,
      },
    };
  };

  // Semilla: Wikipedia por API y URLs P856 exactas.
  if (identity.wikipediaTitle) {
    try {
      const wikipedia = await services.captureWikipedia({
        title: identity.wikipediaTitle,
        language: input.language,
        expectedQid: input.stopId,
      });
      if (wikipedia) {
        const accepted = addCapturedSource(wikipedia);
        captureLog.push({
          stopId: input.stopId,
          phase: 'wikipedia',
          requestedUrl: wikipedia.requestedUrl,
          finalUrl: wikipedia.finalUrl,
          authorityBeforeCapture: 'registered',
          authorityAfterCapture: wikipedia.authority.tier,
          publisherKey: wikipedia.authority.publisherKey,
          outcome: accepted ? 'capture_accepted' : 'capture_rejected',
          httpStatus: wikipedia.finalHttpStatus,
          errorClassification: null,
          attempt: attemptedUrls.size,
          elapsedMs: 0,
        });
        if (accepted && wikipedia.entityQid === input.stopId) {
          for (const domain of extractWikimediaExternalLinkDomainsV8(wikipedia.content)) {
            wikimediaExternalDomains.add(domain);
          }
        }
      }
    } catch (error) {
      captureLog.push({
        stopId: input.stopId,
        phase: 'wikipedia',
        requestedUrl: 'https://' + input.language + '.wikipedia.org/wiki/' + identity.wikipediaTitle,
        finalUrl: '',
        authorityBeforeCapture: 'registered',
        authorityAfterCapture: 'error',
        publisherKey: null,
        outcome: 'capture_failed',
        httpStatus: (error as { response?: { status?: number } })?.response?.status ?? null,
        errorClassification: (error as { code?: string })?.code ?? null,
        attempt: attemptedUrls.size,
        elapsedMs: 0,
      });
    }
  }
  for (const authority of registry.authorities) {
    if (attemptedUrls.size >= budget.captures) break;
    if (!authority.url) continue;
    await attemptWebCapture(authority.url, 'p856');
  }

  // Primera curación (ronda 1) con al menos una captura aceptada.
  if (captures.length >= 1) {
    const result = await curate();
    if (result.ok && (result.tier === 'A' || result.tier === 'B')) {
      return sufficient(state.round!, result.tier);
    }
  }

  // Descubrimiento: reunir resultados, deduplicar, priorizar y capturar.
  const officialDomains = registry.authorities.map((authority) => authority.domain);
  const gathered: Array<{ url: string; phase: NarrativeCaptureAttemptV8['phase']; priority: number }> = [];
  const gatheredUrls = new Set<string>();
  // Nombre completo desambiguado (p. ej. "Teatro romano de Málaga" en lugar de
  // "Teatro romano") y sin comillas: Bing ignora la desambiguación con la
  // ciudad suelta y con frases entrecomilladas devuelve resultados genéricos.
  const searchName = identity.wikipediaTitle && identity.wikipediaTitle.length > input.stopName.length
    ? identity.wikipediaTitle
    : input.stopName;
  const citySuffix = searchName.toLocaleLowerCase().includes(input.cityName.toLocaleLowerCase())
    ? ''
    : ` ${input.cityName}`;
  const deterministicQueries: string[] = [];
  let corroboratedDomain: string | null = null;
  if (wikimediaExternalDomains.size > 0) {
    corroboratedDomain = [...wikimediaExternalDomains].sort()[0];
    deterministicQueries.push(`site:${corroboratedDomain} ${searchName}${citySuffix}`);
  }
  deterministicQueries.push(
    searchName + citySuffix,
    `${searchName}${citySuffix} historia cronología`,
    `${searchName}${citySuffix} arquitectura elementos visibles`,
    `${searchName}${citySuffix} función uso transformación`,
  );
  const cappedDeterministicQueries = deterministicQueries.slice(0, budget.deterministicQueries);
  for (const query of cappedDeterministicQueries) {
    if (attemptedUrls.size >= budget.captures) break;
    searchQueries += 1;
    usedQueries.push(query);
    const isCorroboratedSiteQuery = corroboratedDomain !== null && query === `site:${corroboratedDomain} ${searchName}${citySuffix}`;
    const resultLimit = isCorroboratedSiteQuery ? 10 : 5;
    let results: NarrativeDiscoveryResultV7[] = [];
    try {
      results = await services.search({
        query,
        language: input.language,
        countryCode: input.countryCode,
        limit: resultLimit,
      });
    } catch (error) {
      captureLog.push({
        stopId: input.stopId,
        phase: 'deterministic_search',
        requestedUrl: query,
        finalUrl: '',
        authorityBeforeCapture: 'search_error',
        authorityAfterCapture: 'search_error',
        publisherKey: null,
        outcome: 'discovered',
        httpStatus: (error as { response?: { status?: number } })?.response?.status ?? null,
        errorClassification: (error as { code?: string })?.code ?? null,
        attempt: attemptedUrls.size,
        elapsedMs: 0,
      });
    }
    for (const result of results.slice(0, resultLimit)) {
      const url = normalizeUrlV8(result.url);
      if (!gatheredUrls.has(url)) {
        gatheredUrls.add(url);
        let priority = authorityPriorityV8(url, registry);
        if (isCorroboratedSiteQuery && corroboratedDomain !== null) {
          try {
            const hostname = new URL(url).hostname.toLowerCase();
            const domain = normalizeDomainV8(hostname);
            if (domain === corroboratedDomain) priority = -1;
          } catch {
            // ignore malformed URL
          }
        }
        gathered.push({ url, phase: 'deterministic_search', priority });
      }
    }
  }
  for (const domain of officialDomains.slice(0, budget.mappedDomains)) {
    if (attemptedUrls.size >= budget.captures) break;
    let mapped: NarrativeDiscoveryResultV7[] = [];
    try {
      mapped = await services.mapOfficialSite({
        origin: domain,
        search: [input.stopName, input.cityName, ...identity.aliases].slice(0, 3).join(' '),
        limit: 20,
        language: input.language,
        countryCode: input.countryCode,
      });
    } catch (error) {
      captureLog.push({
        stopId: input.stopId,
        phase: 'map',
        requestedUrl: domain,
        finalUrl: '',
        authorityBeforeCapture: 'map_error',
        authorityAfterCapture: 'map_error',
        publisherKey: null,
        outcome: 'discovered',
        httpStatus: (error as { response?: { status?: number } })?.response?.status ?? null,
        errorClassification: (error as { code?: string })?.code ?? null,
        attempt: attemptedUrls.size,
        elapsedMs: 0,
      });
    }
    for (const result of mapped.slice(0, 5)) {
      if (mappedUrls.size < budget.captures) mappedUrls.add(normalizeUrlV8(result.url));
      const url = normalizeUrlV8(result.url);
      if (!gatheredUrls.has(url)) {
        gatheredUrls.add(url);
        gathered.push({ url, phase: 'map', priority: authorityPriorityV8(url, registry) });
      }
    }
  }
  // A igual prioridad de autoridad, capturar primero los resultados de las
  // búsquedas deterministas (relevantes por query) antes que los enlaces
  // genéricos de /map: las páginas de delegación del mismo dominio podrían
  // agotar el presupuesto antes de intentar la página oficial correcta.
  const discoveryPhaseRank = (phase: NarrativeCaptureAttemptV8['phase']): number => (
    phase === 'deterministic_search' ? 0 : phase === 'adaptive_search' ? 1 : 2
  );
  gathered.sort((left, right) => (
    left.priority - right.priority
    || discoveryPhaseRank(left.phase) - discoveryPhaseRank(right.phase)
    || left.url.localeCompare(right.url)
  ));
  const targetAccepted = 4;
  for (const item of gathered) {
    if (attemptedUrls.size >= budget.captures) break;
    if (captures.length >= targetAccepted && publisherCount() >= 2) break;
    await attemptWebCapture(item.url, item.phase);
  }



  // Ronda adaptativa: solo si falta writerReady y queda presupuesto.
  if (attemptedUrls.size < budget.captures && services.proposeAdaptiveQueries) {
    let adaptive: string[] = [];
    try {
      adaptive = await services.proposeAdaptiveQueries({
        stopName: input.stopName,
        aliases: identity.aliases,
        language: input.language,
        countryCode: input.countryCode,
        officialDomains,
        usedQueries,
        missingRoles: state.round?.gates.missingWriterRoles ?? [],
      });
    } catch {
      // Sin consultas adaptativas si el planner falla.
    }
    for (const rawQuery of adaptive.slice(0, budget.adaptiveQueries)) {
      const query = rawQuery.trim();
      if (!query || query.length > budget.maxQueryLength) continue;
      if (usedQueries.includes(query)) continue;
      if (attemptedUrls.size >= budget.captures) break;
      usedQueries.push(query);
      searchQueries += 1;
      let results: NarrativeDiscoveryResultV7[] = [];
      try {
        results = await services.search({
          query,
          language: input.language,
          countryCode: input.countryCode,
          limit: 5,
        });
      } catch (error) {
        captureLog.push({
          stopId: input.stopId,
          phase: 'adaptive_search',
          requestedUrl: query,
          finalUrl: '',
          authorityBeforeCapture: 'search_error',
          authorityAfterCapture: 'search_error',
          publisherKey: null,
          outcome: 'discovered',
          httpStatus: (error as { response?: { status?: number } })?.response?.status ?? null,
          errorClassification: (error as { code?: string })?.code ?? null,
          attempt: attemptedUrls.size,
          elapsedMs: 0,
        });
      }
      for (const result of results.slice(0, 5)) {
        if (attemptedUrls.size >= budget.captures) break;
        const url = normalizeUrlV8(result.url);
        if (!gatheredUrls.has(url)) {
          gatheredUrls.add(url);
          await attemptWebCapture(url, 'adaptive_search');
        }
      }
    }
  }

  // CURATE #2: solo si las capturas aumentaron tras la última curación válida,
  // o si no hay ronda válida y existen capturas.
  const shouldCurate2 = captures.length > state.lastValidCaptureCount
    || (state.round === null && captures.length > 0);
  if (shouldCurate2) {
    const result = await curate();
    if (result.ok && (result.tier === 'A' || result.tier === 'B' || result.tier === 'C')) {
      return sufficient(state.round!, result.tier);
    }
  }

  const finalGates = state.round?.gates ?? null;
  const reasons: string[] = [];
  let evidenceTier: NarrativeEvidenceTierV8 | null = null;
  if (state.failure !== null) {
    evidenceTier = null;
    reasons.push('curator_contract_failed: ' + state.failure);
  } else if (state.round) {
    evidenceTier = classifyEvidenceTierV8(state.round.dossier, state.round.gates, captures);
    if (evidenceTier !== 'D') {
      return sufficient(state.round, evidenceTier);
    }
    reasons.push('evidence tier D: minimum evidence not ready');
    for (const role of (finalGates?.missingWriterRoles ?? [])) {
      reasons.push('missing writer role ' + role);
    }
  } else {
    evidenceTier = null;
    reasons.push('no valid dossier round');
  }
  if (reasons.length === 0) reasons.push('evidence tier D: minimum evidence not ready');
  return {
    status: 'evidence_review_required',
    stopId: input.stopId,
    gates: finalGates ?? {
      minimumEvidenceReady: false,
      writerReady: false,
      missingMinimumRoles: [],
      missingWriterRoles: [],
    },
    dossier: state.round ? state.round.dossier : null,
    evidenceTier,
    routeEligible: false,
    captures,
    captureLog,
    authorities: registry.authorities.map((authority) => ({
      qid: authority.qid,
      origin: authority.origin,
      domain: authority.domain,
      url: authority.url,
    })),
    stats: {
      searchQueries,
      mappedUrlCount: mappedUrls.size,
      attemptedUrlCount: attemptedUrls.size,
      capturedSourceCount: captures.length,
      publisherCount: publisherCount(),
      curationCount,
    },
    reasons,
  };
}

function authorityPriorityV8(url: string, registry: NarrativeAuthorityRegistryV7): number {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return 100;
  }
  const originOrder: Record<string, number> = {
    place_p856: 0,
    city_p856: 1,
    admin_level_1: 2,
    admin_level_2: 3,
    admin_level_3: 4,
  };
  let priority = 50;
  for (const authority of registry.authorities) {
    if (hostname === authority.domain || hostname.endsWith('.' + authority.domain)) {
      priority = Math.min(priority, originOrder[authority.origin] ?? 50);
    }
  }
  // Los dominios estatales genéricos bajan de prioridad frente a autoridad local/cultural.
  if (/(^|\.)(gob|gov|adm)\./u.test(hostname)) priority += 1;
  return priority;
}

async function curateRoundV8(
  input: NarrativeResearchStopInputV8,
  services: NarrativeResearchServicesV8,
  captures: NarrativeCapturedSourceV8[],
  spansBySource: Map<string, NarrativeEvidenceSpanV7[]>,
  identity: NarrativeStopIdentityV8,
  registry: NarrativeAuthorityRegistryV7
): Promise<
  | { dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8 }
  | { failure: string }
> {
  if (captures.length === 0) return { failure: 'no captures in this round' };
  const packet = buildCuratorPacketV8({
    stopId: input.stopId,
    stopName: input.stopName,
    language: input.language,
    captures,
    spansBySource,
    aliases: identity.aliases,
  });
  if (packet.spans.length === 0) return { failure: 'no spans in the curator packet' };
  let output: NarrativeCuratorOutputV8;
  try {
    output = await services.curate(packet);
  } catch (error) {
    return { failure: `curator threw: ${error instanceof Error ? error.message : String(error)}` };
  }
  const dossierInput: NarrativeDossierInputV8 = {
    stopId: input.stopId,
    stopName: input.stopName,
    qid: input.stopId,
    language: input.language,
    curatorOutput: output,
    captures,
    spansBySource,
    authorizedIdentityNames: [...identity.labels, ...identity.aliases],
  };
  const validation = buildValidatedDossierV8(dossierInput);
  if (validation.status !== 'ok') return { failure: validation.reason };
  return { dossier: validation.value.dossier, gates: validation.value.gates };
}

function sufficientResultV8(
  input: NarrativeResearchStopInputV8,
  dossier: NarrativeDossierV6,
  gates: NarrativeEvidenceGatesV8,
  evidenceTier: Exclude<NarrativeEvidenceTierV8, 'D'>,
  captures: NarrativeCapturedSourceV8[],
  stats: Omit<NarrativeResearchStopStatsV8, 'capturedSourceCount' | 'publisherCount'>
): NarrativeResearchStopResultV8 {
  return {
    status: 'sufficient',
    stopId: input.stopId,
    gates,
    dossier,
    evidenceTier,
    routeEligible: true,
    captures,
    captureLog: [],
    stats: {
      ...stats,
      capturedSourceCount: captures.length,
      publisherCount: new Set(captures.map((capture) => capture.authority.publisherKey)).size,
      curationCount: 0,
    },
  };
}
