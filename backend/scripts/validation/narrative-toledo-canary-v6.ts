import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import candidates from '../../fixtures/candidates/toledo-history.json';
import oracle from '../../fixtures/oracle/toledo-history-es-120.json';
import sources from '../../fixtures/sources/toledo-history-es.json';
import {
  createDeepSeekNarrativeArcArchitectV6,
} from '../../src/services/poi/NarrativeArcArchitectV6';
import { buildNarrativeRouteBriefV6 } from '../../src/services/poi/NarrativeContractsV6';
import { createNarrativeEditorialAgentsV6 } from '../../src/services/poi/NarrativeEditorialAgentsV6';
import {
  buildNarrativeReviewPackageV6,
  runNarrativeEditorialWorkflowV6,
} from '../../src/services/poi/NarrativeEditorialWorkflowV6';
import {
  createDeepSeekNarrativeResearchCuratorV6,
  researchNarrativeStopV6,
} from '../../src/services/poi/NarrativeResearchV6';
import { FirecrawlNarrativeSourceProviderV6 } from '../../src/services/poi/NarrativeSourcesV6';
import { runNarrativeToledoCanaryV6 } from '../../src/services/poi/NarrativeToledoCanaryV6';

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function reportPassed(path: string, gateName: string): void {
  const report = JSON.parse(readFileSync(resolve(path), 'utf8')) as {
    gate?: { status?: string };
  };
  if (report.gate?.status !== 'passed') {
    throw new Error(`${gateName} report has not passed`);
  }
}

function requiredSecret(name: 'DEEPSEEK_API_KEY' | 'FIRECRAWL_API_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function redact(error: unknown, secrets: string[]): string {
  return secrets.reduce(
    (message, secret) => message.split(secret).join('[REDACTED]'),
    error instanceof Error ? error.message : String(error)
  );
}

async function main(): Promise<void> {
  if (!process.argv.includes('--generate') || !process.argv.includes('--allow-external')) {
    throw new Error('Toledo canary requires --generate --allow-external');
  }
  const gateAPath = option('--gate-a-report');
  const gateBPath = option('--gate-b-report');
  if (!gateAPath || !gateBPath) {
    throw new Error('Toledo canary requires --gate-a-report and --gate-b-report');
  }
  reportPassed(gateAPath, 'Madrid gate A');
  reportPassed(gateBPath, 'Madrid gate B');

  const apiKey = requiredSecret('DEEPSEEK_API_KEY');
  const firecrawlKey = requiredSecret('FIRECRAWL_API_KEY');
  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the Gemma auditor');
  const runId = option('--run-id')
    ?? `toledo-v6-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const directory = resolve(process.cwd(), 'tmp/narrative-v6', runId);
  mkdirSync(directory, { recursive: true });
  const privatePath = resolve(directory, 'diagnostics.private.json');
  const reviewPath = resolve(directory, 'review.json');
  const route = buildNarrativeRouteBriefV6({ candidates, oracle, sources, country: 'España' });
  const sourceProvider = new FirecrawlNarrativeSourceProviderV6({ apiKey: firecrawlKey });
  const curator = createDeepSeekNarrativeResearchCuratorV6({ apiKey });
  const architect = createDeepSeekNarrativeArcArchitectV6({ apiKey });
  const agents = createNarrativeEditorialAgentsV6({ apiKey, ollamaHost });
  const createdAt = new Date().toISOString();
  const canary = await runNarrativeToledoCanaryV6({
    runId,
    createdAt,
    route,
    privateArtifactPath: privatePath,
    voiceProfile: [
      'Anfitrión local cálido, inteligente y directo; histórico sin tono académico ni teatral.',
      'Dos o tres minutos orientativos por parada, sin rellenar para alcanzar una cuota.',
      'Toda afirmación verificable procede del dossier.',
      'Las objeciones abren ventanas locales, nunca una regeneración global.',
    ],
  }, {
    research: (stop) => researchNarrativeStopV6({
      stop, language: route.language, sourceProvider, curator,
    }),
    buildArc: async (input) => (await architect.build(input)).arc,
    runEditorial: (input) => runNarrativeEditorialWorkflowV6({
      runId,
      createdAt,
      route: input.route,
      dossiers: input.dossiers,
      arc: input.arc,
      voiceProfile: input.voiceProfile,
      privateArtifactPath: privatePath,
    }, agents),
  });
  const dossiers = canary.research.flatMap((result) => result.dossier ? [result.dossier] : []);
  const publicReview = canary.editorial
    ? buildNarrativeReviewPackageV6(canary.editorial, dossiers)
    : null;
  writeFileSync(privatePath, JSON.stringify({
    research: canary.research.map((result) => ({
      stopId: result.stopId,
      captures: result.captures,
      diagnostic: result.diagnostic,
    })),
    editorial: canary.editorial?.privateDiagnostics,
  }, null, 2));
  const publicArtifact = {
    schemaVersion: 'narrative-toledo-canary-v6',
    runId,
    createdAt,
    canaryVerdict: canary.canaryVerdict,
    run: canary.run,
    research: canary.research.map((result) => ({
      stopId: result.stopId,
      status: result.status,
      stats: result.stats,
      reason: result.reason,
      dossier: result.dossier,
    })),
    review: publicReview,
  };
  writeFileSync(reviewPath, JSON.stringify(publicArtifact, null, 2));
  process.stdout.write(`${JSON.stringify({
    schemaVersion: publicArtifact.schemaVersion,
    runId,
    canaryVerdict: canary.canaryVerdict,
    runStatus: canary.run.status,
    stopsResearched: canary.research.map((result) => ({
      stopId: result.stopId, status: result.status, stats: result.stats,
    })),
    review: reviewPath,
    privateDiagnostics: privatePath,
  }, null, 2)}\n`);
  if (!['ready_for_human_gate', 'principled_refusal_pending_human'].includes(canary.canaryVerdict)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const secrets = [process.env.DEEPSEEK_API_KEY, process.env.FIRECRAWL_API_KEY]
    .filter((value): value is string => Boolean(value));
  process.stderr.write(`${redact(error, secrets)}\n`);
  process.exitCode = 1;
});
