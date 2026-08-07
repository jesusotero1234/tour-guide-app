import 'dotenv/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { loadEditorialEvaluationInputV3 } from '../../src/services/poi/EditorialEvaluationInputV3';
import { loadEditorialEvaluationInputV4 } from '../../src/services/poi/EditorialEvaluationInputV4';
import { evaluateHumanReviewV4 } from '../../src/services/poi/EditorialHumanReviewV4';
import {
  EditorialEvaluationScope,
  LoadedEditorialEvaluationCase,
  loadEditorialEvaluationCases,
} from '../../src/services/poi/EditorialEvaluationManifest';
import {
  buildRouteCriticRequestV4,
  requestRouteCriticV4,
  RouteCriticV4,
  selectRouteCriticWinnerV4,
  validateRouteCriticV4,
} from '../../src/services/poi/EditorialRouteCriticV4';
import {
  optimizeEditorialRouteV4,
  reduceStoryCandidatesV4,
} from '../../src/services/poi/EditorialRouteOptimizerV4';
import {
  buildStoryMapRequestV4,
  EDITORIAL_V4_MODEL,
  EditorialStoryMapV4,
  requestStoryMapV4,
  validateStoryMapV4,
} from '../../src/services/poi/EditorialStoryMapV4';
import {
  EditorialCallResultV4,
  EditorialProviderV4,
} from '../../src/services/poi/EditorialStructuredLlmV4';
import {
  captureWalkingMatrixV4,
  validateWalkingMatrixSnapshotV4,
  WalkingMatrixSnapshotV4,
} from '../../src/services/poi/EditorialWalkingMatrixV4';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';

type WorkbenchModeV4 = 'evidence' | 'live' | 'snapshot';

interface EditorialV4Artifact {
  schemaVersion: 'route-editorial-workbench-v4';
  status: 'failed' | 'complete';
  createdAt: string;
  caseId: string;
  provider: EditorialProviderV4;
  selectorFingerprint: string;
  candidateMapping: Array<{
    slot: string;
    canonicalId: string;
    siteId: string;
    coordinates: { lat: number; lng: number };
    evidenceIds: string[];
  }>; 
  storyMapCall: EditorialCallResultV4<EditorialStoryMapV4>;
  walkingMatrix: WalkingMatrixSnapshotV4 | null;
  routeCriticCall: EditorialCallResultV4<RouteCriticV4> | null;
  failure: { stage: 'story_map' | 'walking_matrix' | 'optimizer' | 'route_critic'; message: string } | null;
}

interface EditorialV4FreezeManifest {
  schemaVersion: 'route-editorial-freeze-v4';
  createdAt: string;
  selectorFingerprint: string;
  model: typeof EDITORIAL_V4_MODEL;
  providerKind: 'deepseek';
  calibrationRunId: string;
  humanReviewFile: string;
  holdoutCases: string[];
}

const fixtures = join(__dirname, '..', '..', 'fixtures');
const manifestPath = join(fixtures, 'oracle', 'editorial-v2-manifest.json');

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

function replayValidatedCall<T>(
  call: EditorialCallResultV4<T>,
  validate: (value: unknown) => T
): EditorialCallResultV4<T> {
  const attempt = [...call.attempts].reverse().find((item) => item.status === 'valid' && item.rawOutput);
  if (!attempt?.rawOutput) throw new Error('Snapshot call has no valid raw output');
  return { ...call, value: validate(JSON.parse(attempt.rawOutput)) };
}

export function editorialV4SelectorFingerprint(): string {
  const hash = createHash('sha256');
  for (const relativePath of [
    '../../src/services/poi/EditorialEntityV4.ts',
    '../../src/services/poi/EditorialEvaluationInputV4.ts',
    '../../src/services/poi/EditorialWalkingMatrixV4.ts',
    '../../src/services/poi/EditorialStructuredLlmV4.ts',
    '../../src/services/poi/EditorialStoryMapV4.ts',
    '../../src/services/poi/EditorialRouteOptimizerV4.ts',
    '../../src/services/poi/EditorialRouteCriticV4.ts',
    'route-editorial-v4.ts',
  ]) hash.update(readFileSync(join(__dirname, relativePath)));
  return hash.digest('hex');
}

