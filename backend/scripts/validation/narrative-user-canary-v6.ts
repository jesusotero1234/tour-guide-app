import 'dotenv/config';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { TourRequest } from '../../src/types/api';
import { orchestrationService } from '../../src/services/orchestrationService';
import { createNarrativeArcArchitectV6 } from '../../src/services/poi/NarrativeArcArchitectV6';
import {
  NarrativeTourScorecardV6,
  createNarrativeEditorialAgentsV6,
  reviewNarrativeTourScorecardV6,
} from '../../src/services/poi/NarrativeEditorialAgentsV6';
import {
  buildNarrativeReviewPackageV6,
  runNarrativeEditorialWorkflowV6,
} from '../../src/services/poi/NarrativeEditorialWorkflowV6';
import {
  NarrativeTourCallSummaryV6,
  renderBlockedNarrativeScorecardMarkdownV6,
  renderNarrativeTourMarkdownV6,
} from '../../src/services/poi/NarrativeMarkdownV6';
import { NarrativeProgressSpendGuardV6 } from '../../src/services/poi/NarrativeProgressSpendGuardV6';
import {
  createNarrativeResearchCuratorV6,
  createNarrativeSearchPlannerV6,
  researchNarrativeStopsV6,
} from '../../src/services/poi/NarrativeResearchV6';
import { createNarrativeSchedulerV6 } from '../../src/services/poi/NarrativeSchedulerV6';
import { FirecrawlNarrativeSourceProviderV6 } from '../../src/services/poi/NarrativeSourcesV6';
import { buildNarrativeRouteFromStructuralTourV6 } from '../../src/services/poi/NarrativeStructuralRouteV6';
import {
  EditorialCallResultV6,
  EditorialPricingV6,
  EditorialProgressCallbackV6,
} from '../../src/services/poi/EditorialStructuredLlmV6';
import {
  openRouterPricingFromPreflightV6,
  preflightBalancedOpenRouterV6,
} from '../../src/services/poi/OpenRouterPreflightV6';

const SPEND_LIMIT_USD = 2;
const DEADLINE_MS = 30 * 60 * 1_000;
const request: TourRequest = {
  city: 'Barcelona', country: 'España', countryCode: 'ES',
  theme: 'history', language: 'es', durationMinutes: 120,
};

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function requiredSecret(name: 'DEEPSEEK_API_KEY' | 'OPENROUTER_API_KEY') {
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

function diagnosticsFromResearch(result: {
  searchDiagnostic?: EditorialCallResultV6<unknown>;
  diagnostic?: EditorialCallResultV6<unknown>;
  complexDiagnostic?: EditorialCallResultV6<unknown>;
}): EditorialCallResultV6<unknown>[] {
  return [result.searchDiagnostic, result.diagnostic, result.complexDiagnostic]
    .filter((item): item is EditorialCallResultV6<unknown> => Boolean(item));
}

function summarizeCalls(diagnostics: EditorialCallResultV6<unknown>[]): NarrativeTourCallSummaryV6[] {
  const groups = new Map<string, {
    model: string; provider: string; calls: number; latencyMs: number;
    costs: Array<number | undefined>;
  }>();
  for (const diagnostic of diagnostics) {
    const model = diagnostic.actualModel ?? diagnostic.requestedModel ?? diagnostic.model;
    const provider = diagnostic.actualProvider
      ?? diagnostic.requestedEndpoint ?? 'proveedor no informado';
    const key = `${model}\n${provider}`;
    const group = groups.get(key) ?? { model, provider, calls: 0, latencyMs: 0, costs: [] };
    group.calls += 1;
    group.latencyMs += diagnostic.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0);
    group.costs.push(diagnostic.usage?.costUsd);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    model: group.model,
    provider: group.provider,
    calls: group.calls,
    latencyMs: group.latencyMs,
    costUsd: group.costs.some((cost) => cost === undefined)
      ? null : group.costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
  }));
}

