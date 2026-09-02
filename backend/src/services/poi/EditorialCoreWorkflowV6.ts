import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  buildCoreAuditRequestV6,
  CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6,
  CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6,
  CoreAuditRequestV6,
  coreAuditOpenRouterResponseSchemaV6,
  coreAuditResponseSchemaV6,
  CoreAuditV6,
  CoreBuildResultV6,
  CORE_RESOLVER_SYSTEM_PROMPT_V6,
  resolveCanonicalTourCoreV6,
  validateCoreAuditV6,
} from './EditorialCoreResolverV6';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';
import {
  EditorialCallResultV6,
  EditorialPostV6,
  EditorialProviderV6,
  EditorialRequestOptionsV6,
  editorialPromptFingerprintV6,
  editorialResponseFingerprintV6,
  requestEditorialStructuredV6,
} from './EditorialStructuredLlmV6';

export const CORE_RESOLUTION_SNAPSHOT_SCHEMA_VERSION_V6 = 'core-resolution-snapshot-v1' as const;
export const CORE_AUDIT_PERMUTATION_SEEDS_V6 = [
  'canonical-core-seed-a', 'canonical-core-seed-b', 'canonical-core-seed-c',
] as const;
const CORE_AUDIT_TOOL_NAME_V6 = 'submit_canonical_core_audit_v6';

export interface CoreResolutionContextV6 {
  cityKey: string;
  theme: string;
  durationMinutes: number;
}

export interface CoreResolutionSnapshotV6 {
  schemaVersion: typeof CORE_RESOLUTION_SNAPSHOT_SCHEMA_VERSION_V6;
  createdAt: string;
  provider: EditorialProviderV6;
  sourceFingerprint: string;
  candidatePermutationSeeds: string[];
  runs: Array<EditorialCallResultV6<CoreAuditV6>>;
  coreResult: CoreBuildResultV6 | null;
}

export interface CoreResolutionWorkflowResultV6 {
  status: 'approved' | 'core_review_required';
  coreResult: CoreBuildResultV6 | null;
  snapshot: CoreResolutionSnapshotV6;
  reason: string | null;
}

interface CoreResolutionOptionsV6 extends EditorialRequestOptionsV6 {
  createdAt?: string;
  candidatePermutationSeeds?: string[];
}

function snapshotResult(
  status: CoreResolutionWorkflowResultV6['status'],
  provider: EditorialProviderV6,
  sourceFingerprint: string,
  seeds: string[],
  runs: Array<EditorialCallResultV6<CoreAuditV6>>,
  coreResult: CoreBuildResultV6 | null,
  reason: string | null,
  createdAt: string
): CoreResolutionWorkflowResultV6 {
  return {
    status, coreResult, reason,
    snapshot: {
      schemaVersion: CORE_RESOLUTION_SNAPSHOT_SCHEMA_VERSION_V6,
      createdAt, provider, sourceFingerprint,
      candidatePermutationSeeds: [...seeds], runs, coreResult,
    },
  };
}

function requestAudit(
  request: CoreAuditRequestV6,
  provider: EditorialProviderV6,
  options: EditorialRequestOptionsV6
): Promise<EditorialCallResultV6<CoreAuditV6>> {
  return requestEditorialStructuredV6({
    callId: `core-audit:${request.candidatePermutationSeed}`,
    input: request, provider, options,
    systemPrompt: CORE_RESOLVER_SYSTEM_PROMPT_V6,
    schema: provider.kind === 'openrouter'
      ? coreAuditOpenRouterResponseSchemaV6(request)
      : coreAuditResponseSchemaV6(request),
    toolName: CORE_AUDIT_TOOL_NAME_V6,
    toolDescription: 'Classify every supplied canonical candidate exactly once as required or optional.',
    inputCharacterLimit: CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6,
    schemaCharacterLimit: CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6,
    validate: (value) => validateCoreAuditV6(value, request),
  });
}

