import 'dotenv/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { loadEditorialEvaluationInputV3 } from '../../src/services/poi/EditorialEvaluationInputV3';
import {
  LoadedEditorialEvaluationCase,
  loadEditorialEvaluationCases,
} from '../../src/services/poi/EditorialEvaluationManifest';
import {
  buildDeterministicEditorialArcV3,
  buildRouteJuryRequestV3,
  optimizeEditorialRoutePortfolioV3,
  selectRouteJuryWinnerV3,
} from '../../src/services/poi/EditorialRoutePortfolioV3';
import {
  buildCandidateSignalsRequestV3,
  CandidateSignalsV3,
  EDITORIAL_V3_MODEL,
  EditorialV3CallResult,
  EditorialV3Provider,
  requestCandidateSignalsV3,
  requestRouteJuryV3,
  RouteJuryV3,
  validateCandidateSignalsV3,
  validateRouteJuryV3,
} from '../../src/services/poi/EditorialSelectionV3';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';

type WorkbenchModeV3 = 'live' | 'snapshot' | 'evidence';

interface EditorialV3Artifact {
  schemaVersion: 'route-editorial-workbench-v3';
  createdAt: string;
  caseId: string;
  provider: EditorialV3Provider;
  selectorFingerprint: string;
  candidateMapping: Array<{
    slot: string;
    canonicalId: string;
    siteId: string;
    entityIds: string[];
    evidenceIds: string[];
  }>;
  candidateSignalsCall: EditorialV3CallResult<CandidateSignalsV3>;
  routeJuryCall: EditorialV3CallResult<RouteJuryV3>;
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

function selectorFingerprint(): string {
  const hash = createHash('sha256');
  for (const relativePath of [
    '../../src/services/poi/EditorialSiteV3.ts',
    '../../src/services/poi/EditorialEvaluationInputV3.ts',
    '../../src/services/poi/EditorialSelectionV3.ts',
    '../../src/services/poi/EditorialRoutePortfolioV3.ts',
    'route-editorial-v3.ts',
  ]) hash.update(readFileSync(join(__dirname, relativePath)));
  return hash.digest('hex');
}

function selectedProvider(): EditorialV3Provider {
  const value = argumentValue('--provider') ?? 'deepseek-flash';
  if (value === 'deepseek-flash') return { kind: 'deepseek', model: EDITORIAL_V3_MODEL };
  if (value === 'ollama-gemma') return { kind: 'ollama', model: 'gemma4:26b' };
  throw new Error('--provider must be deepseek-flash or ollama-gemma');
}

function requiredOracleCount(evaluationCase: LoadedEditorialEvaluationCase): number {
  return evaluationCase.city === 'Madrid'
    ? evaluationCase.oracle.stops.length
    : Math.ceil(evaluationCase.oracle.stops.length * 0.8);
}

async function runCase(
  evaluationCase: LoadedEditorialEvaluationCase,
  mode: WorkbenchModeV3,
  provider: EditorialV3Provider,
  artifactPath: string
): Promise<Record<string, unknown>> {
  const loaded = await loadEditorialEvaluationInputV3(evaluationCase, fixtures);
  const signalRequest = buildCandidateSignalsRequestV3(loaded.readySites, {
    city: evaluationCase.city,
    theme: evaluationCase.theme,
    language: evaluationCase.language,
    requestedDuration: evaluationCase.durationMinutes,
  });
  const candidateMapping = loaded.readySites.map((site, index) => ({
    slot: `c${String(index).padStart(2, '0')}`,
    canonicalId: site.canonicalId,
    siteId: site.siteId,
    entityIds: site.entityIds,
    evidenceIds: site.evidenceFacts.map((fact) => fact.id),
  }));
  const candidateOracle = evaluationCase.oracle.stops.filter((anchor) => (
    loaded.readySites.some((site) => site.entityIds.includes(anchor.qid))
  ));
  const evidenceGate = {
    allSentSitesReady: loaded.readySites.every((site) => site.readiness.ready),
    candidateOracleCoverage: candidateOracle.length === evaluationCase.oracle.stops.length,
    candidateLimit: loaded.readySites.length <= 18,
  };
  if (mode === 'evidence') {
    return {
      case: evaluationCase.id,
      mode,
      candidateCount: loaded.readySites.length,
      evidenceGaps: loaded.evidenceGaps,
      candidateOracleCoverage: `${candidateOracle.length}/${evaluationCase.oracle.stops.length}`,
      sites: candidateMapping.map((mapping, index) => ({
        ...mapping,
        name: loaded.readySites[index].localName,
        readiness: loaded.readySites[index].readiness,
      })),
      gates: { ...evidenceGate, passed: Object.values(evidenceGate).every(Boolean) },
    };
  }
  if (!Object.values(evidenceGate).every(Boolean)) {
    throw new Error(`Evidence gate failed for ${evaluationCase.id}`);
  }

  let signalCall: EditorialV3CallResult<CandidateSignalsV3>;
  let juryCall: EditorialV3CallResult<RouteJuryV3>;
  if (mode === 'snapshot') {
    if (!existsSync(artifactPath)) throw new Error(`Missing v3 snapshot ${artifactPath}`);
    const artifact = readJson<EditorialV3Artifact>(artifactPath);
    if (artifact.selectorFingerprint !== selectorFingerprint()) throw new Error('V3 snapshot selector fingerprint changed');
    if (JSON.stringify(artifact.candidateMapping) !== JSON.stringify(candidateMapping)) {
      throw new Error('V3 snapshot candidate mapping changed');
    }
    const signals = validateCandidateSignalsV3(artifact.candidateSignalsCall.value, signalRequest);
    signalCall = { ...artifact.candidateSignalsCall, value: signals };
    const portfolio = optimizeEditorialRoutePortfolioV3(loaded.readySites, signals, evaluationCase.durationMinutes);
    const juryRequest = buildRouteJuryRequestV3(portfolio, {
      city: evaluationCase.city, theme: evaluationCase.theme, language: evaluationCase.language,
      requestedDuration: evaluationCase.durationMinutes,
    });
    juryCall = { ...artifact.routeJuryCall, value: validateRouteJuryV3(artifact.routeJuryCall.value, juryRequest) };
  } else {
    signalCall = await requestCandidateSignalsV3(signalRequest, provider, {
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
      ollamaHost: process.env.OLLAMA_HOST,
    });
    if (!signalCall.value) throw new Error(`Candidate signal curator failed: ${signalCall.status}`);
    const portfolio = optimizeEditorialRoutePortfolioV3(
      loaded.readySites, signalCall.value, evaluationCase.durationMinutes
    );
    if (portfolio.finalists.length !== 5) throw new Error(`Optimizer produced ${portfolio.finalists.length}, not five finalists`);
    const juryRequest = buildRouteJuryRequestV3(portfolio, {
      city: evaluationCase.city, theme: evaluationCase.theme, language: evaluationCase.language,
      requestedDuration: evaluationCase.durationMinutes,
    });
    juryCall = await requestRouteJuryV3(juryRequest, provider, {
      apiKey: process.env.DEEPSEEK_API_KEY?.trim(),
      ollamaHost: process.env.OLLAMA_HOST,
    });
    if (!juryCall.value) throw new Error(`Route jury failed: ${juryCall.status}`);
    const artifact: EditorialV3Artifact = {
      schemaVersion: 'route-editorial-workbench-v3',
      createdAt: new Date().toISOString(), caseId: evaluationCase.id, provider,
      selectorFingerprint: selectorFingerprint(), candidateMapping,
      candidateSignalsCall: signalCall, routeJuryCall: juryCall,
    };
    mkdirSync(join(artifactPath, '..'), { recursive: true });
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }

  const signals = signalCall.value as CandidateSignalsV3;
  const portfolio = optimizeEditorialRoutePortfolioV3(loaded.readySites, signals, evaluationCase.durationMinutes);
  const selected = selectRouteJuryWinnerV3(portfolio, juryCall.value as RouteJuryV3);
  const arc = buildDeterministicEditorialArcV3(selected.winner);
  const selectedEntityIds = new Set(selected.winner.sites.flatMap((site) => site.entityIds));
  const routeOracle = evaluationCase.oracle.stops.filter((anchor) => selectedEntityIds.has(anchor.qid));
  const greedy = composeWalkingRoute(loaded.readySites.map((site) => ({
    ...site,
    name: site.localName,
    importance_score: site.firstVisitScore,
    landmarkTier: site.tier === 'essential' ? 'flagship' : site.tier === 'strong' ? 'major' : 'supporting',
    historyPlaceScore: site.themeScore,
    wikidataId: site.canonicalId,
  })), evaluationCase.durationMinutes, evaluationCase.theme, { minStops: 5, maxStops: 8 });
  const greedyEntityIds = new Set(greedy.route.flatMap((site) => site.entityIds));
  const greedyOracle = evaluationCase.oracle.stops.filter((anchor) => greedyEntityIds.has(anchor.qid));
  const required = requiredOracleCount(evaluationCase);
  const gates = {
    ...evidenceGate,
    fiveFinalists: portfolio.finalists.length === 5,
    noPhysicallyViableNoRoute: portfolio.status !== 'no_route',
    withinRequestedDuration: portfolio.status === 'selected'
      && selected.winner.metrics.estimatedTourMinutes <= evaluationCase.durationMinutes,
    priorityCoverageMaximal: selected.winner.scores.priorityCovered === portfolio.maximumFeasiblePriorities,
    noDuplicateSites: new Set(selected.winner.sites.map((site) => site.siteId)).size === selected.winner.sites.length,
    noOverlongSegments: selected.winner.metrics.overMaxSegments === 0,
    requiredRouteOracleCoverage: routeOracle.length >= required,
    oracleNotBelowGreedy: routeOracle.length >= greedyOracle.length,
    arcCovered: arc.arc.every((role) => arc.assignments.some((assignment) => assignment.role === role)),
  };
  return {
    case: { id: evaluationCase.id, mode, city: evaluationCase.city, requestedDuration: evaluationCase.durationMinutes },
    reproducibility: {
      provider, selectorFingerprint: selectorFingerprint(),
      signalPromptFingerprint: signalCall.promptFingerprint,
      juryPromptFingerprint: juryCall.promptFingerprint,
      artifact: artifactPath,
    },
    candidateSet: {
      prefiltered: loaded.prefilteredCount,
      acceptedSites: loaded.sites.length,
      readySites: loaded.readySites.length,
      evidenceGaps: loaded.evidenceGaps,
      oracleCoverage: `${candidateOracle.length}/${evaluationCase.oracle.stops.length}`,
    },
    signals: candidateMapping.map((mapping, index) => ({
      ...mapping,
      name: loaded.readySites[index].localName,
      assessment: signals.signals[mapping.slot],
    })),
    portfolio: {
      status: portfolio.status,
      priority: `${portfolio.maximumFeasiblePriorities}/${portfolio.priorityTotal}`,
      exploredStateCount: portfolio.exploredStateCount,
      finalists: portfolio.finalists.map((route) => ({
        slot: route.slot,
        stops: route.sites.map((site) => site.localName),
        metrics: route.metrics,
        scores: route.scores,
        jury: (juryCall.value as RouteJuryV3).scores[route.slot],
      })),
    },
    selectedRoute: {
      slot: selected.winner.slot,
      juryScore: selected.juryScore,
      actualDuration: selected.winner.metrics.estimatedTourMinutes,
      walkingMeters: selected.winner.metrics.walkingMeters,
      stops: selected.winner.sites.map((site, index) => ({
        position: index + 1, name: site.localName, canonicalId: site.canonicalId, entityIds: site.entityIds,
      })),
      arc,
    },
    coverage: {
      oracle: `${routeOracle.length}/${evaluationCase.oracle.stops.length}`,
      required,
      missingOracle: evaluationCase.oracle.stops.filter((anchor) => !selectedEntityIds.has(anchor.qid)).map((anchor) => anchor.name),
      greedyOracle: `${greedyOracle.length}/${evaluationCase.oracle.stops.length}`,
    },
    gates: { ...gates, passed: Object.values(gates).every(Boolean) },
  };
}

async function main(): Promise<void> {
  if (hasFlag('--allow-holdout')) throw new Error('V3 calibration workbench intentionally refuses holdouts');
  const mode = (argumentValue('--mode') ?? 'evidence') as WorkbenchModeV3;
  if (!['live', 'snapshot', 'evidence'].includes(mode)) throw new Error('--mode must be live, snapshot, or evidence');
  if (mode === 'live' && !hasFlag('--allow-external') && selectedProvider().kind === 'deepseek') {
    throw new Error('DeepSeek live mode requires --allow-external');
  }
  const cases = loadEditorialEvaluationCases(manifestPath);
  const requested = argumentValue('--case') ?? 'madrid-history-es-120';
  const selectedCases = hasFlag('--all') ? cases : cases.filter((item) => item.id === requested);
  if (selectedCases.length === 0) throw new Error(`Unknown calibration case ${requested}`);
  const provider = selectedProvider();
  const runId = argumentValue('--run-id') ?? new Date().toISOString().replace(/[:.]/g, '-');
  const requestedArtifact = argumentValue('--artifact');
  if (mode === 'snapshot' && selectedCases.length > 1 && requestedArtifact) {
    throw new Error('--artifact can only replay one case');
  }
  const outputDirectory = join(fixtures, 'editorial-v3', runId);
  const results = [];
  for (const evaluationCase of selectedCases) {
    const artifactPath = requestedArtifact
      ? join(process.cwd(), requestedArtifact)
      : join(outputDirectory, `${evaluationCase.id}.json`);
    console.log(`[editorial-v3] ${mode} ${evaluationCase.id} ${basename(artifactPath)}`);
    const result = await runCase(evaluationCase, mode, provider, artifactPath);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }
  if (mode !== 'evidence') {
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, 'summary.json'), `${JSON.stringify({
      schemaVersion: 'route-editorial-workbench-v3', createdAt: new Date().toISOString(), mode, provider,
      holdoutLoaded: false, results,
    }, null, 2)}\n`);
  }
  if (results.some((result) => !(result.gates as { passed: boolean }).passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[route-editorial-v3] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
