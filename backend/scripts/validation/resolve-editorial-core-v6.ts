import 'dotenv/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import {
  loadEditorialCoreInputV6,
  EditorialCoreInputContextV6,
} from '../../src/services/poi/EditorialCoreInputV6';
import {
  CoreResolutionSnapshotV6,
  replayCanonicalCoreResolutionV6,
  runCanonicalCoreResolutionV6,
} from '../../src/services/poi/EditorialCoreWorkflowV6';
import {
  captureWikimediaProminenceV6,
} from '../../src/services/poi/EditorialProminenceCaptureV6';
import {
  validateWikimediaProminenceSnapshotV6,
  WikimediaProminenceSnapshotV6,
} from '../../src/services/poi/EditorialProminenceV6';
import { EditorialProviderV6 } from '../../src/services/poi/EditorialStructuredLlmV6';
import { QWEN38_CANONICAL_CORE_PROVIDER_V6 } from '../../src/services/poi/NarrativeModelProfilesV6';

type CoreWorkbenchModeV6 = 'live' | 'snapshot';

interface EditorialCoreWorkbenchArtifactV6 {
  schemaVersion: 'editorial-core-workbench-v6';
  status: 'prominence_captured' | 'approved' | 'core_review_required' | 'failed';
  createdAt: string;
  caseId: string;
  context: EditorialCoreInputContextV6;
  provider: EditorialProviderV6;
  selectorFingerprint: string;
  candidateFingerprint: string;
  prominence: WikimediaProminenceSnapshotV6 | null;
  resolution: CoreResolutionSnapshotV6 | null;
  failure: { stage: 'input' | 'prominence' | 'audits'; message: string } | null;
}

const fixtures = join(__dirname, '..', '..', 'fixtures');

function argumentValue(flag: string): string | undefined {
  const exact = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function persist(path: string, artifact: EditorialCoreWorkbenchArtifactV6): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
}

export function editorialCoreSelectorFingerprintV6(): string {
  const hash = createHash('sha256');
  for (const relativePath of [
    '../../src/services/poi/EditorialCandidate.ts',
    '../../src/services/poi/EditorialEvidenceV5.ts',
    '../../src/services/poi/EditorialCoreInputV6.ts',
    '../../src/services/poi/EditorialProminenceV6.ts',
    '../../src/services/poi/EditorialProminenceCaptureV6.ts',
    '../../src/services/poi/EditorialCoreResolverV6.ts',
    '../../src/services/poi/EditorialStructuredLlmV6.ts',
    '../../src/services/poi/EditorialCoreWorkflowV6.ts',
    'resolve-editorial-core-v6.ts',
  ]) hash.update(readFileSync(join(__dirname, relativePath)));
  return hash.digest('hex');
}

function candidateFingerprint(
  entities: Awaited<ReturnType<typeof loadEditorialCoreInputV6>>['readyEntities']
): string {
  return createHash('sha256').update(JSON.stringify(entities.map((entity) => ({
    canonicalId: entity.canonicalId,
    siteId: entity.siteId,
    coordinates: entity.coordinates,
    evidenceIds: entity.evidenceFacts.map((fact) => fact.id),
  })))).digest('hex');
}

function contextFromArguments(): EditorialCoreInputContextV6 {
  const theme = argumentValue('--theme') ?? 'history';
  if (!['history', 'architecture', 'food', 'art'].includes(theme)) {
    throw new Error('--theme must be history, architecture, food, or art');
  }
  const durationMinutes = Number(argumentValue('--duration') ?? 120);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30) {
    throw new Error('--duration must be an integer of at least 30 minutes');
  }
  const city = argumentValue('--city') ?? 'Madrid';
  return {
    city,
    cityKey: argumentValue('--city-key') ?? city.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    theme: theme as EditorialCoreInputContextV6['theme'],
    language: argumentValue('--language') ?? 'es',
    durationMinutes,
  };
}

