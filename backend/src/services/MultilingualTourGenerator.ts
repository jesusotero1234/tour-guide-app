import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { TourRepository } from '../domain/repositories/TourRepository';
import { Tour } from '../domain/entities/Tour';
import { TourRequest } from '../types/api';
import { CodexProgress } from './CodexTourGenerator';
import { TourBlueprintRepository, TourBlueprint, parseTourBlueprintSnapshot, tourBaseKey } from './TourBlueprint';
import { resolveTourDestination } from './TourDestinationResolver';
import { TourGenerationAttemptError, TourPhaseRunner, runTourPhase } from './CodexTourProcess';
import { mapCodexTourArtifact } from './CodexTourArtifact';
import { tourLocale, NARRATION_POLICY_VERSION } from './tourReadiness/TourLanguage';

export const MULTILINGUAL_TOUR_PIPELINE = 'codex-blueprint-app-2-astra-audit-' + NARRATION_POLICY_VERSION;
export class MultilingualTourGenerator {
  readonly pipelineVersion = MULTILINGUAL_TOUR_PIPELINE;
  readonly usesBudget = true;
  constructor(
    private readonly tours: TourRepository,
    private readonly bases: TourBlueprintRepository,
    private readonly run: TourPhaseRunner = runTourPhase,
    private readonly resolveDestination = resolveTourDestination,
  ) {}
  async prepareRequest(request: TourRequest): Promise<TourRequest> {
    const language = tourLocale(request.language);
    if (request.theme !== 'history' || ![60, 120, 180, 240].includes(request.durationMinutes)) throw new Error('UNSUPPORTED_TOUR_REQUEST');
    // Resolve afresh; client-supplied QIDs or source languages are never authoritative.
    const destination = await this.resolveDestination({ city: request.city, countryCode: request.countryCode });
    const blueprintRevision = await this.bases.revisionForRequest(tourBaseKey(destination, request));
    return { city: destination.city, country: destination.country, countryCode: destination.countryCode,
      language, theme: request.theme, durationMinutes: request.durationMinutes, destination, blueprintRevision };
  }
  async isReusableTour(tour: Tour): Promise<boolean> {
    if (!tour.blueprintId || tour.metadata?.generationPipeline !== this.pipelineVersion) return false;
    if (!await this.bases.isCurrent(tour.blueprintId)) return false;
    const base = await this.bases.findById(tour.blueprintId);
    return !!base?.snapshot && tour.metadata.codexAuthor?.blueprintFingerprint === base.snapshot.fingerprint;
  }
  async generateTextTour(request: TourRequest, progress?: (value: CodexProgress) => Promise<void>,
    signal?: AbortSignal, budget?: { limitUsd: number }): Promise<{ id: string; reviewRequired: true; accountedUsd: number }> {
    let spent = 0;
    const limit = budget?.limitUsd ?? Number(process.env.TOUR_GENERATION_SPEND_LIMIT_USD ?? '2');
    if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid generation budget');
    const phase: TourPhaseRunner = async (input, report, abort) => {
      try {
        const result = await this.run(input, report, abort);
        if (!Number.isFinite(result.costUsd) || result.costUsd < 0 || result.costUsd > input.limitUsd + 1e-9) throw new Error('Invalid worker cost');
        spent += result.costUsd;
        return result;
      } catch (error) {
        spent += error instanceof TourGenerationAttemptError ? error.accountedUsd : input.limitUsd;
        throw error;
      }
    };
    try {
      signal?.throwIfAborted();
      const normalized = request.destination ? request : await this.prepareRequest(request);
      tourLocale(normalized.language);
      const destination = normalized.destination!;
      const baseKey = tourBaseKey(destination, normalized), owner = randomUUID();
      const waitDeadline = Date.now() + 35 * 60 * 1000;
      let base: TourBlueprint;
      while (true) {
        signal?.throwIfAborted();
        if (Date.now() >= waitDeadline) throw new Error('BLUEPRINT_WAIT_TIMEOUT');
        const claim = await this.bases.acquire(baseKey, owner, limit * 0.75);
        base = claim.blueprint;
        if (base.revision !== normalized.blueprintRevision) {
          if (claim.kind === 'claimed') await this.bases.fail(base.id, owner, 'BLUEPRINT_REVISION_CHANGED', base.accountedSpendUsd - claim.allowanceUsd);
          throw new Error('BLUEPRINT_REVISION_CHANGED');
        }
        if (claim.kind === 'ready') {
          await progress?.({ step: 'planning_narrative', completedStops: 0, totalStops: base.snapshot!.checkpoint.route.stops.length, message: 'Reusing the route and verified source material' });
          break;
        }
        if (claim.kind === 'waiting') {
          await progress?.({ step: 'routing', completedStops: 0, totalStops: 0, message: 'Waiting for shared route research' });
          await delay(1000, undefined, { signal });
          continue;
        }
        const controller = new AbortController();
        const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        let renewing = false;
        const timer = setInterval(() => {
          if (renewing) return;
          renewing = true;
          void this.bases.renew(base.id, owner).then(ok => { if (!ok) controller.abort(); })
            .catch(() => controller.abort()).finally(() => { renewing = false; });
        }, 30000);
        timer.unref();
        const prior = base.accountedSpendUsd - claim.allowanceUsd;
        const before = spent;
        try {
          await progress?.({ step: 'routing', completedStops: 0, totalStops: 0, message: 'Preparing the shared route and source material' });
          const prepared = await phase({ mode: 'prepare', request: normalized, runId: 'app-' + randomUUID(), limitUsd: claim.allowanceUsd }, progress, combined);
          combined.throwIfAborted();
          const snapshot = parseTourBlueprintSnapshot(prepared.snapshot);
          if (tourBaseKey(snapshot.destination, snapshot.checkpoint.route) !== baseKey) throw new Error('Prepared base does not match request');
          if (!await this.bases.complete(base.id, owner, snapshot, prior + spent - before)) throw new Error('Blueprint lease lost');
          base = (await this.bases.findById(base.id))!;
          break;
        } catch (error) {
          await this.bases.fail(base.id, owner, error instanceof Error ? error.message : 'Preparation failed', prior + spent - before);
          throw error;
        } finally { clearInterval(timer); controller.abort(); }
      }
      if (!base.snapshot || !await this.bases.isCurrent(base.id)) throw new Error('BLUEPRINT_UNAVAILABLE');
      const snapshot = parseTourBlueprintSnapshot(base.snapshot);
      const runId = 'app-' + randomUUID();
      const remaining = limit - spent;
      if (remaining <= 1e-9) throw new Error('TOUR_BUDGET_EXHAUSTED');
      await progress?.({ step: 'narrating', completedStops: 0, totalStops: snapshot.checkpoint.route.stops.length, message: 'Writing the tour in ' + normalized.language });
      const result = await phase({ mode: 'narrate', request: normalized, snapshot, runId, limitUsd: remaining }, progress, signal);
      signal?.throwIfAborted();
      if (!await this.bases.isCurrent(base.id)) throw new Error('BLUEPRINT_INVALIDATED_DURING_WRITING');
      if (!result.review || (result.review as {blueprintFingerprint?:unknown}).blueprintFingerprint !== snapshot.fingerprint) throw new Error('Narration evidence mismatch');
      const review = result.review as { route?: { stops?: unknown }; geometry?: unknown };
      if (JSON.stringify(review.route?.stops) !== JSON.stringify(snapshot.checkpoint.route.stops)
        || JSON.stringify(review.geometry) !== JSON.stringify(snapshot.geometry)) throw new Error('Narration changed the prepared route');
      const draft = mapCodexTourArtifact(normalized, runId, result.review, result.author);
      draft.blueprintId = base.id;
      draft.metadata = { ...draft.metadata, generationPipeline: this.pipelineVersion };
      signal?.throwIfAborted();
      const saved = await this.tours.save(draft);
      return { id: saved.id, reviewRequired: true, accountedUsd: spent };
    } catch (error) {
      throw new TourGenerationAttemptError(error instanceof Error ? error.message : 'Generation failed', spent);
    }
  }
}
