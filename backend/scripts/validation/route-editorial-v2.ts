import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  EditorialRouteBriefArtifact,
  requestEditorialRouteBrief,
  ROUTE_EDITORIAL_MODEL,
  ROUTE_EDITORIAL_SCHEMA_VERSION,
  validateTourEditorialBrief,
} from '../../src/services/poi/EditorialRouteBrief';
import { loadEditorialEvaluationInput } from '../../src/services/poi/EditorialEvaluationInput';
import {
  LoadedEditorialEvaluationCase,
  loadEditorialEvaluationCases,
} from '../../src/services/poi/EditorialEvaluationManifest';
import { optimizeEditorialRoute } from '../../src/services/poi/EditorialRouteOptimizer';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';

type WorkbenchMode = 'live' | 'snapshot';

const fixtures = join(__dirname, '..', '..', 'fixtures');
const manifestPath = join(fixtures, 'oracle', 'editorial-v2-manifest.json');
const artifactDirectory = join(fixtures, 'editorial-briefs');
const evaluationDirectory = join(fixtures, 'editorial-evaluations');
const freezePath = join(artifactDirectory, 'freeze.json');

interface EditorialCalibrationFreeze {
  schemaVersion: 'route-editorial-freeze-v2';
  model: string;
  promptFingerprint: string;
  selectorFingerprint: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function artifactPath(evaluationCase: LoadedEditorialEvaluationCase): string {
  return join(artifactDirectory, `${evaluationCase.id}.json`);
}

function selectorFingerprint(): string {
  const hash = createHash('sha256');
  for (const relativePath of [
    '../../src/services/poi/EditorialCandidate.ts',
    '../../src/services/poi/EditorialRouteBrief.ts',
    '../../src/services/poi/EditorialRouteOptimizer.ts',
    'route-editorial-v2.ts',
  ]) {
    hash.update(readFileSync(join(__dirname, relativePath)));
  }
  return hash.digest('hex');
}

function assertOrCreateFreeze(
  artifact: EditorialRouteBriefArtifact,
  scope: LoadedEditorialEvaluationCase['scope']
): void {
  const expected: EditorialCalibrationFreeze = {
    schemaVersion: 'route-editorial-freeze-v2',
    model: artifact.model,
    promptFingerprint: artifact.promptFingerprint,
    selectorFingerprint: selectorFingerprint(),
  };
  if (!existsSync(freezePath)) {
    if (scope === 'holdout') {
      throw new Error('Calibration code, prompt, model and configuration must be frozen before the holdout');
    }
    return;
  }

  const frozen = readJson<EditorialCalibrationFreeze>(freezePath);
  if (JSON.stringify(frozen) !== JSON.stringify(expected)) {
    throw new Error('Current code, prompt or model does not match the editorial calibration freeze');
  }
}

function freezeCalibration(cases: LoadedEditorialEvaluationCase[]): void {
  if (cases.some((evaluationCase) => evaluationCase.scope !== 'calibration')) {
    throw new Error('The holdout cannot create or modify the calibration freeze');
  }
  const artifacts = cases.map((evaluationCase) => {
    const path = artifactPath(evaluationCase);
    if (!existsSync(path)) throw new Error(`Cannot freeze without snapshot ${evaluationCase.id}`);
    const resultPath = join(evaluationDirectory, `${evaluationCase.id}.json`);
    if (!existsSync(resultPath)) throw new Error(`Cannot freeze without evaluation ${evaluationCase.id}`);
    const result = readJson<{ gates?: { passed?: boolean } }>(resultPath);
    if (result.gates?.passed !== true) throw new Error(`Cannot freeze failing calibration ${evaluationCase.id}`);
    return readJson<EditorialRouteBriefArtifact>(path);
  });
  const models = new Set(artifacts.map((artifact) => artifact.model));
  const prompts = new Set(artifacts.map((artifact) => artifact.promptFingerprint));
  if (models.size !== 1 || prompts.size !== 1 || !artifacts[0]) {
    throw new Error('Calibration snapshots do not share one model and prompt fingerprint');
  }
  const frozen: EditorialCalibrationFreeze = {
    schemaVersion: 'route-editorial-freeze-v2',
    model: artifacts[0].model,
    promptFingerprint: artifacts[0].promptFingerprint,
    selectorFingerprint: selectorFingerprint(),
  };
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(freezePath, JSON.stringify(frozen, null, 2));
}

function assertHoldoutPreflight(): void {
  if (!existsSync(freezePath)) {
    throw new Error('Calibration code, prompt, model and configuration must be frozen before the holdout');
  }
  const frozen = readJson<EditorialCalibrationFreeze>(freezePath);
  if (frozen.model !== ROUTE_EDITORIAL_MODEL || frozen.selectorFingerprint !== selectorFingerprint()) {
    throw new Error('Current code, model or configuration does not match the editorial calibration freeze');
  }
  for (const evaluationCase of loadEditorialEvaluationCases(manifestPath)) {
    const snapshotPath = artifactPath(evaluationCase);
    const resultPath = join(evaluationDirectory, `${evaluationCase.id}.json`);
    if (!existsSync(snapshotPath) || !existsSync(resultPath)) {
      throw new Error(`Calibration ${evaluationCase.id} is incomplete; holdout remains locked`);
    }
    const result = readJson<{ gates?: { passed?: boolean } }>(resultPath);
    if (result.gates?.passed !== true) {
      throw new Error(`Calibration ${evaluationCase.id} did not pass; holdout remains locked`);
    }
  }
}

function assertArtifactInput(
  artifact: EditorialRouteBriefArtifact,
  input: EditorialRouteBriefArtifact['input']
): void {
  if (artifact.schemaVersion !== ROUTE_EDITORIAL_SCHEMA_VERSION) {
    throw new Error(`Snapshot has unexpected schema ${artifact.schemaVersion}`);
  }
  if (artifact.model !== ROUTE_EDITORIAL_MODEL) {
    throw new Error(`Snapshot has unexpected model ${artifact.model}`);
  }
  if (JSON.stringify(artifact.input) !== JSON.stringify(input)) {
    throw new Error('Snapshot input no longer matches the frozen candidate projection');
  }
}

async function loadBriefArtifact(
  evaluationCase: LoadedEditorialEvaluationCase,
  input: EditorialRouteBriefArtifact['input'],
  mode: WorkbenchMode
): Promise<EditorialRouteBriefArtifact> {
  const path = artifactPath(evaluationCase);
  if (mode === 'snapshot') {
    if (!existsSync(path)) throw new Error(`Missing editorial snapshot: ${path}`);
    const artifact = readJson<EditorialRouteBriefArtifact>(path);
    assertArtifactInput(artifact, input);
    assertOrCreateFreeze(artifact, evaluationCase.scope);
    return {
      ...artifact,
      response: validateTourEditorialBrief(artifact.response, input),
    };
  }

  if (evaluationCase.scope === 'holdout' && existsSync(path)) {
    throw new Error(`Holdout ${evaluationCase.id} has already been run; refusing a second live evaluation`);
  }
  if (evaluationCase.scope === 'holdout') assertHoldoutPreflight();
  const artifact = await requestEditorialRouteBrief(input);
  assertOrCreateFreeze(artifact, evaluationCase.scope);
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return artifact;
}

async function runCase(
  evaluationCase: LoadedEditorialEvaluationCase,
  mode: WorkbenchMode
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const { candidateSet, request: input, prefilteredCount } = await loadEditorialEvaluationInput(
    evaluationCase,
    fixtures,
    { allowHoldout: evaluationCase.scope === 'holdout' }
  );
  const artifact = await loadBriefArtifact(evaluationCase, input, mode);
  const optimized = optimizeEditorialRoute(
    candidateSet.candidates,
    artifact.response,
    evaluationCase.durationMinutes
  );

  const candidateIds = new Set(candidateSet.candidates.flatMap((candidate) => candidate.memberCanonicalIds));
  const selectedIds = new Set(optimized.route.flatMap((candidate) => candidate.memberCanonicalIds));
  const essentialIds = new Set(artifact.response.candidateAssessments
    .filter((assessment) => assessment.inclusion === 'essential')
    .map((assessment) => assessment.canonicalId));
  const rejectedIds = new Set(artifact.response.candidateAssessments
    .filter((assessment) => assessment.inclusion === 'reject')
    .map((assessment) => assessment.canonicalId));
  const candidateOracleCovered = evaluationCase.oracle.stops.filter((anchor) => candidateIds.has(anchor.qid));
  const routeOracleCovered = evaluationCase.oracle.stops.filter((anchor) => selectedIds.has(anchor.qid));

  const greedy = composeWalkingRoute(candidateSet.candidates.map((candidate) => ({
    ...candidate,
    name: candidate.localName,
    importance_score: candidate.firstVisitScore,
    landmarkTier: candidate.tier === 'essential' ? 'flagship' : candidate.tier === 'strong' ? 'major' : 'supporting',
    historyPlaceScore: candidate.themeScore,
    wikidataId: candidate.canonicalId,
  })), evaluationCase.durationMinutes, evaluationCase.theme, { minStops: 5, maxStops: 8 });
  const greedyIds = new Set(greedy.route.flatMap((candidate) => candidate.memberCanonicalIds));
  const greedyOracleCovered = evaluationCase.oracle.stops.filter((anchor) => greedyIds.has(anchor.qid));
  const actualDuration = optimized.finalists[0]?.metrics.estimatedTourMinutes ?? null;
  const requiredOracleCount = evaluationCase.city === 'Madrid'
    ? evaluationCase.oracle.stops.length
    : Math.ceil(evaluationCase.oracle.stops.length * 0.8);
  const gates = {
    candidateOracleCoverage: candidateOracleCovered.length === evaluationCase.oracle.stops.length,
    requiredRouteOracleCoverage: routeOracleCovered.length >= requiredOracleCount,
    noPhysicallyViableNoRoute: optimized.status !== 'no_route',
    noDuplicateClusters: new Set(optimized.route.map((candidate) => candidate.clusterId)).size === optimized.route.length,
    noOverlongSegments: (optimized.finalists[0]?.metrics.overMaxSegments ?? 1) === 0,
    withinRequestedDuration: actualDuration !== null && actualDuration <= evaluationCase.durationMinutes,
    curatorEssentialsCovered: Array.from(essentialIds).every((id) => selectedIds.has(id)),
    arcCovered: optimized.finalists[0]?.scores.arcCoverage === 1,
    noRejectSelected: optimized.route.every((candidate) => !rejectedIds.has(candidate.canonicalId)),
    oracleNotBelowGreedy: routeOracleCovered.length >= greedyOracleCovered.length,
  };

  return {
    case: {
      id: evaluationCase.id,
      scope: evaluationCase.scope,
      mode,
      city: evaluationCase.city,
      theme: evaluationCase.theme,
      language: evaluationCase.language,
      requestedDuration: evaluationCase.durationMinutes,
    },
    elapsedMs: Date.now() - startedAt,
    reproducibility: {
      model: artifact.model,
      promptFingerprint: artifact.promptFingerprint,
      snapshot: artifactPath(evaluationCase),
    },
    candidateSet: {
      prefiltered: prefilteredCount,
      accepted: candidateSet.candidates.length,
      sentToCurator: input.candidates.length,
      deterministicTierBaseline: candidateSet.candidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.tier] = (counts[candidate.tier] ?? 0) + 1;
        return counts;
      }, {}),
      rejected: candidateSet.rejected.reduce<Record<string, number>>((counts, rejection) => {
        counts[rejection.reason] = (counts[rejection.reason] ?? 0) + 1;
        return counts;
      }, {}),
    },
    editorialBrief: {
      promise: artifact.response.promise,
      centralQuestion: artifact.response.centralQuestion,
      arc: artifact.response.arc,
      assessments: artifact.response.candidateAssessments,
    },
    status: optimized.status,
    actualDuration,
    recommendedDuration: optimized.recommendedDuration,
    selectedRoute: optimized.route.map((candidate, position) => ({
      position,
      name: candidate.localName,
      canonicalId: candidate.canonicalId,
      clusterId: candidate.clusterId,
    })),
    curatorEssentialCoverage: {
      covered: `${Array.from(essentialIds).filter((id) => selectedIds.has(id)).length}/${essentialIds.size}`,
      missing: Array.from(essentialIds).filter((id) => !selectedIds.has(id)),
    },
    oracleCoverage: {
      candidateSet: `${candidateOracleCovered.length}/${evaluationCase.oracle.stops.length}`,
      route: `${routeOracleCovered.length}/${evaluationCase.oracle.stops.length}`,
      required: requiredOracleCount,
      missing: evaluationCase.oracle.stops.filter((anchor) => !selectedIds.has(anchor.qid)).map((anchor) => anchor.name),
    },
    greedyBaseline: {
      stops: greedy.route.map((candidate) => candidate.localName),
      oracleCoverage: `${greedyOracleCovered.length}/${evaluationCase.oracle.stops.length}`,
      estimatedTourMinutes: greedy.diagnostics.estimatedTourMinutes,
    },
    finalists: optimized.finalists,
    discardSummary: optimized.discardSummary,
    gates: { ...gates, passed: Object.values(gates).every(Boolean) },
  };
}