function providerFromArguments(): EditorialProviderV6 {
  const kind = argumentValue('--provider') ?? 'deepseek';
  if (kind !== 'deepseek' && kind !== 'ollama' && kind !== 'oneprovider' && kind !== 'openrouter') {
    throw new Error('--provider must be deepseek, ollama, oneprovider, or openrouter');
  }
  const model = argumentValue('--model') ?? (kind === 'deepseek'
    ? 'deepseek-v4-flash'
    : kind === 'ollama' ? 'qwen2.5:14b'
      : kind === 'openrouter' ? 'openai/gpt-5.4-mini' : 'claude-sonnet-4-6');
  if (kind === 'openrouter' && model === QWEN38_CANONICAL_CORE_PROVIDER_V6.model) {
    return {
      kind: 'openrouter',
      model: QWEN38_CANONICAL_CORE_PROVIDER_V6.model,
      acceptedModels: QWEN38_CANONICAL_CORE_PROVIDER_V6.acceptedModels,
    };
  }
  return { kind, model };
}

export async function runEditorialCoreWorkbenchV6(): Promise<void> {
  const mode = argumentValue('--mode') ?? 'snapshot';
  if (mode !== 'live' && mode !== 'snapshot') throw new Error('--mode must be live or snapshot');
  const context = contextFromArguments();
  const caseId = `${context.cityKey}-${context.theme}-${context.language}-${context.durationMinutes}`;
  const runId = argumentValue('--run-id') ?? new Date().toISOString().replace(/[:.]/g, '-');
  const artifactPath = argumentValue('--artifact')
    ? join(process.cwd(), argumentValue('--artifact') as string)
    : join(fixtures, 'editorial-v6', 'core', runId, `${caseId}.json`);
  const provider = providerFromArguments();
  console.log(`[editorial-core-v6] ${mode} ${caseId} ${basename(artifactPath)}`);

  let loaded: Awaited<ReturnType<typeof loadEditorialCoreInputV6>>;
  try {
    loaded = await loadEditorialCoreInputV6(context, fixtures);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (mode === 'live') persist(artifactPath, {
      schemaVersion: 'editorial-core-workbench-v6', status: 'failed',
      createdAt: new Date().toISOString(), caseId, context, provider,
      selectorFingerprint: editorialCoreSelectorFingerprintV6(), candidateFingerprint: '',
      prominence: null, resolution: null, failure: { stage: 'input', message },
    });
    throw error;
  }
  const expectedSelectorFingerprint = editorialCoreSelectorFingerprintV6();
  const expectedCandidateFingerprint = candidateFingerprint(loaded.readyEntities);

  let prominence: WikimediaProminenceSnapshotV6;
  let result: ReturnType<typeof replayCanonicalCoreResolutionV6>;
  let snapshotSelectorFingerprintMatches: boolean | null = null;
  if (mode === 'snapshot') {
    if (!existsSync(artifactPath)) throw new Error(`Missing v6 core snapshot ${artifactPath}`);
    const artifact = readJson<EditorialCoreWorkbenchArtifactV6>(artifactPath);
    if (artifact.schemaVersion !== 'editorial-core-workbench-v6'
      || !artifact.prominence || !artifact.resolution
      || artifact.candidateFingerprint !== expectedCandidateFingerprint
      || JSON.stringify(artifact.context) !== JSON.stringify(context)) {
      throw new Error('V6 core snapshot context or candidates changed');
    }
    snapshotSelectorFingerprintMatches = artifact.selectorFingerprint === expectedSelectorFingerprint;
    prominence = validateWikimediaProminenceSnapshotV6(
      artifact.prominence, loaded.readyEntities,
      { cityKey: context.cityKey, language: context.language }
    );
    result = replayCanonicalCoreResolutionV6(
      loaded.readyEntities, prominence,
      { cityKey: context.cityKey, theme: context.theme, durationMinutes: context.durationMinutes },
      artifact.resolution
    );
  } else {
    try {
      const prominenceArtifactPath = argumentValue('--prominence-artifact');
      if (prominenceArtifactPath) {
        const sourceArtifact = readJson<EditorialCoreWorkbenchArtifactV6>(
          join(process.cwd(), prominenceArtifactPath)
        );
        if (sourceArtifact.schemaVersion !== 'editorial-core-workbench-v6'
          || !sourceArtifact.prominence
          || sourceArtifact.candidateFingerprint !== expectedCandidateFingerprint
          || JSON.stringify(sourceArtifact.context) !== JSON.stringify(context)) {
          throw new Error('Prominence source artifact context or candidates changed');
        }
        prominence = validateWikimediaProminenceSnapshotV6(
          sourceArtifact.prominence, loaded.readyEntities,
          { cityKey: context.cityKey, language: context.language }
        );
      } else {
        prominence = await captureWikimediaProminenceV6({
          cityKey: context.cityKey,
          cityTitle: context.city,
          language: context.language,
          entities: loaded.readyEntities,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persist(artifactPath, {
        schemaVersion: 'editorial-core-workbench-v6', status: 'failed',
        createdAt: new Date().toISOString(), caseId, context, provider,
        selectorFingerprint: expectedSelectorFingerprint,
        candidateFingerprint: expectedCandidateFingerprint,
        prominence: null, resolution: null, failure: { stage: 'prominence', message },
      });
      throw error;
    }
    persist(artifactPath, {
      schemaVersion: 'editorial-core-workbench-v6', status: 'prominence_captured',
      createdAt: prominence.capturedAt, caseId, context, provider,
      selectorFingerprint: expectedSelectorFingerprint,
      candidateFingerprint: expectedCandidateFingerprint,
      prominence, resolution: null, failure: null,
    });
    try {
      result = await runCanonicalCoreResolutionV6(
        loaded.readyEntities, prominence,
        { cityKey: context.cityKey, theme: context.theme, durationMinutes: context.durationMinutes },
        provider,
        {
          apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
          oneProviderApiKey: process.env.ONEPROVIDER_API_KEY?.trim(),
          openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim(),
          ollamaHost: argumentValue('--ollama-host') ?? process.env.OLLAMA_HOST,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persist(artifactPath, {
        schemaVersion: 'editorial-core-workbench-v6', status: 'failed',
        createdAt: prominence.capturedAt, caseId, context, provider,
        selectorFingerprint: expectedSelectorFingerprint,
        candidateFingerprint: expectedCandidateFingerprint,
        prominence, resolution: null, failure: { stage: 'audits', message },
      });
      throw error;
    }
    persist(artifactPath, {
      schemaVersion: 'editorial-core-workbench-v6',
      status: result.status,
      createdAt: result.snapshot.createdAt,
      caseId, context, provider,
      selectorFingerprint: expectedSelectorFingerprint,
      candidateFingerprint: expectedCandidateFingerprint,
      prominence, resolution: result.snapshot,
      failure: result.status === 'approved' ? null : {
        stage: 'audits', message: result.reason ?? 'core_review_required',
      },
    });
  }
  const summary = {
    caseId,
    mode: mode as CoreWorkbenchModeV6,
    artifact: artifactPath,
    provider: result.snapshot.provider,
    candidateCount: loaded.readyEntities.length,
    sourceFingerprint: prominence.fingerprint,
    snapshotSelectorFingerprintMatches,
    inputCharacters: result.snapshot.runs.map((run) => run.inputCharacters),
    schemaCharacters: result.snapshot.runs.map((run) => run.schemaCharacters),
    latenciesMs: result.snapshot.runs.map((run) => (
      run.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0)
    )),
    requiredSets: result.snapshot.runs.map((run) => (
      run.value?.classifications.filter((item) => item.classification === 'required')
        .map((item) => item.canonicalId).sort() ?? []
    )),
    status: result.status,
    reason: result.reason,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (result.status !== 'approved') process.exitCode = 1;
}

if (require.main === module) {
  runEditorialCoreWorkbenchV6().catch((error) => {
    console.error('[resolve-editorial-core-v6] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
