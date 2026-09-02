import type { EditorialProviderV6, EditorialPricingV6 } from './EditorialStructuredLlmV6';
import type { NarrativeConcurrencyV6, NarrativeModelProfileNameV6 } from './NarrativeModelProfilesV6';
import type { NarrativeWebCaptureRequestClassV8 } from './NarrativeResearchV8';
import type { NarrativeFirecrawlCaptureOptionsV7 } from './NarrativeSourcesV7';
import { NARRATIVE_MODEL_PROFILES_V6, QWEN38_CANONICAL_CORE_PROVIDER_V6 } from './NarrativeModelProfilesV6';

export interface NarrativeResearchRuntimeV8 {
  searxngBaseUrl: string;
  firecrawlBaseUrl: string;
}

export interface NarrativeEndpointFetchV8 {
  (url: string, init: { method: 'GET'; signal: AbortSignal }): Promise<unknown>;
}

export interface NarrativeEditorialScriptSetDiagnosticsV8 {
  expectedStopIds: string[];
  editorialStopIds: string[];
  scriptStopIds: string[];
  missingScriptIds: string[];
  duplicateEditorialStopIds: string[];
  duplicateScriptIds: string[];
  unknownEditorialStopIds: string[];
  unknownScriptIds: string[];
  mismatchedStopIds: string[];
}

export class ResearchInfrastructureUnavailableErrorV8 extends Error {
  readonly code = 'research_infrastructure_unavailable';

  constructor(label: string, rawUrl: string, transportCode: string) {
    super(`${label} unavailable at ${rawUrl}: ${transportCode}`);
    this.name = 'ResearchInfrastructureUnavailableErrorV8';
  }
}

export class EditorialScriptSetInvalidErrorV8 extends Error {
  readonly code = 'editorial_script_set_invalid';

  constructor(readonly diagnostics: NarrativeEditorialScriptSetDiagnosticsV8) {
    super([
      'editorial_script_set_invalid:',
      `missing=${diagnostics.missingScriptIds.join(',') || '-'}`,
      `duplicateEditorial=${diagnostics.duplicateEditorialStopIds.join(',') || '-'}`,
      `duplicateScripts=${diagnostics.duplicateScriptIds.join(',') || '-'}`,
      `unknownEditorial=${diagnostics.unknownEditorialStopIds.join(',') || '-'}`,
      `unknownScripts=${diagnostics.unknownScriptIds.join(',') || '-'}`,
      `mismatched=${diagnostics.mismatchedStopIds.join(',') || '-'}`,
    ].join(' | '));
    this.name = 'EditorialScriptSetInvalidErrorV8';
  }
}

export type NarrativeCanaryEditorialDispositionV8 = 'scorecard' | 'review_required' | 'failure';

export function narrativeCanaryCoreProviderV8(
  profile: NarrativeModelProfileNameV6,
  options: { provider?: string; model?: string }
): EditorialProviderV6 {
  const explicitProvider = options.provider?.trim();
  if (explicitProvider) {
    if (explicitProvider === 'deepseek') {
      return { kind: 'deepseek', model: options.model?.trim() || 'deepseek-v4-flash' };
    }
    if (explicitProvider === 'ollama') {
      return { kind: 'ollama', model: options.model?.trim() || 'qwen2.5:14b' };
    }
    if (explicitProvider === 'oneprovider') {
      return { kind: 'oneprovider', model: options.model?.trim() || 'claude-sonnet-4-6' };
    }
    throw new Error(`Allowed providers are deepseek, ollama, and oneprovider; got ${explicitProvider}`);
  }
  if (profile === 'qwen38_hybrid') {
    return { ...QWEN38_CANONICAL_CORE_PROVIDER_V6 };
  }
  const auditorA = NARRATIVE_MODEL_PROFILES_V6[profile].phases.auditor_a.provider;
  return { ...auditorA };
}

export function narrativeCanaryCoreOpenRouterOptionsV8(input: {
  provider: string;
  openRouterApiKey: string;
  pricing?: Record<string, EditorialPricingV6>;
}): { openRouterApiKey: string; pricing?: EditorialPricingV6 } {
  const pricing = input.pricing?.[input.provider];
  return {
    openRouterApiKey: input.openRouterApiKey,
    ...(pricing === undefined ? {} : { pricing }),
  };
}

export function narrativeCanaryEditorialDispositionV8(status: string): NarrativeCanaryEditorialDispositionV8 {
  if (status === 'ready_for_human_gate') return 'scorecard';
  if (status === 'draft_review_required') return 'review_required';
  return 'failure';
}

export function narrativeCanaryResearchCheckpointPhaseV8(
  routeStopCount: number,
  researchResults: Array<{ routeEligible: boolean }>
): 'route' | 'research' {
  if (researchResults.length === routeStopCount && researchResults.every((result) => result.routeEligible)) {
    return 'research';
  }
  return 'route';
}

