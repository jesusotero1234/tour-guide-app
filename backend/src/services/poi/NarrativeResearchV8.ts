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
  normalizeNarrativeCuratorOutputV8,
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
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';
import { evaluateNarrativeRichnessV8 } from './NarrativeRichnessV8';

export type NarrativeWebCaptureRequestClassV8 = 'place_exact' | 'discovered_secondary';

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
  narrationTarget?: NarrativeNarrationTargetV8;
}

export interface NarrativeCuratorPacketV8 {
  stopId: string;
  stopName: string;
  language: string;
  spans: Array<NarrativeEvidenceSpanV7 & { sourceUrl: string; publisherKey: string }>;
  publishers: string[];
  excludedSpanCount: number;
  priorityRoles: NarrativeRoleV8[];
  narrationTarget: NarrativeNarrationTargetV8;
}

export const NARRATIVE_ROLE_DEFINITIONS_V8 = [
  'Definiciones operativas:',
  'visible_observation: rasgo material, espacial o arquitectónico observable por el visitante.',
  'chronology_or_transformation: construcción, reforma, destrucción, restauración o cambio en el tiempo.',
  'human_agency_or_lived_function: personas, instituciones, comunidades o usos documentados del lugar.',
  'tension_or_contrast: contraste documentado entre etapas, funciones, estados o fuerzas; incluye',
  'destrucción/reconstrucción, abandono/recuperación, uso original/uso posterior, defensa/vida palaciega,',
  'asedio/uso actual o conflicto histórico; no exige una polémica contemporánea.',
  'distinctive_trait: rasgo que diferencia esta parada de las demás.',
] as const;

export function meetsNarrativeRichnessTargetV8(roles: NarrativeRoleV8[], target: NarrativeNarrationTargetV8 | undefined): boolean {
  if (target === undefined) return true;
  if (roles.length < target.minPropositions) return false;
  const visualCount = roles.filter((role) => role === 'visible_observation' || role === 'distinctive_trait').length;
  return visualCount >= target.minVisualAnchors;
}

export function curatorRoleGuidanceV8(priorityRoles: NarrativeRoleV8[]): string[] {
  const hasVisualRole = priorityRoles.some((role) => role === 'visible_observation' || role === 'distinctive_trait');
  return [
    ...NARRATIVE_ROLE_DEFINITIONS_V8,
    'Antes de añadir una segunda proposición para un rol, intenta cubrir una proposición sólida',
    'para cada rol soportado por la evidencia.',
    ...(priorityRoles.length > 0 ? [
      `Esta es una ronda de reparación. Prioriza primero: ${priorityRoles.join(', ')}.`,
      'Cubre esos roles cuando exista soporte literal; no inventes hechos ni elimines roles ya',
      'cubiertos salvo que carezcan de soporte válido.',
      ...(hasVisualRole ? [
        'Existe un déficit de anclajes visuales: la evidencia puede justificar más de una proposición del mismo rol visual.',
        'No inventes detalles visuales; usa únicamente el soporte literal disponible.',
      ] : []),
    ] : []),
  ];
}

export const NARRATIVE_ADAPTIVE_QUERY_GUIDANCE_V8 = [
  'Interpreta tension_or_contrast como contraste histórico documentado, no solo controversia actual.',
  'Prioriza patrones como destrucción/reconstrucción, abandono/recuperación, uso original/uso posterior,',
  'asedio/defensa/transformación, reformas/cambios de función y estado histórico/estado actual.',
] as const;

export const NARRATIVE_CURATOR_SUPPORT_GUIDANCE_V8 = [
  'Cada soporte debe usar 1-3 evidenceSpanIds contiguos de una única fuente.',
  'IDs consecutivos válidos: 0026 + 0027. Ejemplo inválido: 0026 + 0030.',
  'Para evidencia separada, usa objetos support separados o divide el texto en proposiciones atómicas.',
  'Requiere authorizedNames/authorizedNumbers literales; no conviertas diez en 10.',
] as const;

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
  captureWeb(input: { url: string; requestClass: NarrativeWebCaptureRequestClassV8 }): Promise<NarrativeCapturedSourceV7>;
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
  searchQueryAttempts: number;
  searchQuerySuccesses: number;
  mapAttempts: number;
  mapSuccesses: number;
  webCaptureAttempts: number;
  webCaptureResponses: number;
  infrastructureFailureCount: number;
  mappedUrlCount: number;
  attemptedUrlCount: number;
  capturedSourceCount: number;
  publisherCount: number;
  curationCount: number;
}

