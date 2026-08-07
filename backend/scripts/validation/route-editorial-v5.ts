import 'dotenv/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { loadEditorialEvaluationInputV3 } from '../../src/services/poi/EditorialEvaluationInputV3';
import { loadEditorialEvaluationInputV5 } from '../../src/services/poi/EditorialEvaluationInputV5';
import {
  LoadedEditorialEvaluationCase,
  loadEditorialEvaluationCases,
} from '../../src/services/poi/EditorialEvaluationManifest';
import {
  optimizeEditorialRoutePortfolioV5,
  EditorialRoutePortfolioV5,
} from '../../src/services/poi/EditorialRoutePortfolioV5';
import {
  EDITORIAL_SELECTION_SNAPSHOT_SCHEMA_VERSION_V5,
  EditorialSelectionSnapshotV5,
  EditorialSelectionWorkflowResultV5,
  replayEditorialSelectionV5,
  runEditorialSelectionV5,
} from '../../src/services/poi/EditorialSelectionWorkflowV5';
import {
  EditorialProviderV5,
} from '../../src/services/poi/EditorialStructuredLlmV5';
import {
  captureWalkingMatrixV4,
  validateWalkingMatrixSnapshotV4,
  WalkingMatrixSnapshotV4,
} from '../../src/services/poi/EditorialWalkingMatrixV4';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';

type WorkbenchModeV5 = 'live' | 'snapshot';

interface EditorialV5Artifact {
  schemaVersion: 'route-editorial-workbench-v5';
  status: 'failed' | 'complete';
  createdAt: string;
  caseId: string;
  provider: EditorialProviderV5;
  selectorFingerprint: string;
  candidateMapping: Array<{
    canonicalId: string;
    siteId: string;
    coordinates: { lat: number; lng: number };
    evidenceIds: string[];
  }>;
  walkingMatrix: WalkingMatrixSnapshotV4 | null;
  portfolio: EditorialRoutePortfolioV5 | null;
  selection: EditorialSelectionSnapshotV5 | null;
  failure: { stage: 'walking_matrix' | 'portfolio' | 'selection'; message: string } | null;
}

interface BaselineSummaryV4 {
  results: Array<{
    case: { id: string };
    coverage?: { exactIdentityOracle?: string; greedyOracle?: string };
  }>;
}

const fixtures = join(__dirname, '..', '..', 'fixtures');
const manifestPath = join(fixtures, 'oracle', 'editorial-v2-manifest.json');
const baselineSummaryPath = join(
  fixtures, 'editorial-v4', 'editorial-v4-calibration-final2', 'summary.json'
);

function argumentValue(flag: string): string | undefined {
  const exact = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function numerator(value: string | undefined): number {
  if (!value || !/^\d+\/\d+$/.test(value)) return 0;
  return Number(value.split('/')[0]);
}

export function editorialV5SelectorFingerprint(): string {
  const hash = createHash('sha256');
  for (const relativePath of [
    '../../src/services/poi/EditorialCandidate.ts',
    '../../src/services/poi/EditorialEvidenceV5.ts',
    '../../src/services/poi/EditorialEvaluationInputV5.ts',
    '../../src/services/poi/EditorialWalkingMatrixV4.ts',
    '../../src/services/poi/EditorialRoutePortfolioV5.ts',
    '../../src/services/poi/EditorialStructuredLlmV5.ts',
    '../../src/services/poi/EditorialRouteJuryV5.ts',
    '../../src/services/poi/EditorialRouteRepairV5.ts',
    '../../src/services/poi/EditorialSelectionWorkflowV5.ts',
    'route-editorial-v5.ts',
  ]) hash.update(readFileSync(join(__dirname, relativePath)));
  return hash.digest('hex');
}

function candidateMapping(entities: Awaited<ReturnType<typeof loadEditorialEvaluationInputV5>>['readyEntities']) {
  return entities.map((entity) => ({
    canonicalId: entity.canonicalId,
    siteId: entity.siteId,
    coordinates: entity.coordinates,
    evidenceIds: entity.evidenceFacts.map((fact) => fact.id),
  }));
}

function requiredOracleCount(evaluationCase: LoadedEditorialEvaluationCase): number {
  return evaluationCase.city === 'Madrid'
    ? evaluationCase.oracle.stops.length
    : Math.ceil(evaluationCase.oracle.stops.length * 0.8);
}

async function exactGreedyCoverage(evaluationCase: LoadedEditorialEvaluationCase): Promise<number> {
  const loaded = await loadEditorialEvaluationInputV3(evaluationCase, fixtures);
  const greedy = composeWalkingRoute(loaded.readySites.map((site) => ({
    ...site,
    name: site.localName,
    importance_score: site.firstVisitScore,
    landmarkTier: site.tier === 'essential' ? 'flagship'
      : site.tier === 'strong' ? 'major' : 'supporting',
    historyPlaceScore: site.themeScore,
    wikidataId: site.canonicalId,
  })), evaluationCase.durationMinutes, evaluationCase.theme, { minStops: 5, maxStops: 8 });
  const selectedIds = new Set(greedy.route.flatMap((site) => site.entityIds));
  return evaluationCase.oracle.stops.filter((anchor) => selectedIds.has(anchor.qid)).length;
}

function baselineCoverage(caseId: string): number {
  if (!existsSync(baselineSummaryPath)) return 0;
  const baseline = readJson<BaselineSummaryV4>(baselineSummaryPath).results
    .find((item) => item.case.id === caseId);
  return numerator(baseline?.coverage?.exactIdentityOracle);
}

function portfolioSignatures(portfolio: EditorialRoutePortfolioV5): string[] {
  return portfolio.routes.map((route) => `${route.slot}:${route.candidateSlots.join('>')}`);
}

function persistArtifact(path: string, artifact: EditorialV5Artifact): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
}