export function narrativeCanaryFirecrawlCaptureOptionsV8(
  requestClass: NarrativeWebCaptureRequestClassV8
): NarrativeFirecrawlCaptureOptionsV7 | undefined {
  if (requestClass === 'discovered_secondary') {
    return { timeoutMs: 20_000, maxAttempts: 1 };
  }
  return undefined;
}

export function narrativeCanaryEditorialConcurrencyV8(
  stopCount: number
): Partial<NarrativeConcurrencyV6> {
  return {
    researchStops: 1,
    editorialStops: stopCount,
    writers: 1,
    auditStops: 2,
    adjudications: 2,
    globalAudits: 1,
  };
}

export function researchRuntimeV8(
  environment: NodeJS.ProcessEnv = process.env
): NarrativeResearchRuntimeV8 {
  return {
    searxngBaseUrl: environment.SEARXNG_BASE_URL?.trim() || 'http://127.0.0.1:18081',
    firecrawlBaseUrl: environment.FIRECRAWL_BASE_URL?.trim() || 'http://127.0.0.1:3007/v2',
  };
}

function transportCodeV8(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && candidate.code.trim()) return candidate.code;
    current = candidate.cause;
  }
  return 'UNREACHABLE';
}

export async function assertEndpointReachableV8(
  label: string,
  rawUrl: string,
  fetchEndpoint: NarrativeEndpointFetchV8 = globalThis.fetch as NarrativeEndpointFetchV8,
  timeoutMs = 2_500
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    await fetchEndpoint(rawUrl, { method: 'GET', signal: controller.signal });
  } catch (error) {
    throw new ResearchInfrastructureUnavailableErrorV8(
      label,
      rawUrl,
      transportCodeV8(error)
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertResearchRuntimeReachableV8(
  runtime: NarrativeResearchRuntimeV8,
  fetchEndpoint: NarrativeEndpointFetchV8 = globalThis.fetch as NarrativeEndpointFetchV8,
  timeoutMs = 2_500
): Promise<void> {
  await Promise.all([
    assertEndpointReachableV8('SearXNG', runtime.searxngBaseUrl, fetchEndpoint, timeoutMs),
    assertEndpointReachableV8('Firecrawl', runtime.firecrawlBaseUrl, fetchEndpoint, timeoutMs),
  ]);
}

function duplicateIdsV8(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function inspectEditorialScriptSetV8(
  expectedStopIds: string[],
  editorialStops: Array<{ stopId: string; finalScript: { stopId: string } }>
): NarrativeEditorialScriptSetDiagnosticsV8 {
  const expectedStopSet = new Set(expectedStopIds);
  const editorialStopIds = editorialStops.map((stop) => stop.stopId);
  const scriptStopIds = editorialStops.map((stop) => stop.finalScript.stopId);
  const scriptStopSet = new Set(scriptStopIds);
  return {
    expectedStopIds,
    editorialStopIds,
    scriptStopIds,
    missingScriptIds: expectedStopIds.filter((id) => !scriptStopSet.has(id)),
    duplicateEditorialStopIds: duplicateIdsV8(editorialStopIds),
    duplicateScriptIds: duplicateIdsV8(scriptStopIds),
    unknownEditorialStopIds: editorialStopIds.filter((id) => !expectedStopSet.has(id)),
    unknownScriptIds: scriptStopIds.filter((id) => !expectedStopSet.has(id)),
    mismatchedStopIds: editorialStops
      .filter((stop) => stop.stopId !== stop.finalScript.stopId)
      .map((stop) => `${stop.stopId}->${stop.finalScript.stopId}`),
  };
}

export function assertCompleteEditorialScriptSetV8(
  expectedStopIds: string[],
  editorialStops: Array<{ stopId: string; finalScript: { stopId: string } }>
): NarrativeEditorialScriptSetDiagnosticsV8 {
  const diagnostics = inspectEditorialScriptSetV8(expectedStopIds, editorialStops);
  if (
    diagnostics.missingScriptIds.length > 0
    || diagnostics.duplicateEditorialStopIds.length > 0
    || diagnostics.duplicateScriptIds.length > 0
    || diagnostics.unknownEditorialStopIds.length > 0
    || diagnostics.unknownScriptIds.length > 0
    || diagnostics.mismatchedStopIds.length > 0
  ) {
    throw new EditorialScriptSetInvalidErrorV8(diagnostics);
  }
  return diagnostics;
}

export function createNarrativeCanaryCaptureWebV8<T>(
  underlying: (url: string, options: NarrativeFirecrawlCaptureOptionsV7 | undefined) => Promise<T>
): (rawUrl: string, requestClass: NarrativeWebCaptureRequestClassV8) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (rawUrl, requestClass) => {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    const canonicalUrl = parsed.toString();
    const existing = cache.get(canonicalUrl);
    if (existing) return existing;
    const promise = underlying(
      canonicalUrl,
      narrativeCanaryFirecrawlCaptureOptionsV8(requestClass)
    ).catch((error: unknown) => {
      cache.delete(canonicalUrl);
      throw error;
    });
    cache.set(canonicalUrl, promise);
    return promise;
  };
}
