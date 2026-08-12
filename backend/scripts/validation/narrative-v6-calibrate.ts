import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import manifestJson from '../../fixtures/narrative-madrid-v6/reference.json';
import rubricJson from '../../fixtures/narrative-madrid-v6/research-rubric.json';
import mutationsJson from '../../fixtures/narrative-madrid-v6/editorial-mutations.json';
import {
  evaluateNarrativeEditorialGateV6,
  evaluateNarrativeResearchGateV6,
  validateNarrativeMadridResearchRubricV6,
} from '../../src/services/poi/NarrativeCalibrationV6';
import {
  buildNarrativeAuditObjectionsV6,
  assignNarrativeSentenceIdsV6,
  auditNarrativeScriptDeterministicallyV6,
} from '../../src/services/poi/NarrativeEditorialV6';
import { createNarrativeEditorialAgentsV6 } from '../../src/services/poi/NarrativeEditorialAgentsV6';
import { runNarrativeEditorialWorkflowV6 } from '../../src/services/poi/NarrativeEditorialWorkflowV6';
import {
  loadNarrativeMadridDocumentsV6,
  validateNarrativeMadridCorpusV6,
} from '../../src/services/poi/NarrativeMadridCorpusV6';
import {
  buildMadridNarrativeArcV6,
  buildMadridNarrativeRouteBriefV6,
  buildTrustedMadridDossiersV6,
} from '../../src/services/poi/NarrativeMadridTrustedFixturesV6';
import {
  createDeepSeekNarrativeResearchCuratorV6,
  createDeepSeekNarrativeSearchPlannerV6,
  NarrativeResearchStopResultV6,
  researchNarrativeStopV6,
} from '../../src/services/poi/NarrativeResearchV6';
import {
  FirecrawlNarrativeSourceProviderV6,
  NarrativeCapturedSourceV6,
  NarrativeSourceProviderV6,
  ReplayNarrativeSourceProviderV6,
} from '../../src/services/poi/NarrativeSourcesV6';

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function requiredSecret(name: 'DEEPSEEK_API_KEY' | 'FIRECRAWL_API_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error: unknown, secrets: string[]): string {
  return secrets.reduce(
    (message, secret) => message.split(secret).join('[REDACTED]'),
    error instanceof Error ? error.message : String(error)
  );
}