async function runCase(
  evaluationCase: LoadedEditorialEvaluationCase,
  mode: WorkbenchModeV5,
  provider: EditorialProviderV5,
  artifactPath: string
): Promise<Record<string, unknown>> {
  const loaded = await loadEditorialEvaluationInputV5(evaluationCase, fixtures);
  const mapped = candidateMapping(loaded.readyEntities);
  const readyIds = new Set(loaded.readyEntities.map((entity) => entity.canonicalId));
  const candidateOracle = evaluationCase.oracle.stops.filter((anchor) => readyIds.has(anchor.qid));
  const selectorFingerprint = editorialV5SelectorFingerprint();
  const artifactBase = {
    schemaVersion: 'route-editorial-workbench-v5' as const,
    createdAt: new Date().toISOString(), caseId: evaluationCase.id, provider,
    selectorFingerprint, candidateMapping: mapped,
  };
  let walkingMatrix: WalkingMatrixSnapshotV4;
  let portfolio: EditorialRoutePortfolioV5;
  let selection: EditorialSelectionWorkflowResultV5;

  if (mode === 'snapshot') {
    if (!existsSync(artifactPath)) throw new Error(`Missing v5 snapshot ${artifactPath}`);
    const artifact = readJson<EditorialV5Artifact>(artifactPath);
    if (artifact.schemaVersion !== 'route-editorial-workbench-v5'
      || artifact.status !== 'complete' || !artifact.walkingMatrix
      || !artifact.portfolio || !artifact.selection) {
      throw new Error('V5 snapshot is incomplete');
    }
    if (artifact.selectorFingerprint !== selectorFingerprint) {
      throw new Error('V5 snapshot selector fingerprint changed');
    }
    if (JSON.stringify(artifact.candidateMapping) !== JSON.stringify(mapped)) {
      throw new Error('V5 snapshot candidate mapping changed');
    }
    walkingMatrix = validateWalkingMatrixSnapshotV4(artifact.walkingMatrix, loaded.readyEntities);
    portfolio = optimizeEditorialRoutePortfolioV5(
      loaded.readyEntities, walkingMatrix, evaluationCase.durationMinutes
    );
    if (JSON.stringify(portfolioSignatures(portfolio))
      !== JSON.stringify(portfolioSignatures(artifact.portfolio))) {
      throw new Error('V5 snapshot deterministic portfolio changed');
    }
    selection = replayEditorialSelectionV5(portfolio, walkingMatrix, {
      city: evaluationCase.city, theme: evaluationCase.theme,
      language: evaluationCase.language, requestedDuration: evaluationCase.durationMinutes,
    }, artifact.selection);
  } else {
    try {
      walkingMatrix = await captureWalkingMatrixV4(loaded.readyEntities);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persistArtifact(artifactPath, {
        ...artifactBase, status: 'failed', walkingMatrix: null, portfolio: null,
        selection: null, failure: { stage: 'walking_matrix', message },
      });
      throw error;
    }
    portfolio = optimizeEditorialRoutePortfolioV5(
      loaded.readyEntities, walkingMatrix, evaluationCase.durationMinutes
    );
    if (portfolio.routes.length < 3) {
      persistArtifact(artifactPath, {
        ...artifactBase, status: 'failed', walkingMatrix, portfolio,
        selection: null, failure: { stage: 'portfolio', message: portfolio.reason ?? portfolio.status },
      });
      throw new Error(`V5 portfolio failed: ${portfolio.reason ?? portfolio.status}`);
    }
    selection = await runEditorialSelectionV5(portfolio, walkingMatrix, {
      city: evaluationCase.city, theme: evaluationCase.theme,
      language: evaluationCase.language, requestedDuration: evaluationCase.durationMinutes,
    }, provider, {
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
      ollamaHost: process.env.OLLAMA_HOST,
    });
    persistArtifact(artifactPath, {
      ...artifactBase,
      status: selection.status === 'selected' ? 'complete' : 'failed',
      walkingMatrix, portfolio, selection: selection.snapshot,
      failure: selection.status === 'selected' ? null : {
        stage: 'selection', message: selection.reason ?? selection.status,
      },
    });
    if (selection.status !== 'selected') {
      throw new Error(`V5 selection failed: ${selection.failureStage}: ${selection.reason}`);
    }
  }

  const winner = selection.winner;
  if (!winner || !selection.initialCall?.value || !selection.finalCall?.value || !selection.repair) {
    throw new Error('V5 selection did not produce a complete grounded winner');
  }
  const selectedIds = new Set(winner.route.entities.map((entity) => entity.canonicalId));
  const routeOracle = evaluationCase.oracle.stops.filter((anchor) => selectedIds.has(anchor.qid));
  const required = requiredOracleCount(evaluationCase);
  const greedy = await exactGreedyCoverage(evaluationCase);
  const v4 = baselineCoverage(evaluationCase.id);
  const conflicts = winner.route.entities.map((entity) => entity.visitConflictGroup)
    .filter((group): group is string => Boolean(group));
  const contributions = winner.plan.stops.map((stop) => stop.uniqueContribution.toLowerCase());
  const gates = {
    candidateOracleCoverage: candidateOracle.length === evaluationCase.oracle.stops.length,
    requiredRouteOracleCoverage: routeOracle.length >= required,
    oracleNotBelowBestBaseline: routeOracle.length >= Math.max(v4, greedy),
    noPhysicallyViableNoRoute: portfolio.status !== 'no_route'
      && portfolio.status !== 'insufficient_editorial_core',
    withinRequestedDuration: portfolio.status === 'selected'
      && winner.route.metrics.estimatedTourMinutes <= evaluationCase.durationMinutes,
    noDuplicateEntities: selectedIds.size === winner.route.entities.length,
    noVisitConflicts: new Set(conflicts).size === conflicts.length,
    noOverlongSegments: winner.route.metrics.maxSegmentMeters
        <= (evaluationCase.durationMinutes <= 120 ? 1500 : 1700)
      && winner.route.metrics.maxSegmentMinutes
        <= (evaluationCase.durationMinutes <= 120 ? 20 : 23),
    validStopCount: winner.route.entities.length >= 4 && winner.route.entities.length <= 8,
    everyStopGrounded: winner.plan.stops.length === winner.route.entities.length
      && winner.plan.stops.every((stop) => stop.evidenceIds.length > 0),
    uniqueContributions: new Set(contributions).size === contributions.length,
    finalJuryAccepted: selection.finalCall.value.assessments[winner.route.slot].verdict !== 'reject',
  };
  return {
    case: {
      id: evaluationCase.id, mode, city: evaluationCase.city,
      requestedDuration: evaluationCase.durationMinutes,
    },
    reproducibility: {
      provider, selectorFingerprint, artifact: artifactPath,
      walkingMatrixFingerprint: walkingMatrix.candidateFingerprint,
      initialPromptFingerprint: selection.initialCall.promptFingerprint,
      finalPromptFingerprint: selection.finalCall.promptFingerprint,
      actualLlmCalls: selection.snapshot.callBudget.actualCallCount,
    },
    attrition: {
      prefiltered: loaded.prefilteredCount,
      evidenceReady: loaded.entities.filter((entity) => entity.readiness.ready).length,
      candidateSet: loaded.readyEntities.length,
      portfolioRoutes: portfolio.routes.length,
      finalAlternatives: selection.repair.portfolio.routes.length,
      winnerStops: winner.route.entities.length,
      evidenceGaps: loaded.evidenceGaps,
    },
    assessments: {
      initial: selection.initialCall.value.assessments,
      final: selection.finalCall.value.assessments,
    },
    finalists: portfolio.routes.slice(0, 5).map((route) => ({
      slot: route.slot,
      stops: route.entities.map((entity) => entity.localName),
      actualDuration: route.metrics.estimatedTourMinutes,
      walkingMeters: route.metrics.walkingMeters,
    })),
    repair: {
      provenance: selection.repair.provenance,
      discarded: selection.repair.diagnostics.discarded,
      operationCounts: selection.repair.diagnostics.operationCounts,
    },
    selectedRoute: {
      slot: winner.route.slot,
      promise: winner.plan.promise,
      centralQuestion: winner.plan.centralQuestion,
      actualDuration: winner.route.metrics.estimatedTourMinutes,
      walkingMeters: winner.route.metrics.walkingMeters,
      stops: winner.route.entities.map((entity, index) => ({
        position: index + 1,
        canonicalId: entity.canonicalId,
        name: entity.localName,
        role: winner.plan.stops[index].role,
        uniqueContribution: winner.plan.stops[index].uniqueContribution,
        evidenceIds: winner.plan.stops[index].evidenceIds,
      })),
    },
    coverage: {
      candidateOracle: `${candidateOracle.length}/${evaluationCase.oracle.stops.length}`,
      oracle: `${routeOracle.length}/${evaluationCase.oracle.stops.length}`,
      required,
      missingOracle: evaluationCase.oracle.stops.filter((anchor) => !selectedIds.has(anchor.qid))
        .map((anchor) => anchor.name),
      groundedStops: `${winner.plan.stops.length}/${winner.route.entities.length}`,
      v4ExactIdentityOracle: `${v4}/${evaluationCase.oracle.stops.length}`,
      greedyExactIdentityOracle: `${greedy}/${evaluationCase.oracle.stops.length}`,
    },
    gates: { ...gates, passed: Object.values(gates).every(Boolean) },
  };
}

