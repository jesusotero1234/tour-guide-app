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
  cityQid: string;
  countryCode: string;
  language: string;
  required: boolean;
}

export interface NarrativeCuratorPacketV8 {
  stopId: string;
  stopName: string;
  language: string;
  spans: Array<NarrativeEvidenceSpanV7 & { sourceUrl: string }>;
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
  }
  | {
    status: 'evidence_review_required';
    stopId: string;
    gates: NarrativeEvidenceGatesV8;
    dossier: NarrativeDossierV6 | null;
    stats: NarrativeResearchStopStatsV8;
    captures: NarrativeCapturedSourceV8[];
    reasons: string[];
  }
  | {
    status: 'failed';
    stopId: string;
    failure: { code: string; message: string };
    stats: NarrativeResearchStopStatsV8;
    captures: NarrativeCapturedSourceV8[];
  };

export interface NarrativeResearchStopStatsV8 {
  searchQueries: number;
  mappedUrlCount: number;
  attemptedUrlCount: number;
  capturedSourceCount: number;
  publisherCount: number;
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
  const spans: Array<NarrativeEvidenceSpanV7 & { sourceUrl: string }> = [];
  let characters = 0;
  let excludedSpanCount = 0;
  for (const candidate of candidates) {
    if (spans.length >= budget.packetMaxSpans) break;
    if (characters + candidate.span.text.length > budget.packetMaxCharacters) break;
    spans.push({ ...candidate.span, sourceUrl: candidate.source.finalUrl });
    characters += candidate.span.text.length;
  }
  excludedSpanCount = candidates.length - spans.length;
  return {
    stopId: input.stopId,
    stopName: input.stopName,
    language: input.language,
    spans,
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
      description: '',
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
  let searchQueries = 0;
  const state: {
    round: { dossier: NarrativeDossierV6; gates: NarrativeEvidenceGatesV8 } | null;
    failure: string | null;
  } = { round: null, failure: null };

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

  if (identity.wikipediaTitle) {
    const wikipedia = await services.captureWikipedia({
      title: identity.wikipediaTitle,
      language: input.language,
      expectedQid: input.stopId,
    });
    if (wikipedia) addCapturedSource(wikipedia);
  }

  const attemptWebCapture = async (url: string): Promise<void> => {
    if (attemptedUrls.has(url)) return;
    attemptedUrls.add(url);
    try {
      const captured = await services.captureWeb({ url });
      addCapturedSource(classifyWebCaptureV8(captured, registry, input.stopName));
    } catch {
      // A capture failure (e.g. 403) counts as an attempt and is not retried.
    }
  };

  // Captura semilla: URLs P856 exactas (lugar, ciudad y ancestros con URL conservada).
  for (const authority of registry.authorities) {
    if (attemptedUrls.size >= budget.captures) break;
    if (!authority.url) continue;
    await attemptWebCapture(authority.url);
  }

  const officialDomains = registry.authorities.map((authority) => authority.domain);
  const deterministicQueries = [
    `"${input.stopName}" historia cronología`,
    `"${input.stopName}" arquitectura elementos visibles`,
    `"${input.stopName}" función uso transformación`,
    `"${input.stopName}" conflicto contraste rasgo distintivo`,
  ];

  for (const query of deterministicQueries) {
    if (attemptedUrls.size >= budget.captures) break;
    searchQueries += 1;
    usedQueries.push(query);
    const results = await services.search({
      query,
      language: input.language,
      countryCode: input.countryCode,
      limit: 5,
    });
    for (const result of results.slice(0, 5)) {
      if (attemptedUrls.size >= budget.captures) break;
      const classified = classifyAgainstRegistryV7(result, registry, input.stopName);
      await attemptWebCapture(normalizeUrlV8(classified.url));
    }
  }

  for (const domain of officialDomains.slice(0, budget.mappedDomains)) {
    if (attemptedUrls.size >= budget.captures) break;
    const mapped = await services.mapOfficialSite({
      origin: domain,
      search: [input.stopName, ...identity.aliases].slice(0, 3).join(' '),
      limit: 20,
      language: input.language,
      countryCode: input.countryCode,
    });
    for (const result of mapped.slice(0, 5)) {
      if (attemptedUrls.size >= budget.captures) break;
      if (mappedUrls.size < budget.captures) mappedUrls.add(normalizeUrlV8(result.url));
      const classified = classifyAgainstRegistryV7(result, registry, input.stopName);
      await attemptWebCapture(normalizeUrlV8(classified.url));
    }
  }

  // Ronda agregada 1: Wikipedia API + determinista + /map.
  let round = await curateRoundV8(input, services, captures, spansBySource, identity, registry);
  if (round && 'dossier' in round) {
    state.round = round;
    state.failure = null;
  } else if (round) {
    state.failure = (round as { failure: string }).failure;
  }
  if (state.round && state.round.gates.writerReady) {
    return sufficientResultV8(input, state.round.dossier, captures, {
      searchQueries,
      mappedUrlCount: mappedUrls.size,
      attemptedUrlCount: attemptedUrls.size,
    });
  }

  // Ronda adaptativa (solo si faltan roles y queda presupuesto) y curación agregada final.
  if (attemptedUrls.size < budget.captures && services.proposeAdaptiveQueries) {
    const adaptive = await services.proposeAdaptiveQueries({
      stopName: input.stopName,
      aliases: identity.aliases,
      language: input.language,
      countryCode: input.countryCode,
      officialDomains,
      usedQueries,
      missingRoles: state.round?.gates.missingWriterRoles ?? [],
    });
    for (const rawQuery of adaptive.slice(0, budget.adaptiveQueries)) {
      const query = rawQuery.trim();
      if (!query || query.length > budget.maxQueryLength) continue;
      if (usedQueries.includes(query)) continue;
      if (attemptedUrls.size >= budget.captures) break;
      usedQueries.push(query);
      searchQueries += 1;
      const results = await services.search({
        query,
        language: input.language,
        countryCode: input.countryCode,
        limit: 5,
      });
      for (const result of results.slice(0, 5)) {
        if (attemptedUrls.size >= budget.captures) break;
        await attemptWebCapture(normalizeUrlV8(result.url));
      }
    }
    if (captures.length > 0) {
      const reRound = await curateRoundV8(input, services, captures, spansBySource, identity, registry);
      if (reRound && 'dossier' in reRound) {
        state.round = reRound;
        state.failure = null;
      } else if (reRound) {
        state.failure = (reRound as { failure: string }).failure;
      }
    }
  }

  const finalGates = state.round?.gates ?? null;
  if (state.round && finalGates?.writerReady) {
    return sufficientResultV8(input, state.round.dossier, captures, {
      searchQueries,
      mappedUrlCount: mappedUrls.size,
      attemptedUrlCount: attemptedUrls.size,
    });
  }
  const reasons = state.round && finalGates
    ? [
      ...finalGates.missingWriterRoles.map((role) => `missing writer role ${role}`),
      ...(state.round.dossier.sufficiency.authoritySourceCount < 2 ? ['fewer than two authority sources'] : []),
      ...(state.round.dossier.sufficiency.independentPublisherCount < 2 ? ['fewer than two independent publishers'] : []),
    ]
    : [state.failure ?? 'no dossier could be built'];
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
    stats: {
      searchQueries,
      mappedUrlCount: mappedUrls.size,
      attemptedUrlCount: attemptedUrls.size,
      capturedSourceCount: captures.length,
      publisherCount: new Set(captures.map((capture) => capture.authority.publisherKey)).size,
    },
    reasons,
  };
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
  const output = await services.curate(packet);
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
    stats: {
      ...stats,
      capturedSourceCount: captures.length,
      publisherCount: new Set(captures.map((capture) => capture.authority.publisherKey)).size,
    },
  };
}