export type NarrativeCaptureOutcomeV8 =
  | 'discovered'
  | 'provider_failed'
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

function canonicalAttemptUrlV8(raw: string): string {
  return normalizeUrlV8(raw.replace(/^http:\/\//iu, 'https://'));
}

const INFRASTRUCTURE_ERROR_CODES_V8 = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function errorCodeV8(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && candidate.code.trim()) return candidate.code;
    current = candidate.cause;
  }
  return null;
}

function errorHttpStatusV8(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function isInfrastructureFailureV8(error: unknown): boolean {
  const code = errorCodeV8(error);
  return code !== null && INFRASTRUCTURE_ERROR_CODES_V8.has(code.toUpperCase());
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

const GENERIC_MAP_IDENTITY_TOKENS_V8 = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'en',
  'iglesia', 'catedral', 'palacio', 'museo', 'monumento', 'plaza',
  'castillo', 'teatro', 'convento', 'basilica', 'parque', 'puerta',
]);

function mapResultMatchesIdentityV8(
  result: NarrativeDiscoveryResultV7,
  stopName: string,
  cityName: string,
  identity: NarrativeStopIdentityV8
): boolean {
  const resultText = `${result.url} ${result.title} ${result.description}`;
  if (hasIdentityTermV8(resultText, stopName, identity)) return true;
  const normalizedResult = ` ${normalizeNarrativeIdentityTextV8(resultText)} `;
  const identityTexts = [
    stopName,
    identity.wikipediaTitle ?? '',
    ...identity.labels,
    ...identity.aliases,
  ];
  const cityTokens = new Set(normalizeNarrativeIdentityTextV8(cityName).split(' '));
  const distinctiveTokens = new Set(identityTexts.flatMap((text) => (
    normalizeNarrativeIdentityTextV8(text).split(' ')
  )).filter((token) => (
    token.length >= 4
    && !GENERIC_MAP_IDENTITY_TOKENS_V8.has(token)
    && !cityTokens.has(token)
  )));
  return [...distinctiveTokens].some((token) => normalizedResult.includes(` ${token} `));
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
  priorityRoles?: NarrativeRoleV8[];
  narrationTarget?: NarrativeNarrationTargetV8;
}): NarrativeCuratorPacketV8 {
  const budget = NARRATIVE_RESEARCH_BUDGET_V8;
  const defaultTarget: NarrativeNarrationTargetV8 = {
    stopId: input.stopId,
    targetSeconds: 180,
    targetWords: 420,
    minPropositions: 6,
    maxPropositions: 10,
    minVisualAnchors: 2,
  };
  const target = input.narrationTarget ?? defaultTarget;
  const dynamicMaxSpans = target.targetEvidenceCards === undefined
    ? Math.min(64, Math.max(budget.packetMaxSpans, target.maxPropositions * 4))
    : Math.min(80, Math.max(budget.packetMaxSpans, target.targetEvidenceCards * 6));
  const dynamicMaxCharacters = target.targetEvidenceCards === undefined
    ? Math.min(45_000, Math.max(budget.packetMaxCharacters, target.targetWords * 50))
    : Math.min(60_000, Math.max(budget.packetMaxCharacters, target.targetEvidenceCards * 3_500));
  const nameTerms = [input.stopName, ...input.aliases].map(normalizeNarrativeIdentityTextV8);
  const candidates: Array<{
    span: NarrativeEvidenceSpanV7;
    source: NarrativeCapturedSourceV8;
    score: number;
    positionBand: 0 | 1 | 2;
  }> = [];
  let filteredSpanCount = 0;
  for (const capture of input.captures) {
    const spans = input.spansBySource.get(capture.sourceId) ?? [];
    const totalSpans = spans.length;
    spans.forEach((span, index) => {
      if (!usefulCuratorPacketProseV8(span.text)) {
        filteredSpanCount += 1;
        return;
      }
      if (/\$\{[^}]*\}/u.test(span.text)) {
        filteredSpanCount += 1;
        return;
      }
      const normalized = normalizeNarrativeIdentityTextV8(span.text);
      const nameScore = nameTerms.some((term) => term.length > 0 && normalized.includes(term)) ? 4 : 0;
      const authorityScore = capture.authority.tier === 'primary_authority'
        ? 3 : capture.authority.tier === 'established_source' ? 2 : 1;
      const positionBand: 0 | 1 | 2 = totalSpans <= 1 ? 0 : index < Math.ceil(totalSpans / 3) ? 0 : index < Math.ceil((totalSpans * 2) / 3) ? 1 : 2;
      candidates.push({
        span,
        source: capture,
        score: nameScore + authorityScore + (index === 0 ? 1 : 0),
        positionBand,
      });
    });
  }
  candidates.sort((left, right) => (
    right.score - left.score
    || left.source.finalUrl.localeCompare(right.source.finalUrl)
    || left.span.start - right.span.start
  ));
  const reservedByPublisherBand = new Map<string, number>();
  const reservedByPublisher = new Map<string, number>();
  const tier = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidate.source.authority.publisherKey;
    const bandKey = `${key}:${candidate.positionBand}`;
    const bandReserved = reservedByPublisherBand.get(bandKey) ?? 0;
    const publisherReserved = reservedByPublisher.get(key) ?? 0;
    if (bandReserved < 1) {
      tier.set(candidate.span.evidenceSpanId, 0);
      reservedByPublisherBand.set(bandKey, bandReserved + 1);
      reservedByPublisher.set(key, publisherReserved + 1);
    } else if (publisherReserved < 3) {
      tier.set(candidate.span.evidenceSpanId, 1);
      reservedByPublisher.set(key, publisherReserved + 1);
    } else {
      tier.set(candidate.span.evidenceSpanId, 2);
    }
  }
  candidates.sort((left, right) => (
    (tier.get(left.span.evidenceSpanId) ?? 2) - (tier.get(right.span.evidenceSpanId) ?? 2)
    || right.score - left.score
    || left.source.finalUrl.localeCompare(right.source.finalUrl)
    || left.span.start - right.span.start
  ));
  const spans: Array<NarrativeEvidenceSpanV7 & { sourceUrl: string; publisherKey: string }> = [];
  let characters = 0;
  let excludedSpanCount = 0;
  for (const candidate of candidates) {
    if (spans.length >= dynamicMaxSpans) break;
    if (characters + candidate.span.text.length > dynamicMaxCharacters) break;
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
    priorityRoles: input.priorityRoles ?? [],
    narrationTarget: target,
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
      description: capture.content.slice(0, 8_000),
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
  let searchQueryAttempts = 0;
  let searchQuerySuccesses = 0;
  let mapAttempts = 0;
  let mapSuccesses = 0;
  let webCaptureAttempts = 0;
  let webCaptureResponses = 0;
  let infrastructureFailureCount = 0;
  let curationCount = 0;
  type ResearchRoundV8 = {
    dossier: NarrativeDossierV6;
    gates: NarrativeEvidenceGatesV8;
    tier: NarrativeEvidenceTierV8;
  };
  const state: {
    round: ResearchRoundV8 | null;
    failure: string | null;
    lastValidCaptureCount: number;
  } = { round: null, failure: null, lastValidCaptureCount: 0 };

  const publisherCount = (): number => (
    new Set(captures.map((capture) => capture.authority.publisherKey)).size
  );

  const recordAttempt = (entry: Omit<NarrativeCaptureAttemptV8, 'stopId' | 'attempt' | 'elapsedMs'>): void => {
    captureLog.push({ ...entry, stopId: input.stopId, attempt: attemptedUrls.size, elapsedMs: 0 });
  };

  const stats = (): NarrativeResearchStopStatsV8 => ({
    searchQueries: searchQueryAttempts,
    searchQueryAttempts,
    searchQuerySuccesses,
    mapAttempts,
    mapSuccesses,
    webCaptureAttempts,
    webCaptureResponses,
    infrastructureFailureCount,
    mappedUrlCount: mappedUrls.size,
    attemptedUrlCount: attemptedUrls.size,
    capturedSourceCount: captures.length,
    publisherCount: publisherCount(),
    curationCount,
  });

  const recordInfrastructureFailure = (error: unknown): void => {
    if (!isInfrastructureFailureV8(error)) return;
    infrastructureFailureCount += 1;
  };

  const externalInfrastructureUnavailable = (): boolean => {
    const hasOnlyWikimediaEvidence = captures.every((capture) => (
      capture.sourceKind === 'wikipedia_api' || capture.authority.publisherKey === 'wikimedia'
    ));
    if (!hasOnlyWikimediaEvidence) return false;
    return infrastructureFailureCount > 0;
  };

  const addCapturedSource = (captured: NarrativeCapturedSourceV8): boolean => {
    const attemptKey = canonicalAttemptUrlV8(captured.requestedUrl);
    if (!attemptedUrls.has(attemptKey)) attemptedUrls.add(attemptKey);
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
    const attemptKey = canonicalAttemptUrlV8(url);
    if (attemptedUrls.has(attemptKey)) return;
    attemptedUrls.add(attemptKey);
    if (attemptedUrls.size > budget.captures) return;
    const target = attemptKey;
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
      webCaptureAttempts += 1;
      const captured = await services.captureWeb({ url: target, requestClass: phase === 'p856' ? 'place_exact' : 'discovered_secondary' });
      webCaptureResponses += 1;
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
      const accepted = addCapturedSource(asV8);
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
      const httpStatus = errorHttpStatusV8(error);
      if (httpStatus !== null) webCaptureResponses += 1;
      recordInfrastructureFailure(error);
      captureLog.push({
        stopId: input.stopId,
        phase,
        requestedUrl: url,
        finalUrl: url,
        authorityBeforeCapture: 'registered',
        authorityAfterCapture: 'error',
        publisherKey: null,
        outcome: 'capture_failed',
        httpStatus,
        errorClassification: errorCodeV8(error),
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - startedAt,
      });
    }
  };

  const roundRichnessReady = (round: ResearchRoundV8): boolean => {
    if (input.narrationTarget === undefined) return true;
    const profile = evaluateNarrativeRichnessV8(round.dossier, input.narrationTarget, { writerReady: round.gates.writerReady });
    return profile.richnessReady;
  };

  const roundQuality = (round: ResearchRoundV8): [number, number, number, number, number, number] => {
    const tierRank: Record<NarrativeEvidenceTierV8, number> = { D: 0, C: 1, B: 2, A: 3 };
    const roles = round.dossier.propositions.map((proposition) => proposition.role);
    const richnessReady = roundRichnessReady(round);
    return [
      round.gates.minimumEvidenceReady ? 1 : 0,
      round.gates.writerReady ? 1 : 0,
      richnessReady ? 1 : 0,
      roles.length,
      -round.gates.missingWriterRoles.length,
      tierRank[round.tier],
    ];
  };

  const isBetterRound = (candidate: ResearchRoundV8, current: ResearchRoundV8): boolean => {
    const candidateQuality = roundQuality(candidate);
    const currentQuality = roundQuality(current);
    for (let index = 0; index < candidateQuality.length; index += 1) {
      if (candidateQuality[index] !== currentQuality[index]) {
        return candidateQuality[index] > currentQuality[index];
      }
    }
    return false;
  };

  const computeRepairPriorityRoles = (): NarrativeRoleV8[] => {
    const roles = [...(state.round?.gates.missingWriterRoles ?? [])];
    if (state.round && input.narrationTarget) {
      const visualCount = state.round.dossier.propositions
        .filter((proposition) => proposition.role === 'visible_observation' || proposition.role === 'distinctive_trait')
        .length;
      if (visualCount < input.narrationTarget.minVisualAnchors) {
        if (!roles.includes('visible_observation')) roles.push('visible_observation');
        if (!roles.includes('distinctive_trait')) roles.push('distinctive_trait');
      }
    }
    return roles;
  };

  const curate = async (): Promise<
    | { ok: true; dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8; tier: NarrativeEvidenceTierV8 }
    | { ok: false; failure: string }
  > => {
    if (curationCount >= 2) return { ok: false, failure: 'curation budget exhausted' };
    curationCount += 1;
    const curated = await curateRoundV8(
      input,
      services,
      captures,
      spansBySource,
      identity,
      registry,
      computeRepairPriorityRoles()
    );
    if (curated && 'dossier' in curated) {
      const tier = classifyEvidenceTierV8(curated.dossier, curated.gates, captures);
      const candidate = { ...curated, tier };
      if (state.round === null || isBetterRound(candidate, state.round)) {
        state.round = candidate;
      }
      state.failure = null;
      state.lastValidCaptureCount = captures.length;
      return {
        ok: true,
        dossier: state.round.dossier,
        gates: state.round.gates,
        tier: state.round.tier,
      };
    }
    if (curated) {
      const failure = (curated as { failure: string }).failure;
      if (state.round === null) state.failure = failure;
      return { ok: false, failure };
    }
    return { ok: false, failure: 'curation failed' };
  };

  const sufficient = (round: ResearchRoundV8, tier: Exclude<NarrativeEvidenceTierV8, 'D'>): NarrativeResearchStopResultV8 => {
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
      stats: stats(),
    };
  };

  // Semilla: Wikipedia por API y URLs P856 exactas.
  if (identity.wikipediaTitle) {
    const wikipediaStartedAt = Date.now();
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
          elapsedMs: Date.now() - wikipediaStartedAt,
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
        elapsedMs: Date.now() - wikipediaStartedAt,
      });
    }
  }
  for (const authority of registry.authorities) {
    if (attemptedUrls.size >= budget.captures) break;
    if (authority.origin !== 'place_p856' || !authority.url) continue;
    await attemptWebCapture(authority.url, 'p856');
  }

  // Primera curación (ronda 1) con al menos una captura aceptada.
  if (captures.length >= 1) {
    const result = await curate();
    if (result.ok && (result.tier === 'A' || result.tier === 'B')) {
      const richnessReady = roundRichnessReady(state.round!);
      if (state.round!.gates.writerReady && richnessReady) {
        return sufficient(state.round!, result.tier);
      }
    }
  }

  // Descubrimiento: reunir resultados, deduplicar, priorizar y capturar.
  const authorityOriginRank: Record<string, number> = {
    place_p856: 0,
    city_p856: 1,
    admin_level_1: 2,
    admin_level_2: 3,
    admin_level_3: 4,
  };
  const officialDomains = [...registry.authorities]
    .sort((left, right) => (
      (authorityOriginRank[left.origin] ?? 50) - (authorityOriginRank[right.origin] ?? 50)
      || left.domain.localeCompare(right.domain)
    ))
    .map((authority) => authority.domain)
    .filter((domain, index, domains) => domains.indexOf(domain) === index);
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
  const corroboratedDomains = [...wikimediaExternalDomains].sort();
  const targetedDomains = [...officialDomains, ...corroboratedDomains]
    .filter((domain, index, domains) => domains.indexOf(domain) === index)
    .slice(0, 2);
  const deterministicQueries = [
    ...targetedDomains.map((domain) => `site:${domain} ${searchName}${citySuffix}`),
    `${searchName}${citySuffix} historia transformación`,
    `${searchName}${citySuffix} arquitectura función uso`,
  ];
  const cappedDeterministicQueries = deterministicQueries.slice(0, budget.deterministicQueries);
  for (const query of cappedDeterministicQueries) {
    if (attemptedUrls.size >= budget.captures) break;
    searchQueryAttempts += 1;
    usedQueries.push(query);
    const queriedDomain = targetedDomains.find((domain) => (
      query === `site:${domain} ${searchName}${citySuffix}`
    )) ?? null;
    const isCorroboratedSiteQuery = queriedDomain !== null
      && wikimediaExternalDomains.has(queriedDomain);
    const resultLimit = isCorroboratedSiteQuery ? 10 : 5;
    let results: NarrativeDiscoveryResultV7[] = [];
    const searchStartedAt = Date.now();
    try {
      results = await services.search({
        query,
        language: input.language,
        countryCode: input.countryCode,
        limit: resultLimit,
      });
      searchQuerySuccesses += 1;
      captureLog.push({
        stopId: input.stopId,
        phase: 'deterministic_search',
        requestedUrl: query,
        finalUrl: '',
        authorityBeforeCapture: 'search',
        authorityAfterCapture: 'search',
        publisherKey: null,
        outcome: 'discovered',
        httpStatus: null,
        errorClassification: null,
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - searchStartedAt,
      });
    } catch (error) {
      recordInfrastructureFailure(error);
      captureLog.push({
        stopId: input.stopId,
        phase: 'deterministic_search',
        requestedUrl: query,
        finalUrl: '',
        authorityBeforeCapture: 'search_error',
        authorityAfterCapture: 'search_error',
        publisherKey: null,
        outcome: 'provider_failed',
        httpStatus: errorHttpStatusV8(error),
        errorClassification: errorCodeV8(error),
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - searchStartedAt,
      });
    }
    for (const result of results.slice(0, resultLimit)) {
      const url = normalizeUrlV8(result.url);
      if (!gatheredUrls.has(url)) {
        gatheredUrls.add(url);
        let priority = authorityPriorityV8(url, registry);
        if (isCorroboratedSiteQuery && queriedDomain !== null) {
          try {
            const hostname = new URL(url).hostname.toLowerCase();
            const domain = normalizeDomainV8(hostname);
            if (domain === queriedDomain) priority = -1;
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
    mapAttempts += 1;
    const mapStartedAt = Date.now();
    try {
      mapped = await services.mapOfficialSite({
        origin: domain,
        search: [input.stopName, input.cityName, ...identity.aliases].slice(0, 3).join(' '),
        limit: 20,
        language: input.language,
        countryCode: input.countryCode,
      });
      mapSuccesses += 1;
      captureLog.push({
        stopId: input.stopId,
        phase: 'map',
        requestedUrl: domain,
        finalUrl: '',
        authorityBeforeCapture: 'map',
        authorityAfterCapture: 'map',
        publisherKey: domain,
        outcome: 'discovered',
        httpStatus: null,
        errorClassification: null,
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - mapStartedAt,
      });
    } catch (error) {
      recordInfrastructureFailure(error);
      captureLog.push({
        stopId: input.stopId,
        phase: 'map',
        requestedUrl: domain,
        finalUrl: '',
        authorityBeforeCapture: 'map_error',
        authorityAfterCapture: 'map_error',
        publisherKey: null,
        outcome: 'provider_failed',
        httpStatus: errorHttpStatusV8(error),
        errorClassification: errorCodeV8(error),
        attempt: attemptedUrls.size,
        elapsedMs: Date.now() - mapStartedAt,
      });
    }
    for (const result of mapped.slice(0, 5)) {
      const url = normalizeUrlV8(result.url);
      if (!mapResultMatchesIdentityV8(result, input.stopName, input.cityName, identity)) {
        recordAttempt({
          phase: 'map',
          requestedUrl: url,
          finalUrl: url,
          authorityBeforeCapture: 'registered',
          authorityAfterCapture: 'discovery_only',
          publisherKey: result.authority.publisherKey,
          outcome: 'skipped_discovery_only',
          httpStatus: null,
          errorClassification: 'identity_mismatch',
        });
        continue;
      }
      if (mappedUrls.size < budget.captures) mappedUrls.add(url);
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



  // Ronda adaptativa: solo si falta writerReady o richness readiness y queda presupuesto.
  const richnessReadyAfterFirst = state.round !== null
    ? roundRichnessReady(state.round)
    : false;
  const needsSemanticDiscovery = state.round === null
    || !state.round.gates.writerReady
    || !richnessReadyAfterFirst;
  if (
    needsSemanticDiscovery
    && attemptedUrls.size < budget.captures
    && services.proposeAdaptiveQueries
  ) {
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
      searchQueryAttempts += 1;
      let results: NarrativeDiscoveryResultV7[] = [];
      const searchStartedAt = Date.now();
      try {
        results = await services.search({
          query,
          language: input.language,
          countryCode: input.countryCode,
          limit: 5,
        });
        searchQuerySuccesses += 1;
        captureLog.push({
          stopId: input.stopId,
          phase: 'adaptive_search',
          requestedUrl: query,
          finalUrl: '',
          authorityBeforeCapture: 'search',
          authorityAfterCapture: 'search',
          publisherKey: null,
          outcome: 'discovered',
          httpStatus: null,
          errorClassification: null,
          attempt: attemptedUrls.size,
          elapsedMs: Date.now() - searchStartedAt,
        });
      } catch (error) {
        recordInfrastructureFailure(error);
        captureLog.push({
          stopId: input.stopId,
          phase: 'adaptive_search',
          requestedUrl: query,
          finalUrl: '',
          authorityBeforeCapture: 'search_error',
          authorityAfterCapture: 'search_error',
          publisherKey: null,
          outcome: 'provider_failed',
          httpStatus: errorHttpStatusV8(error),
          errorClassification: errorCodeV8(error),
          attempt: attemptedUrls.size,
          elapsedMs: Date.now() - searchStartedAt,
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

  if (externalInfrastructureUnavailable()) {
    return {
      status: 'failed',
      stopId: input.stopId,
      failure: {
        code: 'research_infrastructure_unavailable',
        message: 'External acquisition providers were unavailable; the evidence tier was not evaluated after a completed search.',
      },
      evidenceTier: null,
      routeEligible: false,
      captures,
      captureLog,
      authorities: registry.authorities.map((authority) => ({
        qid: authority.qid,
        origin: authority.origin,
        domain: authority.domain,
        url: authority.url,
      })),
      stats: stats(),
    };
  }

  // CURATE #2 también repara roles ausentes con los mismos spans validados.
  const needsRoleRepair = state.round !== null && !state.round.gates.writerReady;
  const richnessReadyBeforeSecond = state.round !== null
    ? roundRichnessReady(state.round)
    : false;
  const shouldCurate2 = curationCount < 2
    && captures.length > 0
    && (
      captures.length > state.lastValidCaptureCount
      || state.round === null
      || needsRoleRepair
      || !richnessReadyBeforeSecond
    );
  if (shouldCurate2) {
    const result = await curate();
    if (result.ok && (result.tier === 'A' || result.tier === 'B' || result.tier === 'C')) {
      const richnessReadyAfterSecond = roundRichnessReady(state.round!);
      if (richnessReadyAfterSecond) {
        return sufficient(state.round!, result.tier);
      }
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
    const roles = state.round.dossier.propositions.map((proposition) => proposition.role);
    const richnessProfile = input.narrationTarget
      ? evaluateNarrativeRichnessV8(state.round.dossier, input.narrationTarget, { writerReady: state.round.gates.writerReady })
      : null;
    const richnessReady = richnessProfile ? richnessProfile.richnessReady : true;
    if (evidenceTier !== 'D' && (input.narrationTarget === undefined || state.round.gates.writerReady)) {
      return sufficient(state.round, evidenceTier);
    }
    if (evidenceTier === 'D') {
      reasons.push('evidence tier D: minimum evidence not ready');
    }
    if (!richnessReady) {
      const visualCount = roles.filter((role) => role === 'visible_observation' || role === 'distinctive_trait').length;
      const requiredPropositions = input.narrationTarget?.minPropositions ?? 0;
      const requiredVisual = input.narrationTarget?.minVisualAnchors ?? 0;
      const profileMetrics = richnessProfile
        ? `supported cards ${richnessProfile.supportedCardCount}, distinct passages ${richnessProfile.distinctPassageCount}, facets ${richnessProfile.facetCount}, visual cards ${richnessProfile.visualCardCount}, max supported seconds ${richnessProfile.maximumSupportedSeconds}`
        : '';
      const profileReasons = richnessProfile && richnessProfile.reasons.length > 0
        ? ` [${richnessProfile.reasons.join(', ')}]`
        : '';
      reasons.push(`narrative richness not met: current propositions ${roles.length}/${requiredPropositions}, visual anchors ${visualCount}/${requiredVisual}${profileMetrics ? `, ${profileMetrics}` : ''}${profileReasons}`);
    }
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
    evidenceTier: evidenceTier === 'D' ? 'D' : null,
    routeEligible: false,
    captures,
    captureLog,
    authorities: registry.authorities.map((authority) => ({
      qid: authority.qid,
      origin: authority.origin,
      domain: authority.domain,
      url: authority.url,
    })),
    stats: stats(),
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
  registry: NarrativeAuthorityRegistryV7,
  priorityRoles: NarrativeRoleV8[]
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
    priorityRoles,
    narrationTarget: input.narrationTarget,
  });
  if (packet.spans.length === 0) return { failure: 'no spans in the curator packet' };
  let output: NarrativeCuratorOutputV8;
  try {
    output = await services.curate(packet);
  } catch (error) {
    return { failure: `curator threw: ${error instanceof Error ? error.message : String(error)}` };
  }
  const normalized = normalizeNarrativeCuratorOutputV8({
    output,
    captures,
    spansBySource,
    authorizedIdentityNames: [...identity.labels, ...identity.aliases],
  });
  const dossierInput: NarrativeDossierInputV8 = {
    stopId: input.stopId,
    stopName: input.stopName,
    qid: input.stopId,
    language: input.language,
    curatorOutput: normalized.output,
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