function selectedProvider(): EditorialProviderV4 {
  const value = argumentValue('--provider') ?? 'deepseek-flash';
  if (value === 'deepseek-flash') return { kind: 'deepseek', model: EDITORIAL_V4_MODEL };
  if (value === 'ollama-gemma') return { kind: 'ollama', model: 'gemma4:26b' };
  throw new Error('--provider must be deepseek-flash or ollama-gemma');
}

function requiredOracleCount(evaluationCase: LoadedEditorialEvaluationCase): number {
  return evaluationCase.city === 'Madrid'
    ? evaluationCase.oracle.stops.length
    : Math.ceil(evaluationCase.oracle.stops.length * 0.8);
}

function candidateMapping(entities: Awaited<ReturnType<typeof loadEditorialEvaluationInputV4>>['readyEntities']) {
  return entities.map((entity, index) => ({
    slot: `c${String(index + 1).padStart(2, '0')}`,
    canonicalId: entity.canonicalId,
    siteId: entity.siteId,
    coordinates: entity.coordinates,
    evidenceIds: entity.evidenceFacts.map((fact) => fact.id),
  }));
}

function coveredOracleIds(
  evaluationCase: LoadedEditorialEvaluationCase,
  selectedIds: Set<string>,
  visitGroupByCanonicalId: Map<string, string | null>
): string[] {
  const selectedGroups = new Set([...selectedIds].map((id) => visitGroupByCanonicalId.get(id))
    .filter((group): group is string => Boolean(group)));
  return evaluationCase.oracle.stops.filter((anchor) => {
    if (selectedIds.has(anchor.qid)) return true;
    const group = visitGroupByCanonicalId.get(anchor.qid);
    return Boolean(group && selectedGroups.has(group));
  }).map((anchor) => anchor.qid);
}

async function greedyOracleCoverage(
  evaluationCase: LoadedEditorialEvaluationCase,
  visitGroupByCanonicalId: Map<string, string | null>
): Promise<string[]> {
  const loaded = await loadEditorialEvaluationInputV3(evaluationCase, fixtures, { allowHoldout: evaluationCase.scope === 'holdout' });
  const greedy = composeWalkingRoute(loaded.readySites.map((site) => ({
    ...site,
    name: site.localName,
    importance_score: site.firstVisitScore,
    landmarkTier: site.tier === 'essential' ? 'flagship' : site.tier === 'strong' ? 'major' : 'supporting',
    historyPlaceScore: site.themeScore,
    wikidataId: site.canonicalId,
  })), evaluationCase.durationMinutes, evaluationCase.theme, { minStops: 5, maxStops: 8 });
  const ids = new Set(greedy.route.flatMap((site) => site.entityIds));
  return coveredOracleIds(evaluationCase, ids, visitGroupByCanonicalId);
}