function outputPaths(gate: string) {
  const runId = option('--run-id') ?? `madrid-gate-${gate}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const directory = resolve(process.cwd(), 'tmp/narrative-v6', runId);
  mkdirSync(directory, { recursive: true });
  return {
    runId,
    publicPath: resolve(directory, 'review.json'),
    privatePath: resolve(directory, 'diagnostics.private.json'),
  };
}

const manifest = validateNarrativeMadridCorpusV6(manifestJson);
const documents = loadNarrativeMadridDocumentsV6(
  manifest,
  (path) => readFileSync(resolve(process.cwd(), '..', path), 'utf8')
);
const route = buildMadridNarrativeRouteBriefV6(manifest);
const dossiers = buildTrustedMadridDossiersV6(manifest, documents);

async function gateA(apiKey: string, ollamaHost: string): Promise<void> {
  const paths = outputPaths('a');
  const agents = createNarrativeEditorialAgentsV6({ apiKey, ollamaHost });
  const workflow = await runNarrativeEditorialWorkflowV6({
    runId: paths.runId,
    createdAt: new Date().toISOString(),
    route,
    dossiers,
    arc: buildMadridNarrativeArcV6(manifest),
    voiceProfile: [
      manifest.voiceProfile.description,
      manifest.voiceProfile.durationGuidance,
      ...manifest.voiceProfile.rules,
    ],
    privateArtifactPath: paths.privatePath,
  }, agents);
  const privateMutationDiagnostics: unknown[] = [];
  const mutations = [];
  if (!Array.isArray(mutationsJson.mutations)) throw new Error('mutation fixture is malformed');
  for (const mutation of mutationsJson.mutations) {
    const dossier = dossiers.find((item) => item.stopId === mutation.stopId);
    if (!dossier) throw new Error(`mutation ${mutation.mutationId} has unknown stop`);
    const script = assignNarrativeSentenceIdsV6(mutation.stopId, mutation.text);
    let detected = false;
    if (mutation.detector === 'deterministic') {
      detected = auditNarrativeScriptDeterministicallyV6(script, {
        language: 'es', authorizedNumbers: dossier.authorizedNumbers,
      }).some((warning) => warning.severity === 'hard');
    } else if (mutation.detector === 'global') {
      const result = await agents.auditTour({ promise: manifest.promise, scripts: [script] });
      privateMutationDiagnostics.push(result.diagnostic);
      detected = result.value.issues.some((issue) => issue.severity === 'hard');
    } else {
      const reports = await Promise.all([
        agents.audit({ script, dossier }, 'deepseek'),
        agents.audit({ script, dossier }, 'gemma'),
      ]);
      privateMutationDiagnostics.push(...reports.map((result) => result.diagnostic));
      detected = buildNarrativeAuditObjectionsV6(reports.map((result) => result.value)).length > 0;
    }
    mutations.push({ mutationId: mutation.mutationId, detected });
  }
  const writerFingerprints = workflow.metrics
    .filter((item) => item.callId.includes('-writer-'))
    .map((item) => item.promptFingerprint);
  const promptFingerprint = writerFingerprints[0] ?? 'missing';
  const status = workflow.run.status;
  const gate = evaluateNarrativeEditorialGateV6({
    developmentStopIds: manifest.developmentStopIds,
    validationStopIds: manifest.validationStopIds,
    stopOutcomes: manifest.stops.map((stop) => ({
      stopId: stop.stopId,
      status,
      promptFingerprint,
    })),
    mutations,
  });
  const review = {
    schemaVersion: 'narrative-madrid-editorial-gate-v6',
    runId: paths.runId,
    gate,
    workflowStatus: workflow.run.status,
    workflowRun: workflow.run,
    developmentStopIds: manifest.developmentStopIds,
    validationStopIds: manifest.validationStopIds,
    mutations,
    scripts: workflow.stops.map((stop) => ({ stopId: stop.stopId, text: stop.finalScript.text })),
    warnings: workflow.warnings,
    metrics: workflow.metrics,
    privateDiagnosticsPath: paths.privatePath,
  };
  writeFileSync(paths.privatePath, JSON.stringify({
    workflow: workflow.privateDiagnostics,
    mutations: privateMutationDiagnostics,
  }, null, 2));
  writeFileSync(paths.publicPath, JSON.stringify(review, null, 2));
  process.stdout.write(`${JSON.stringify({ ...review, scripts: undefined, output: paths.publicPath }, null, 2)}\n`);
  if (gate.status !== 'passed') process.exitCode = 1;
}

async function gateB(apiKey: string, firecrawlKey?: string): Promise<void> {
  const paths = outputPaths('b');
  const rubric = validateNarrativeMadridResearchRubricV6(rubricJson);
  const stage = option('--stage') ?? 'spot-check';
  if (stage !== 'spot-check' && stage !== 'full') throw new Error('--stage must be spot-check or full');
  const humanSpotCheck = option('--human-spot-check') ?? 'pending';
  if (!['pending', 'accepted', 'rejected'].includes(humanSpotCheck)) {
    throw new Error('--human-spot-check must be pending, accepted or rejected');
  }
  if (stage === 'full' && humanSpotCheck === 'pending') {
    throw new Error('full gate B requires an explicit accepted or rejected human spot-check');
  }
  if (stage === 'spot-check' && humanSpotCheck !== 'pending') {
    throw new Error('spot-check stage always remains pending; accept or reject it in the full stage');
  }
  const selectedRubric = stage === 'spot-check' ? { ...rubric, stops: [rubric.stops[0]] } : rubric;
  const replayPrivatePath = option('--replay-private');
  let sourceProvider: NarrativeSourceProviderV6;
  let replayQueries: string[] | undefined;
  if (replayPrivatePath) {
    if (stage !== 'spot-check') throw new Error('--replay-private is supported only for spot-check');
    const replay = JSON.parse(readFileSync(resolve(replayPrivatePath), 'utf8')) as Array<{
      captures?: NarrativeCapturedSourceV6[];
      searchDiagnostic?: { value?: { queries?: string[] } };
    }>;
    if (!Array.isArray(replay) || !Array.isArray(replay[0]?.captures)) {
      throw new Error('research replay does not contain captured pages');
    }
    sourceProvider = new ReplayNarrativeSourceProviderV6(replay[0].captures);
    replayQueries = replay[0].searchDiagnostic?.value?.queries;
  } else {
    if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY is required without a replay');
    sourceProvider = new FirecrawlNarrativeSourceProviderV6({ apiKey: firecrawlKey });
  }
  const curator = createDeepSeekNarrativeResearchCuratorV6({ apiKey });
  const searchPlanner = replayQueries
    ? { plan: async () => ({ queries: replayQueries as string[] }) }
    : createDeepSeekNarrativeSearchPlannerV6({ apiKey });
  const results: NarrativeResearchStopResultV6[] = [];
  let humanReview: Record<string, string> | undefined;
  if (stage === 'full') {
    const spotCheckPath = option('--spot-check-report');
    const reviewedBy = option('--reviewed-by');
    const reviewReason = option('--review-reason');
    if (!spotCheckPath || !reviewedBy || !reviewReason) {
      throw new Error(
        'full gate B requires --spot-check-report, --reviewed-by and --review-reason'
      );
    }
    const spotCheck = JSON.parse(readFileSync(resolve(spotCheckPath), 'utf8')) as {
      stage?: string;
      gate?: { status?: string };
      stops?: NarrativeResearchStopResultV6[];
    };
    const reviewed = spotCheck.stops?.[0];
    if (spotCheck.stage !== 'spot-check'
      || spotCheck.gate?.status !== 'human_spot_check_required'
      || reviewed?.status !== 'sufficient'
      || !reviewed.dossier?.fingerprint) {
      throw new Error('spot-check report is not a reviewable sufficient Madrid dossier');
    }
    results.push({ ...reviewed, captures: [] });
    humanReview = {
      decision: humanSpotCheck,
      reviewedBy,
      reason: reviewReason,
      reviewedAt: new Date().toISOString(),
      dossierFingerprint: reviewed.dossier.fingerprint,
      sourceReport: resolve(spotCheckPath),
    };
  }
  for (const reference of selectedRubric.stops) {
    if (results.some((result) => result.stopId === reference.stopId)) continue;
    const stop = route.stops.find((item) => item.stopId === reference.stopId);
    if (!stop) throw new Error(`research rubric references unknown stop ${reference.stopId}`);
    results.push(await researchNarrativeStopV6({
      stop, city: route.city, language: route.language, sourceProvider, curator,
      searchPlanner,
      calibrationExpectedSufficient: true,
    }));
  }
  const outcomes = results.map((result) => ({
    stopId: result.stopId,
    status: result.status === 'sufficient'
      ? 'sufficient' as const
      : result.status === 'evidence_review_required'
        ? 'evidence_review_required' as const
        : 'failed' as const,
    dossier: result.dossier,
  }));
  const gate = evaluateNarrativeResearchGateV6({
    rubric: selectedRubric,
    outcomes,
    humanSpotCheck: humanSpotCheck as 'pending' | 'accepted' | 'rejected',
  });
  const review = {
    schemaVersion: 'narrative-madrid-research-gate-v6',
    runId: paths.runId,
    stage,
    gate,
    humanReview,
    stops: results.map((result) => ({
      stopId: result.stopId,
      status: result.status,
      stats: result.stats,
      reason: result.reason,
      dossier: result.dossier,
    })),
    privateDiagnosticsPath: paths.privatePath,
  };
  writeFileSync(paths.privatePath, JSON.stringify(results.map((result) => ({
    stopId: result.stopId,
    captures: result.captures,
    captureErrors: result.captureErrors,
    searchDiagnostic: result.searchDiagnostic,
    diagnostic: result.diagnostic,
  })), null, 2));
  writeFileSync(paths.publicPath, JSON.stringify(review, null, 2));
  process.stdout.write(`${JSON.stringify({ ...review, stops: review.stops.map((stop) => ({
    stopId: stop.stopId, status: stop.status, stats: stop.stats, reason: stop.reason,
  })), output: paths.publicPath }, null, 2)}\n`);
  if (gate.status === 'model_calibration_failed') process.exitCode = 1;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--generate') || !process.argv.includes('--allow-external')) {
    throw new Error('calibration requires --generate --allow-external');
  }
  const gate = option('--gate');
  const apiKey = requiredSecret('DEEPSEEK_API_KEY');
  if (gate === 'a') {
    const ollamaHost = process.env.OLLAMA_HOST?.trim();
    if (!ollamaHost) throw new Error('OLLAMA_HOST is required for gate A');
    await gateA(apiKey, ollamaHost);
    return;
  }
  if (gate === 'b') {
    await gateB(
      apiKey,
      option('--replay-private') ? undefined : requiredSecret('FIRECRAWL_API_KEY')
    );
    return;
  }
  throw new Error('--gate must be a or b');
}

main().catch((error) => {
  const secrets = [process.env.DEEPSEEK_API_KEY, process.env.FIRECRAWL_API_KEY]
    .filter((value): value is string => Boolean(value));
  process.stderr.write(`${safeError(error, secrets)}\n`);
  process.exitCode = 1;
});
