import {
  NarrativeAuthorityRegistryV7,
  classifyAgainstRegistryV7,
} from './NarrativeAuthoritiesV7';
import {
  NarrativeCuratorOutputV8,
  NarrativeDossierInputV8,
  NarrativeEvidenceGatesV8,
  NarrativeRoleV8,
  buildValidatedDossierV8,
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
  for (const capture of input.captures) {
    const spans = input.spansBySource.get(capture.sourceId) ?? [];
    spans.forEach((span, index) => {
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
  const firstSpanBySource = new Map<string, NarrativeEvidenceSpanV7>();
  for (const capture of input.captures) {
    const first = (input.spansBySource.get(capture.sourceId) ?? [])[0];
    if (first) firstSpanBySource.set(capture.sourceId, first);
  }
  candidates.sort((left, right) => (
    Number(firstSpanBySource.has(right.source.sourceId)) - Number(firstSpanBySource.has(left.source.sourceId))
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
  excludedSpanCount = candidates.length - spans.length;
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
  let searchQueries = 0;
  let curationCount = 0;
  const state: {
    round: { dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8 } | null;
    failure: string | null;
  } = { round: null, failure: null };

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
    const registered = registry.authorities.some((authority) => (
      hostname === authority.domain || hostname.endsWith('.' + authority.domain)
    ));
    if (!registered) {
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
    const startedAt = Date.now();
    try {
      let captured = await services.captureWeb({ url: target });
      let asV8 = classifyWebCaptureV8(captured, registry, input.stopName);
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

  const curate = async (): Promise<boolean> => {
    if (curationCount >= 2) return false;
    curationCount += 1;
    const curated = await curateRoundV8(input, services, captures, spansBySource, identity, registry);
    if (curated && 'dossier' in curated) {
      state.round = curated;
      state.failure = null;
      return curated.gates.writerReady;
    }
    if (curated) state.failure = (curated as { failure: string }).failure;
    return false;
  };

  const sufficient = (): NarrativeResearchStopResultV8 => ({
    status: 'sufficient',
    stopId: input.stopId,
    gates: state.round?.gates ?? {
      minimumEvidenceReady: false,
      writerReady: false,
      missingMinimumRoles: [],
      missingWriterRoles: [],
    },
    dossier: state.round?.dossier ?? null as unknown as NarrativeDossierV6,
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
  });

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

  // Si ya hay dos publishers, primera curación (ronda 1).
  if (publisherCount() >= 2) {
    const done = await curate();
    if (done) return sufficient();
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
  const deterministicQueries = [
    searchName + citySuffix,
    `${searchName}${citySuffix} historia cronología`,
    `${searchName}${citySuffix} arquitectura elementos visibles`,
    `${searchName}${citySuffix} función uso transformación`,
  ];
  for (const query of deterministicQueries) {
    if (attemptedUrls.size >= budget.captures) break;
    searchQueries += 1;
    usedQueries.push(query);
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
    for (const result of results.slice(0, 5)) {
      const url = normalizeUrlV8(result.url);
      if (!gatheredUrls.has(url)) {
        gatheredUrls.add(url);
        gathered.push({ url, phase: 'deterministic_search', priority: authorityPriorityV8(url, registry) });
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

  // Curación agregada (ronda 1 o 2) tras el descubrimiento.
  if (publisherCount() >= 2) {
    const done = await curate();
    if (done) return sufficient();
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
    if (captures.length > 0 && publisherCount() >= 2) {
      const done = await curate();
      if (done) return sufficient();
    }
  }

  const finalGates = state.round?.gates ?? null;
  const reasons: string[] = [];
  if (state.failure !== null && publisherCount() < 2) {
    reasons.push('authority_insufficient: fewer than two independent publishers');
  } else if (state.failure !== null) {
    reasons.push('curator_contract_failed: ' + state.failure);
  } else {
    if (publisherCount() < 2
      || (state.round && state.round.dossier.sufficiency.independentPublisherCount < 2)) {
      reasons.push('authority_insufficient: fewer than two independent publishers');
    }
    if (state.round && state.round.dossier.sufficiency.authoritySourceCount < 2) {
      reasons.push('authority_insufficient: fewer than two authority sources');
    }
    for (const role of (finalGates?.missingWriterRoles ?? [])) {
      reasons.push('missing writer role ' + role);
    }
  }
  if (reasons.length === 0) reasons.push('authority_insufficient');
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
  captures: NarrativeCapturedSourceV8[],
  stats: Omit<NarrativeResearchStopStatsV8, 'capturedSourceCount' | 'publisherCount'>
): NarrativeResearchStopResultV8 {
  return {
    status: 'sufficient',
    stopId: input.stopId,
    gates: {
      minimumEvidenceReady: true,
      writerReady: true,
      missingMinimumRoles: [],
      missingWriterRoles: [],
    },
    dossier,
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