export async function runCanonicalCoreResolutionV6(
  entities: EditorialEntityCandidateV5[],
  prominence: WikimediaProminenceSnapshotV6,
  context: CoreResolutionContextV6,
  provider: EditorialProviderV6,
  options: CoreResolutionOptionsV6 = {}
): Promise<CoreResolutionWorkflowResultV6> {
  const {
    createdAt,
    candidatePermutationSeeds,
    ...requestOptions
  } = options;
  const seeds = candidatePermutationSeeds ?? [...CORE_AUDIT_PERMUTATION_SEEDS_V6];
  if (seeds.length !== 3 || new Set(seeds).size !== 3) {
    throw new Error('Core resolution requires exactly three distinct permutation seeds');
  }
  const auditSeed = (seed: string): Promise<EditorialCallResultV6<CoreAuditV6>> => {
    const request = buildCoreAuditRequestV6(context, entities, prominence, seed);
    return requestAudit(request, provider, requestOptions);
  };
  let runs: Array<EditorialCallResultV6<CoreAuditV6>>;
  if (provider.kind === 'deepseek') {
    // The three permutations are independent, and DeepSeek explicitly supports concurrent calls.
    runs = await Promise.all(seeds.map(auditSeed));
  } else {
    runs = [];
    for (const seed of seeds) runs.push(await auditSeed(seed));
  }
  for (const [index, call] of runs.entries()) {
    if (!call.value) {
      const error = call.attempts.at(-1)?.error ?? call.status;
      return snapshotResult(
        'core_review_required', provider, prominence.fingerprint, seeds, runs, null,
        `Core audit ${seeds[index]} failed closed with ${call.status}: ${error}`,
        createdAt ?? new Date().toISOString()
      );
    }
  }
  if (new Set(runs.map((run) => run.promptFingerprint)).size !== 1) {
    throw new Error('Core audit prompt fingerprint changed between permutations');
  }
  const coreResult = resolveCanonicalTourCoreV6({
    context,
    sourceFingerprint: prominence.fingerprint,
    provider: provider.kind,
    model: provider.model,
    promptFingerprint: runs[0].promptFingerprint,
    runs: runs.map((run, index) => ({
      seed: seeds[index],
      request: run.input as CoreAuditRequestV6,
      response: run.value as CoreAuditV6,
      responseFingerprint: run.responseFingerprint as string,
    })),
  });
  return snapshotResult(
    coreResult.status, provider, prominence.fingerprint, seeds, runs, coreResult,
    coreResult.status === 'approved' ? null : coreResult.reason,
    createdAt ?? new Date().toISOString()
  );
}

function replayCall(
  saved: EditorialCallResultV6<CoreAuditV6>,
  request: CoreAuditRequestV6,
  provider: EditorialProviderV6
): EditorialCallResultV6<CoreAuditV6> {
  if (saved.status !== 'valid' || !saved.rawOutput || !saved.responseFingerprint) {
    throw new Error(`Snapshot ${saved.callId} has no valid raw response`);
  }
  if (saved.model !== provider.model || JSON.stringify(saved.input) !== JSON.stringify(request)) {
    throw new Error(`Snapshot ${saved.callId} input or model changed`);
  }
  const schema = coreAuditResponseSchemaV6(request);
  const promptFingerprint = editorialPromptFingerprintV6(
    CORE_RESOLVER_SYSTEM_PROMPT_V6, CORE_AUDIT_TOOL_NAME_V6, schema
  );
  if (saved.promptFingerprint !== promptFingerprint
    || saved.responseFingerprint !== editorialResponseFingerprintV6(saved.rawOutput)
    || saved.inputCharacters !== JSON.stringify(request).length
    || saved.schemaCharacters !== JSON.stringify(schema).length) {
    throw new Error(`Snapshot ${saved.callId} fingerprints or budgets changed`);
  }
  const value = validateCoreAuditV6(JSON.parse(saved.rawOutput), request);
  return { ...saved, value };
}

export function replayCanonicalCoreResolutionV6(
  entities: EditorialEntityCandidateV5[],
  prominence: WikimediaProminenceSnapshotV6,
  context: CoreResolutionContextV6,
  saved: CoreResolutionSnapshotV6
): CoreResolutionWorkflowResultV6 {
  if (saved.schemaVersion !== CORE_RESOLUTION_SNAPSHOT_SCHEMA_VERSION_V6
    || saved.sourceFingerprint !== prominence.fingerprint
    || saved.candidatePermutationSeeds.length !== 3 || saved.runs.length !== 3) {
    throw new Error('Canonical core snapshot context or run count changed');
  }
  const runs = saved.candidatePermutationSeeds.map((seed, index) => {
    const request = buildCoreAuditRequestV6(context, entities, prominence, seed);
    return replayCall(saved.runs[index], request, saved.provider);
  });
  if (new Set(runs.map((run) => run.promptFingerprint)).size !== 1) {
    throw new Error('Canonical core replay prompt changed between permutations');
  }
  const coreResult = resolveCanonicalTourCoreV6({
    context,
    sourceFingerprint: prominence.fingerprint,
    provider: saved.provider.kind,
    model: saved.provider.model,
    promptFingerprint: runs[0].promptFingerprint,
    runs: runs.map((run, index) => ({
      seed: saved.candidatePermutationSeeds[index],
      request: run.input as CoreAuditRequestV6,
      response: run.value as CoreAuditV6,
      responseFingerprint: run.responseFingerprint as string,
    })),
  });
  if (JSON.stringify(coreResult) !== JSON.stringify(saved.coreResult)) {
    throw new Error('Canonical core deterministic result changed');
  }
  return snapshotResult(
    coreResult.status, saved.provider, prominence.fingerprint,
    saved.candidatePermutationSeeds, runs, coreResult,
    coreResult.status === 'approved' ? null : coreResult.reason,
    saved.createdAt
  );
}

export type { EditorialPostV6 };