function failureMarkdown(input: {
  routeNames?: string[];
  reason: string;
  workflowStatus?: string;
}): string {
  return [
    '# Canary de tour de Barcelona',
    '',
    '> **Estado:** no aprobado.',
    `> **Petición:** Barcelona, España · history · es · 120 min.`,
    '',
    '## Resultado',
    '',
    input.reason,
    '',
    ...(input.workflowStatus ? [`Workflow: \`${input.workflowStatus}\`.`, ''] : []),
    '## Ruta elegida por el producto',
    '',
    ...(input.routeNames?.length
      ? input.routeNames.map((name, index) => `${index + 1}. ${name}`)
      : ['La selección estructural no llegó a producir una ruta válida.']),
    '',
    'No se ejecutaron TTS ni persistencia de tour.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  if (!process.argv.includes('--generate') || !process.argv.includes('--allow-external')) {
    throw new Error('user canary requires --generate --allow-external');
  }
  const profile = option('--profile') ?? 'balanced_openrouter';
  if (profile !== 'balanced_openrouter') {
    throw new Error('Barcelona user canary requires --profile=balanced_openrouter');
  }
  const priorSpendUsd = Number(option('--prior-spend-usd'));
  if (!Number.isFinite(priorSpendUsd) || priorSpendUsd < 0 || priorSpendUsd > SPEND_LIMIT_USD) {
    throw new Error('--prior-spend-usd is required and must preserve the cumulative spend below $2');
  }
  const runId = option('--run-id')
    ?? `barcelona-user-canary-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const directory = resolve(process.cwd(), 'tmp/narrative-v6', runId);
  const reviewPath = resolve(directory, 'review.json');
  const privatePath = resolve(directory, 'diagnostics.private.json');
  const progressPath = resolve(directory, 'progress.private.jsonl');
  const markdownPath = resolve(directory, 'tour.md');
  if ([reviewPath, privatePath, progressPath, markdownPath].some(existsSync)) {
    throw new Error(`canary run ${runId} already contains artifacts`);
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(progressPath, '', { flag: 'wx' });
  const spendGuard = new NarrativeProgressSpendGuardV6({
    limitUsd: SPEND_LIMIT_USD,
    historicalSpendUsd: priorSpendUsd,
    path: option('--spend-ledger') ?? resolve(directory, 'spend.private.jsonl'),
  });
  const abortController = new AbortController();
  const deadline = setTimeout(() => abortController.abort(
    new Error(`Barcelona user canary exceeded ${DEADLINE_MS}ms`)
  ), DEADLINE_MS);
  deadline.unref?.();
  const onProgress: EditorialProgressCallbackV6 = (event) => {
    const budget = spendGuard.record(event);
    appendFileSync(progressPath, `${JSON.stringify({ ...event, budget })}\n`);
  };
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY?.trim() || undefined;
  const secrets = [
    requiredSecret('DEEPSEEK_API_KEY'),
    requiredSecret('OPENROUTER_API_KEY'),
    ...(firecrawlApiKey ? [firecrawlApiKey] : []),
  ];
  let routeNames: string[] | undefined;
  try {
    const preflight = await preflightBalancedOpenRouterV6({ signal: abortController.signal });
    if (preflight.status !== 'ready') {
      throw new Error(`OpenRouter endpoint preflight failed: ${preflight.issues.join('; ')}`);
    }
    const openRouterPricing: Record<string, EditorialPricingV6> =
      openRouterPricingFromPreflightV6(preflight);
    const structuralTour = await orchestrationService.selectStructuralTour(request);
    routeNames = structuralTour.places.map((place) => (
      place.nameInTourLanguage ?? place.name
    ));
    const route = buildNarrativeRouteFromStructuralTourV6({ request, structuralTour });
    const scheduler = createNarrativeSchedulerV6(profile, {
      researchStops: 2, editorialStops: 2, writers: 2, auditStops: 2,
    });
    const modelOptions = {
      apiKey: secrets[0], openRouterApiKey: secrets[1], profile, runId,
      openRouterPricing, requestTimeoutMs: 180_000,
      signal: abortController.signal, onProgress,
    };
    const sourceProvider = new FirecrawlNarrativeSourceProviderV6({
      baseUrl: process.env.FIRECRAWL_BASE_URL?.trim() || 'http://127.0.0.1:3007/v2',
      apiKey: firecrawlApiKey,
    });
    const research = await researchNarrativeStopsV6({
      stops: route.stops,
      city: route.city,
      language: route.language,
      sourceProvider,
      curator: createNarrativeResearchCuratorV6(modelOptions),
      searchPlanner: createNarrativeSearchPlannerV6(modelOptions),
      scheduler,
    });
    const insufficient = research.filter((result) => result.status !== 'sufficient');
    const researchDiagnostics = research.flatMap(diagnosticsFromResearch);
    if (insufficient.length > 0) {
      const reason = insufficient.map((result) => (
        `${result.stopId}: ${result.status}${result.reason ? ` — ${result.reason}` : ''}`
      )).join('; ');
      const publicArtifact = {
        schemaVersion: 'narrative-user-canary-v6', runId, request, route,
        routeDiagnostics: structuralTour.routeDiagnostics,
        status: 'research_failed', reason,
        research: research.map((result) => ({
          stopId: result.stopId, status: result.status, stats: result.stats, reason: result.reason,
          dossier: result.dossier,
        })),
        budget: spendGuard.snapshot(),
      };
      writeFileSync(privatePath, `${JSON.stringify({ research }, null, 2)}\n`);
      writeFileSync(reviewPath, `${JSON.stringify(publicArtifact, null, 2)}\n`);
      writeFileSync(markdownPath, `${failureMarkdown({ routeNames, reason })}\n`);
      throw new Error(reason);
    }
    const dossiers = research.map((result) => result.dossier!);
    const architectResult = await createNarrativeArcArchitectV6(modelOptions).build({ route, dossiers });
    const agents = createNarrativeEditorialAgentsV6(modelOptions);
    const editorial = await runNarrativeEditorialWorkflowV6({
      runId, createdAt: new Date().toISOString(), route, dossiers,
      arc: architectResult.arc,
      voiceProfile: [
        'Anfitrión local cálido, inteligente y directo; histórico sin tono académico ni teatral.',
        'Español oral y natural, con observaciones visibles y orientación segura.',
        'Toda afirmación verificable procede del dossier.',
        'Cada parada contribuye de forma distinta a la promesa del recorrido.',
      ],
      privateArtifactPath: privatePath,
    }, agents, {
      scheduler, profile, signal: abortController.signal, onProgress,
      maximumAdditionalRepairs: 1,
    });
    const hardWarnings = editorial.warnings.filter((warning) => warning.severity === 'hard');
    const wordCounts = editorial.stops.map((stop) => ({
      stopId: stop.stopId,
      words: stop.finalScript.text.trim().split(/\s+/u).length,
    }));
    const automaticChecks = {
      workflowReady: editorial.run.status === 'ready_for_human_gate',
      hardWarningCount: hardWarnings.length,
      progressionWorks: editorial.tourAudit?.progressionWorks ?? false,
      promiseDelivered: editorial.tourAudit?.promiseDelivered ?? false,
      closingWorks: editorial.tourAudit?.closingWorks ?? false,
      wordCounts,
      wordCountsInRange: wordCounts.every((item) => item.words >= 330 && item.words <= 470),
      audioGenerated: false,
      tourPersisted: false,
    };
    let scorecardResult: Awaited<ReturnType<typeof reviewNarrativeTourScorecardV6>> | undefined;
    if (automaticChecks.workflowReady && automaticChecks.hardWarningCount === 0
      && automaticChecks.progressionWorks && automaticChecks.promiseDelivered
      && automaticChecks.closingWorks && automaticChecks.wordCountsInRange) {
      scorecardResult = await reviewNarrativeTourScorecardV6(modelOptions, {
        promise: architectResult.arc.promise,
        scripts: editorial.stops.map((stop) => stop.finalScript),
        dossiers,
      }, { signal: abortController.signal, onProgress });
    }
    spendGuard.assertSettled();
    const scorecard: NarrativeTourScorecardV6 | null = scorecardResult?.value ?? null;
    const approved = automaticChecks.workflowReady && scorecard?.decision === 'Approve';
    const allDiagnostics = [
      ...researchDiagnostics,
      ...(architectResult.diagnostic ? [architectResult.diagnostic] : []),
      ...editorial.privateDiagnostics,
      ...(scorecardResult ? [scorecardResult.diagnostic] : []),
    ];
    const reviewPackage = buildNarrativeReviewPackageV6(editorial, dossiers);
    const publicArtifact = {
      schemaVersion: 'narrative-user-canary-v6', runId, request,
      status: approved ? 'approved' : 'request_changes',
      route,
      routeDiagnostics: structuralTour.routeDiagnostics,
      confidenceInput: structuralTour.confidenceInput,
      research: research.map((result) => ({
        stopId: result.stopId, status: result.status, stats: result.stats, dossier: result.dossier,
      })),
      arc: architectResult.arc,
      review: reviewPackage,
      automaticChecks,
      scorecard,
      calls: summarizeCalls(allDiagnostics),
      budget: spendGuard.snapshot(),
      audioGenerated: false,
      tourPersisted: false,
    };
    writeFileSync(privatePath, `${JSON.stringify({
      research, architect: architectResult.diagnostic ?? null,
      editorial: editorial.privateDiagnostics,
      scorecard: scorecardResult?.diagnostic ?? null,
    }, null, 2)}\n`);
    writeFileSync(reviewPath, `${JSON.stringify(publicArtifact, null, 2)}\n`);
    const markdown = scorecard
      ? renderNarrativeTourMarkdownV6({
        request, route, routeDiagnostics: structuralTour.routeDiagnostics,
        promise: architectResult.arc.promise,
        centralQuestion: architectResult.arc.centralQuestion,
        scripts: editorial.stops.map((stop) => stop.finalScript),
        dossiers,
        workflowStatus: editorial.run.status,
        scorecard,
        calls: publicArtifact.calls,
        budget: publicArtifact.budget,
      })
      : [
        failureMarkdown({
          routeNames, workflowStatus: editorial.run.status,
          reason: 'Las condiciones automáticas impidieron ejecutar el scorecard.',
        }),
        renderBlockedNarrativeScorecardMarkdownV6({
          city: request.city, workflowStatus: editorial.run.status,
          hardWarningCount: automaticChecks.hardWarningCount,
          globalIssueCount: editorial.tourAudit?.issues.length ?? 0,
          openIssueIds: editorial.run.status === 'draft_review_required'
            ? editorial.run.openIssueIds : [],
        }),
      ].join('\n\n');
    writeFileSync(markdownPath, `${markdown}\n`);
    process.stdout.write(`${JSON.stringify({
      runId, status: publicArtifact.status, route: route.stops.map((stop) => stop.name),
      workflowStatus: editorial.run.status, scorecardDecision: scorecard?.decision ?? null,
      scorecardBand: scorecard?.overallBand ?? null,
      budget: publicArtifact.budget, review: reviewPath, markdown: markdownPath,
    }, null, 2)}\n`);
    if (!approved) process.exitCode = 1;
  } catch (error) {
    const message = safeError(error, secrets);
    if (!existsSync(markdownPath)) {
      writeFileSync(markdownPath, `${failureMarkdown({ routeNames, reason: message })}\n`);
    }
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

void main();