export async function runEditorialV5Workbench(): Promise<void> {
  const modeValue = argumentValue('--mode') ?? 'snapshot';
  if (modeValue !== 'live' && modeValue !== 'snapshot') {
    throw new Error('--mode must be live or snapshot');
  }
  const mode = modeValue as WorkbenchModeV5;
  if (hasFlag('--allow-holdout') || argumentValue('--freeze-manifest')) {
    throw new Error('Normal v5 workbench refuses holdout options');
  }
  const provider: EditorialProviderV5 = { kind: 'deepseek', model: 'deepseek-v4-flash' };
  const cases = loadEditorialEvaluationCases(manifestPath);
  const requested = argumentValue('--case') ?? 'madrid-history-es-120';
  const selectedCases = hasFlag('--all') ? cases : cases.filter((item) => item.id === requested);
  if (selectedCases.length === 0) throw new Error(`Unknown calibration case ${requested}`);
  const runId = argumentValue('--run-id')
    ?? new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotRun = argumentValue('--snapshot-run');
  if (mode === 'snapshot' && !argumentValue('--artifact') && !snapshotRun) {
    throw new Error('Snapshot mode requires --artifact or --snapshot-run');
  }
  const requestedArtifact = argumentValue('--artifact');
  if (requestedArtifact && selectedCases.length > 1) {
    throw new Error('--artifact can only address one case');
  }
  const outputDirectory = join(fixtures, 'editorial-v5', runId);
  const results: Record<string, unknown>[] = [];
  for (let index = 0; index < selectedCases.length; index += 1) {
    const evaluationCase = selectedCases[index];
    const artifactPath = requestedArtifact
      ? join(process.cwd(), requestedArtifact)
      : mode === 'snapshot'
        ? join(fixtures, 'editorial-v5', snapshotRun as string, `${evaluationCase.id}.json`)
        : join(outputDirectory, `${evaluationCase.id}.json`);
    console.log(`[editorial-v5] ${mode} ${evaluationCase.id} ${basename(artifactPath)}`);
    try {
      const workbenchResult = await runCase(evaluationCase, mode, provider, artifactPath);
      results.push(workbenchResult);
      console.log(JSON.stringify(workbenchResult, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = {
        case: { id: evaluationCase.id, mode, city: evaluationCase.city },
        error: message, gates: { passed: false },
      };
      results.push(failure);
      console.error(`[editorial-v5] ${evaluationCase.id} failed: ${message}`);
      if (!hasFlag('--all')) throw error;
    }
    if (mode === 'live' && index < selectedCases.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  if (mode === 'live') {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, 'summary.json'), `${JSON.stringify({
      schemaVersion: 'route-editorial-workbench-v5',
      selectionSnapshotSchema: EDITORIAL_SELECTION_SNAPSHOT_SCHEMA_VERSION_V5,
      createdAt: new Date().toISOString(), mode, provider,
      selectorFingerprint: editorialV5SelectorFingerprint(), results,
    }, null, 2)}\n`);
  }
  if (results.some((workbenchResult) => !(workbenchResult.gates as { passed: boolean }).passed)) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runEditorialV5Workbench().catch((error) => {
    console.error('[route-editorial-v5] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