async function runCase(
  evaluationCase: LoadedEditorialEvaluationCase,
  mode: WorkbenchModeV4,
  provider: EditorialProviderV4,
  artifactPath: string
): Promise<Record<string, unknown>> {
  const loaded = await loadEditorialEvaluationInputV4(evaluationCase, fixtures, { allowHoldout: evaluationCase.scope === 'holdout' });
  const mapped = candidateMapping(loaded.readyEntities);
  const poolIds = new Set(loaded.readyEntities.map((entity) => entity.canonicalId));
  const candidateOracle = evaluationCase.oracle.stops.filter((anchor) => poolIds.has(anchor.qid));
  const evidenceGates = {
    allSentEntitiesReady: loaded.readyEntities.every((entity) => entity.readiness.ready),
    candidateOracleCoverage: candidateOracle.length === evaluationCase.oracle.stops.length,
    candidateLimit: loaded.readyEntities.length <= 30,
  };
  if (mode === 'evidence') {
    return {
      case: evaluationCase.id,
      mode,
      candidateCount: loaded.readyEntities.length,
      candidateOracleCoverage: `${candidateOracle.length}/${evaluationCase.oracle.stops.length}`,
      evidenceGaps: loaded.evidenceGaps,
      candidates: mapped.map((item, index) => ({
        ...item, name: loaded.readyEntities[index].localName,
        readiness: loaded.readyEntities[index].readiness,
      })),
      gates: { ...evidenceGates, passed: Object.values(evidenceGates).every(Boolean) },
    };
  }
  if (!Object.values(evidenceGates).every(Boolean)) throw new Error(`Evidence gate failed for ${evaluationCase.id}`);
  const built = buildStoryMapRequestV4(loaded.readyEntities, {
    city: evaluationCase.city,
    theme: evaluationCase.theme,
    language: evaluationCase.language,
    requestedDuration: evaluationCase.durationMinutes,
  });
  let storyMapCall: EditorialCallResultV4<EditorialStoryMapV4>;
  let walkingMatrix: WalkingMatrixSnapshotV4;
  let routeCriticCall: EditorialCallResultV4<RouteCriticV4> | null;
  if (mode === 'snapshot') {
    if (!existsSync(artifactPath)) throw new Error(`Missing v4 snapshot ${artifactPath}`);
    const artifact = readJson<EditorialV4Artifact>(artifactPath);
    if (artifact.status !== 'complete' || !artifact.walkingMatrix) {
      throw new Error(`V4 snapshot is incomplete${artifact.failure ? `: ${artifact.failure.stage}: ${artifact.failure.message}` : ''}`);
    }
    if (artifact.selectorFingerprint !== editorialV4SelectorFingerprint()) throw new Error('V4 snapshot selector fingerprint changed');
    if (JSON.stringify(artifact.candidateMapping) !== JSON.stringify(mapped)) throw new Error('V4 snapshot candidate mapping changed');
    storyMapCall = replayValidatedCall(artifact.storyMapCall, (value) => (
      validateStoryMapV4(value, built.request)
    ));
    const storyMap = storyMapCall.value as EditorialStoryMapV4;
    const reduced = reduceStoryCandidatesV4(loaded.readyEntities, storyMap);
    walkingMatrix = validateWalkingMatrixSnapshotV4(artifact.walkingMatrix, reduced.map((candidate) => candidate.entity));
    const portfolio = optimizeEditorialRouteV4(loaded.readyEntities, storyMap, walkingMatrix, evaluationCase.durationMinutes);
    if (portfolio.finalists.length > 1) {
      if (!artifact.routeCriticCall) throw new Error('V4 snapshot is missing a required route critic call');
      const request = buildRouteCriticRequestV4(portfolio, storyMap, built.request, {
        city: evaluationCase.city, theme: evaluationCase.theme, language: evaluationCase.language,
        requestedDuration: evaluationCase.durationMinutes,
      });
      routeCriticCall = replayValidatedCall(artifact.routeCriticCall, (value) => (
        validateRouteCriticV4(value, request)
      ));
    } else {
      routeCriticCall = null;
    }
  } else {
    storyMapCall = await requestStoryMapV4(built.request, provider, {
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
      ollamaHost: process.env.OLLAMA_HOST,
    });
    const persistArtifact = (
      status: EditorialV4Artifact['status'],
      matrix: WalkingMatrixSnapshotV4 | null,
      critic: EditorialCallResultV4<RouteCriticV4> | null,
      failure: EditorialV4Artifact['failure']
    ) => {
      const artifact: EditorialV4Artifact = {
        schemaVersion: 'route-editorial-workbench-v4', status,
        createdAt: new Date().toISOString(), caseId: evaluationCase.id, provider,
        selectorFingerprint: editorialV4SelectorFingerprint(), candidateMapping: mapped,
        storyMapCall, walkingMatrix: matrix, routeCriticCall: critic, failure,
      };
      mkdirSync(dirname(artifactPath), { recursive: true });
      writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    };
    if (!storyMapCall.value) {
      const detail = storyMapCall.attempts.at(-1)?.error ?? storyMapCall.status;
      persistArtifact('failed', null, null, { stage: 'story_map', message: detail });
      throw new Error(`Story map curator failed: ${storyMapCall.status}: ${detail}`);
    }
    const reduced = reduceStoryCandidatesV4(loaded.readyEntities, storyMapCall.value);
    try {
      walkingMatrix = await captureWalkingMatrixV4(reduced.map((candidate) => candidate.entity));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persistArtifact('failed', null, null, { stage: 'walking_matrix', message });
      throw error;
    }
    let portfolio;
    try {
      portfolio = optimizeEditorialRouteV4(
        loaded.readyEntities, storyMapCall.value, walkingMatrix, evaluationCase.durationMinutes
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      persistArtifact('failed', walkingMatrix, null, { stage: 'optimizer', message });
      throw error;
    }
    if (portfolio.finalists.length > 1) {
      const request = buildRouteCriticRequestV4(portfolio, storyMapCall.value, built.request, {
        city: evaluationCase.city, theme: evaluationCase.theme, language: evaluationCase.language,
        requestedDuration: evaluationCase.durationMinutes,
      });
      routeCriticCall = await requestRouteCriticV4(request, provider, {
        apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
        ollamaHost: process.env.OLLAMA_HOST,
      });
      if (!routeCriticCall.value) {
        const detail = routeCriticCall.attempts.at(-1)?.error ?? routeCriticCall.status;
        persistArtifact('failed', walkingMatrix, routeCriticCall, { stage: 'route_critic', message: detail });
        throw new Error(`Route critic failed: ${routeCriticCall.status}: ${detail}`);
      }
    } else {
      routeCriticCall = null;
    }
    persistArtifact('complete', walkingMatrix, routeCriticCall, null);
  }
  const storyMap = storyMapCall.value as EditorialStoryMapV4;
  const portfolio = optimizeEditorialRouteV4(loaded.readyEntities, storyMap, walkingMatrix, evaluationCase.durationMinutes);
  if (portfolio.finalists.length === 0) {
    return {
      case: { id: evaluationCase.id, mode, city: evaluationCase.city, requestedDuration: evaluationCase.durationMinutes },
      portfolio,
      gates: { ...evidenceGates, noPhysicallyViableNoRoute: false, passed: false },
    };
  }
  const winner = selectRouteCriticWinnerV4(portfolio, routeCriticCall?.value ?? null);
  const selectedIds = new Set(winner.entities.map((entity) => entity.canonicalId));
  const visitGroupByCanonicalId = new Map(loaded.readyEntities.map((entity) => (
    [entity.canonicalId, entity.visitConflictGroup] as const
  )));
  const reducedIds = new Set(portfolio.reducedCandidates.map((candidate) => candidate.entity.canonicalId));
  const exactRouteOracle = evaluationCase.oracle.stops.filter((anchor) => selectedIds.has(anchor.qid));
  const routeOracleIds = new Set(coveredOracleIds(evaluationCase, selectedIds, visitGroupByCanonicalId));
  const routeOracle = evaluationCase.oracle.stops.filter((anchor) => routeOracleIds.has(anchor.qid));
  const reducedOracle = evaluationCase.oracle.stops.filter((anchor) => reducedIds.has(anchor.qid));
  const greedyOracle = await greedyOracleCoverage(evaluationCase, visitGroupByCanonicalId);
  const required = requiredOracleCount(evaluationCase);
  const conflicts = winner.entities.map((entity) => entity.visitConflictGroup).filter((group): group is string => Boolean(group));
  const gates = {
    ...evidenceGates,
    noPhysicallyViableNoRoute: portfolio.status !== 'no_route' && portfolio.status !== 'insufficient_editorial_core',
    withinRequestedDuration: portfolio.status === 'selected'
      && winner.metrics.estimatedTourMinutes <= evaluationCase.durationMinutes,
    requiredRouteOracleCoverage: routeOracle.length >= required,
    oracleNotBelowGreedy: routeOracle.length >= greedyOracle.length,
    noDuplicateEntities: selectedIds.size === winner.entities.length,
    noVisitConflicts: new Set(conflicts).size === conflicts.length,
    noOverlongSegments: winner.metrics.maxSegmentMeters <= (evaluationCase.durationMinutes <= 120 ? 1500 : 1700)
      && winner.metrics.maxSegmentMinutes <= (evaluationCase.durationMinutes <= 120 ? 20 : 23),
    narrativeCoreCovered: winner.assignments.length >= Math.min(storyMap.beats.length, 4),
    criticAccepted: routeCriticCall?.value
      ? routeCriticCall.value.assessments[winner.slot].coherence !== 'weak'
        && !routeCriticCall.value.assessments[winner.slot].avoidableRedundancy
      : true,
    noZeroMarginalStops: Object.values(winner.marginalContributions).every((reasons) => reasons.length > 0),
  };
  return {
    case: { id: evaluationCase.id, mode, city: evaluationCase.city, requestedDuration: evaluationCase.durationMinutes },
    reproducibility: {
      provider,
      selectorFingerprint: editorialV4SelectorFingerprint(),
      storyPromptFingerprint: storyMapCall.promptFingerprint,
      criticPromptFingerprint: routeCriticCall?.promptFingerprint ?? null,
      artifact: artifactPath,
      walkingMatrixFingerprint: walkingMatrix.candidateFingerprint,
    },
    candidateSet: {
      prefiltered: loaded.prefilteredCount,
      ready: loaded.readyEntities.length,
      reduced: portfolio.reducedCandidates.length,
      poolOracleCoverage: `${candidateOracle.length}/${evaluationCase.oracle.stops.length}`,
      reducedOracleCoverage: `${reducedOracle.length}/${evaluationCase.oracle.stops.length}`,
      evidenceGaps: loaded.evidenceGaps,
    },
    storyMap,
    assessments: portfolio.reducedCandidates.map((candidate) => ({
      slot: candidate.slot,
      canonicalId: candidate.entity.canonicalId,
      name: candidate.entity.localName,
      assessment: candidate.assessment,
    })),
    portfolio: {
      status: portfolio.status,
      searchedDuration: portfolio.searchedDuration,
      exploredStateCount: portfolio.exploredStateCount,
      finalists: portfolio.finalists.map((route) => ({
        slot: route.slot,
        stops: route.entities.map((entity) => entity.localName),
        assignments: route.assignments,
        marginalContributions: route.marginalContributions,
        metrics: route.metrics,
        scores: route.scores,
        critic: routeCriticCall?.value?.assessments[route.slot] ?? null,
      })),
    },
    selectedRoute: {
      slot: winner.slot,
      actualDuration: winner.metrics.estimatedTourMinutes,
      walkingMeters: winner.metrics.walkingMeters,
      stops: winner.entities.map((entity, index) => ({
        position: index + 1,
        name: entity.localName,
        canonicalId: entity.canonicalId,
        assignedBeats: winner.assignments.filter((assignment) => assignment.candidateSlot === winner.candidateSlots[index]),
        marginalReasons: winner.marginalContributions[winner.candidateSlots[index]],
      })),
    },
    coverage: {
      oracle: `${routeOracle.length}/${evaluationCase.oracle.stops.length}`,
      exactIdentityOracle: `${exactRouteOracle.length}/${evaluationCase.oracle.stops.length}`,
      representedByVisitConflict: routeOracle.filter((anchor) => !selectedIds.has(anchor.qid)).map((anchor) => anchor.name),
      required,
      missingOracle: evaluationCase.oracle.stops.filter((anchor) => !selectedIds.has(anchor.qid)).map((anchor) => anchor.name),
      greedyOracle: `${greedyOracle.length}/${evaluationCase.oracle.stops.length}`,
      storyBeats: `${winner.assignments.length}/${storyMap.beats.length}`,
    },
    gates: { ...gates, passed: Object.values(gates).every(Boolean) },
  };
}

function validateFreezeManifest(path: string): EditorialV4FreezeManifest {
  const freeze = readJson<EditorialV4FreezeManifest>(path);
  if (freeze.schemaVersion !== 'route-editorial-freeze-v4'
    || freeze.selectorFingerprint !== editorialV4SelectorFingerprint()
    || freeze.model !== EDITORIAL_V4_MODEL
    || freeze.providerKind !== 'deepseek') {
    throw new Error('Holdout freeze manifest does not match the current v4 selector');
  }
  const calibrationCases = loadEditorialEvaluationCases(manifestPath).map((item) => item.id);
  const review = evaluateHumanReviewV4(readJson<unknown>(freeze.humanReviewFile), calibrationCases);
  if (!review.passed) {
    throw new Error('Holdout freeze requires a passing blinded human review');
  }
  return freeze;
}

function writeFreezeManifest(
  path: string,
  runId: string,
  results: Record<string, unknown>[],
  humanReviewFile: string
): void {
  if (results.some((result) => !(result.gates as { passed: boolean }).passed)) {
    throw new Error('Cannot freeze v4 while calibration gates fail');
  }
  const calibrationCases = loadEditorialEvaluationCases(manifestPath).map((item) => item.id);
  const review = evaluateHumanReviewV4(readJson<unknown>(humanReviewFile), calibrationCases);
  if (!review.passed) {
    throw new Error('Cannot freeze v4 without a passing blinded human review');
  }
  const freeze: EditorialV4FreezeManifest = {
    schemaVersion: 'route-editorial-freeze-v4',
    createdAt: new Date().toISOString(),
    selectorFingerprint: editorialV4SelectorFingerprint(),
    model: EDITORIAL_V4_MODEL,
    providerKind: 'deepseek',
    calibrationRunId: runId,
    humanReviewFile,
    holdoutCases: ['valencia-history-es-120', 'segovia-history-es-120'],
  };
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(freeze, null, 2)}\n`);
}

export async function runEditorialV4Workbench(options: { allowHoldout: boolean }): Promise<void> {
  const mode = (argumentValue('--mode') ?? 'evidence') as WorkbenchModeV4;
  if (!['evidence', 'live', 'snapshot'].includes(mode)) throw new Error('--mode must be evidence, live, or snapshot');
  const provider = selectedProvider();
  if (mode === 'live' && provider.kind === 'deepseek' && !hasFlag('--allow-external')) {
    throw new Error('DeepSeek live mode requires --allow-external');
  }
  const scope: EditorialEvaluationScope = options.allowHoldout ? 'holdout' : 'calibration';
  let freeze: EditorialV4FreezeManifest | null = null;
  if (options.allowHoldout) {
    if (mode !== 'live' || provider.kind !== 'deepseek') throw new Error('Holdouts require a live DeepSeek run');
    const freezePath = argumentValue('--freeze-manifest');
    if (!freezePath) throw new Error('Holdout runner requires --freeze-manifest');
    freeze = validateFreezeManifest(join(process.cwd(), freezePath));
  } else if (hasFlag('--allow-holdout') || argumentValue('--freeze-manifest')) {
    throw new Error('Normal v4 workbench refuses holdout options');
  }
  const cases = loadEditorialEvaluationCases(manifestPath, {
    scope,
    allowHoldout: options.allowHoldout,
  });
  const requested = argumentValue('--case') ?? (options.allowHoldout ? 'valencia-history-es-120' : 'madrid-history-es-120');
  const selectedCases = hasFlag('--all') ? cases : cases.filter((item) => item.id === requested);
  if (selectedCases.length === 0) throw new Error(`Unknown ${scope} case ${requested}`);
  if (freeze && selectedCases.some((item) => !freeze?.holdoutCases.includes(item.id))) {
    throw new Error('Requested holdout is not authorized by the freeze manifest');
  }
  const runId = argumentValue('--run-id') ?? new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirectory = join(fixtures, 'editorial-v4', runId);
  const requestedArtifact = argumentValue('--artifact');
  if (requestedArtifact && selectedCases.length > 1) throw new Error('--artifact can only address one case');
  const results: Record<string, unknown>[] = [];
  for (let index = 0; index < selectedCases.length; index += 1) {
    const evaluationCase = selectedCases[index];
    const artifactPath = requestedArtifact
      ? join(process.cwd(), requestedArtifact)
      : join(outputDirectory, `${evaluationCase.id}.json`);
    console.log(`[editorial-v4] ${mode} ${evaluationCase.id} ${basename(artifactPath)}`);
    try {
      const result = await runCase(evaluationCase, mode, provider, artifactPath);
      results.push(result);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = {
        case: { id: evaluationCase.id, mode, city: evaluationCase.city, requestedDuration: evaluationCase.durationMinutes },
        error: message,
        gates: { passed: false },
      };
      results.push(failure);
      console.error(`[editorial-v4] ${evaluationCase.id} failed: ${message}`);
      if (!hasFlag('--all')) throw error;
    }
    if (mode === 'live' && index < selectedCases.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  if (mode !== 'evidence') {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, 'summary.json'), `${JSON.stringify({
      schemaVersion: 'route-editorial-workbench-v4',
      createdAt: new Date().toISOString(),
      mode,
      scope,
      provider,
      selectorFingerprint: editorialV4SelectorFingerprint(),
      results,
    }, null, 2)}\n`);
  }
  const freezeOutput = argumentValue('--write-freeze');
  if (freezeOutput) {
    if (scope !== 'calibration' || mode !== 'snapshot' || !hasFlag('--all')) {
      throw new Error('Freeze requires a complete calibration snapshot run');
    }
    const humanReviewFile = argumentValue('--human-review');
    if (!humanReviewFile) throw new Error('Freeze requires --human-review');
    writeFreezeManifest(join(process.cwd(), freezeOutput), runId, results, join(process.cwd(), humanReviewFile));
  }
  if (results.some((result) => !(result.gates as { passed: boolean }).passed)) process.exitCode = 1;
}

if (require.main === module) {
  runEditorialV4Workbench({ allowHoldout: false }).catch((error) => {
    console.error('[route-editorial-v4] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
