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