async function main(): Promise<void> {
  const mode = (argumentValue('--mode') ?? 'snapshot') as WorkbenchMode;
  if (mode !== 'live' && mode !== 'snapshot') throw new Error('--mode must be live or snapshot');
  const allowHoldout = hasFlag('--allow-holdout');
  const scope = allowHoldout ? 'holdout' : 'calibration';
  const cases = loadEditorialEvaluationCases(manifestPath, { scope, allowHoldout });
  const requestedCaseId = argumentValue('--case');
  const positionalCity = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
  const selectedCases = hasFlag('--all')
    ? cases
    : cases.filter((evaluationCase) => requestedCaseId
      ? evaluationCase.id === requestedCaseId
      : evaluationCase.city.toLowerCase() === (positionalCity ?? 'Madrid').toLowerCase());
  if (selectedCases.length === 0) throw new Error('No matching evaluation case in the selected scope');
  if (scope === 'holdout' && (selectedCases.length !== 1 || mode !== 'live')) {
    throw new Error('The holdout may only be executed once, as one explicit live case');
  }

  const results = [];
  for (const evaluationCase of selectedCases) {
    results.push(await runCase(evaluationCase, mode));
  }
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));

  mkdirSync(evaluationDirectory, { recursive: true });
  results.forEach((result, index) => {
    writeFileSync(
      join(evaluationDirectory, `${selectedCases[index].id}.json`),
      JSON.stringify(result, null, 2)
    );
  });
  if (hasFlag('--freeze')) {
    if (!hasFlag('--all') || scope !== 'calibration') {
      throw new Error('--freeze requires a complete --all calibration run');
    }
    freezeCalibration(cases);
  }

  const passed = results.every((result) => (
    (result.gates as { passed: boolean }).passed
  ));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[route-editorial-v2] failed:', error);
  process.exit(1);
});
