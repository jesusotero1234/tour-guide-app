import { CODEX_TOUR_PIPELINE, mapCodexTourArtifact } from './CodexTourArtifact';
import { CodexTourGenerator, CodexRun } from './CodexTourGenerator';
import { GenerationJobService } from './GenerationJobService';
import { TourRequest } from '../types/api';
import { validateCodexTourRequest } from '../api/middleware/validation';
import { publicationProblems } from './tourReadiness/publicationReadiness';

const request: TourRequest = { city: 'Test City', country: 'Spain', countryCode: 'ES', theme: 'history', language: 'es', durationMinutes: 60 };
function artifacts(runId: string, input = request): { review: any; author: any } {
  const stops = [1, 2].map(index => ({ stopId: 'Q' + index, wikidataId: 'Q' + index, name: 'Place ' + index, coordinates: { lat: 40 + index / 1000, lng: -3 } }));
  return {
    review: {
      runId, request: input, writerTransport: 'codex', boundaryMigrationPassed: true, route: { stops },
      geometry: { status: 'walkable', durationFit: 'short', guidedDurationMinutes: 45, externalTransferTimeIncluded: false, transferCount: 0,
        legs: [{ type: 'walking', fromStopId: 'Q1', toStopId: 'Q2', durationSeconds: 120 }] },
    },
    author: { status: 'complete_needs_review', publicationPassed: false, missingStopIds: [], delivery: { passed: true },
      stops: stops.map(stop => ({
        stopId: stop.stopId, status: 'audited',
        script: { stopId: stop.stopId, text: 'Narración de ' + stop.name, sentences: [{ sentenceId: stop.stopId + '-s1', text: 'Narración de ' + stop.name }] },
        audit: { status: 'valid', value: { findings: [{ sentenceId: stop.stopId + '-s1', classification: 'supported' }], languageReview: { matchesRequestedLanguage: true, naturalForListening: true, issues: [] } } },
      })),
    },
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe('Codex artifact delivery', () => {
  it('maps approved Codex artifact to draft with zero findings and no publication problems', () => {
    const { review, author } = artifacts('run');
    const tour = mapCodexTourArtifact(request, 'run', review, author);
    expect(tour.status).toBe('draft');
    expect(tour.places.map(p => p.name)).toEqual(['Place 1', 'Place 2']);
    expect(tour.metadata?.textAudit).toBeUndefined();
    expect(tour.metadata?.codexAuthor).toMatchObject({ findingCount: 0, publicationPassed: true, durationFit: 'short' });
    expect(publicationProblems(tour)).toEqual([]);
  });
  it.each([
    { name: 'unsupported finding', mutate: (a: any) => { a.stops[0].audit.value.findings[0].classification = 'unsupported'; } },
    { name: 'distorted finding', mutate: (a: any) => { a.stops[0].audit.value.findings[0].classification = 'distorted'; } },
    { name: 'unclear finding', mutate: (a: any) => { a.stops[0].audit.value.findings[0].classification = 'unclear'; } },
    { name: 'missing languageReview', mutate: (a: any) => { delete a.stops[0].audit.value.languageReview; } },
    { name: 'unnatural listening', mutate: (a: any) => { a.stops[0].audit.value.languageReview.naturalForListening = false; } },
    { name: 'language issues', mutate: (a: any) => { a.stops[0].audit.value.languageReview.issues = ['issue']; } },
    { name: 'false delivery', mutate: (a: any) => { a.delivery.passed = false; } },
    { name: 'missing delivery', mutate: (a: any) => { delete a.delivery; } },
  ])('rejects %s', ({ mutate }) => {
    const { review, author } = artifacts('run');
    mutate(author);
    expect(() => mapCodexTourArtifact(request, 'run', review, author)).toThrow();
  });
  it.each(['partial', 'missing', 'foreign', 'coordinates', 'audit', 'duplicate', 'identity', 'request'])('rejects malformed %s output', kind => {
    const { review, author } = artifacts('run');
    if (kind === 'partial') author.status = 'partial';
    if (kind === 'missing') author.stops.pop();
    if (kind === 'foreign') author.stops[0].script.stopId = 'Q99';
    if (kind === 'coordinates') review.route.stops[0].coordinates.lat = 999;
    if (kind === 'audit') author.stops[0].audit.value.findings = [];
    if (kind === 'duplicate') review.route.stops[1].stopId = 'Q1';
    if (kind === 'identity') review.route.stops[0].wikidataId = 'osm:1';
    if (kind === 'request') review.request = { ...request, durationMinutes: 120 };
    expect(() => mapCodexTourArtifact(request, 'run', review, author)).toThrow('Invalid Codex artifact');
  });
  it('preserves self-transfer instruction and rejects invented transfer time', () => {
    const { review, author } = artifacts('run');
    review.geometry.transferCount = 1;
    review.geometry.legs[0] = { type: 'self_transfer', fromStopId: 'Q1', toStopId: 'Q2', durationSeconds: null };
    const tour = mapCodexTourArtifact(request, 'run', review, author);
    expect(tour.places[0].description).toContain('Desplázate por tu cuenta');
    expect(tour.metadata?.codexAuthor?.legs[0].durationSeconds).toBeNull();
    review.geometry.legs[0].durationSeconds = 600;
    expect(() => mapCodexTourArtifact(request, 'run', review, author)).toThrow('invented transfer time');
  });
});

describe('request to Codex draft and reuse', () => {
  function setup() {
    let job: any = null, saved: any = null, owner: string | null = null;
    const tours = {
      save: jest.fn(async tour => (saved = { ...tour, id: 'tour-1' })),
      findById: jest.fn(async () => saved),
      updateStatus: jest.fn(),
    };
    const jobs = {
      findReusableByKey: jest.fn(async () => job),
      create: jest.fn(async ({ request: input, idempotencyKey }) => (job = { id: 'job-1', request: input, idempotencyKey, status: 'queued', step: 'queued', updatedAt: new Date().toISOString(), progress: {} })),
      findById: jest.fn(async () => job),
      claim: jest.fn(async (_id, candidate) => { if (owner) return false; owner = candidate; return true; }),
      renewLease: jest.fn(async () => true),
      updateOwned: jest.fn(async (_id, candidate, update) => { if (candidate !== owner) return false; job = { ...job, ...update }; return true; }),
      completeOwned: jest.fn(async (_id, candidate, tourId, update) => { if (candidate !== owner) return false; job = { ...job, ...update }; saved = { ...saved, status: 'published' }; return true; }),
      resetCompleted: jest.fn(async () => { job = { ...job, status: 'queued', result: undefined }; owner = null; return true; }),
      listPending: jest.fn(async () => job ? [job] : []),
    };
    const run = jest.fn<CodexRun extends (...args: any[]) => infer R ? R : never, Parameters<CodexRun>>(async (input, runId, progress, signal) => {
      expect(signal?.aborted).toBe(false);
      await progress?.({ step: 'narrating', completedStops: 2, totalStops: 2, message: 'Written' });
      return artifacts(runId, input);
    });
    const service = new GenerationJobService(jobs as any, tours as any, new CodexTourGenerator(tours as any, run));
    return { jobs, tours, run, service, saved: () => saved };
  }
  it('validates request, runs Codex, stores a published tour and reuses it without regeneration', async () => {
    const next = jest.fn(), res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    validateCodexTourRequest({ body: request } as any, res as any, next);
    expect(next).toHaveBeenCalled();
    const f = setup();
    expect((await f.service.create(request)).status).toBe('queued');
    await flush(); await flush();
    const complete = await f.service.get('job-1');
    expect(complete).toMatchObject({ status: 'completed', result: { tourId: 'tour-1' } });
    expect(complete?.result?.reviewRequired).toBeUndefined();
    expect(f.saved()).toMatchObject({ status: 'published', metadata: { generationPipeline: CODEX_TOUR_PIPELINE } });
    expect(f.jobs.completeOwned).toHaveBeenCalledTimes(1);
    expect(f.jobs.completeOwned).toHaveBeenCalledWith('job-1', expect.any(String), 'tour-1', expect.objectContaining({ status: 'completed', step: 'completed', tourId: 'tour-1' }));
    expect(f.tours.updateStatus).not.toHaveBeenCalled();
    expect((await f.service.create(request)).id).toBe('job-1');
    expect(f.run).toHaveBeenCalledTimes(1);
  });
  it('invalidates a draft from another pipeline version', async () => {
    const f = setup();
    await f.service.create(request); await flush(); await flush();
    f.saved().metadata.generationPipeline = 'obsolete';
    expect(await f.service.get('job-1')).toMatchObject({ status: 'failed', errorCode: 'GENERATION_RESULT_UNAVAILABLE' });
    await f.service.create(request);
    expect(f.jobs.resetCompleted).toHaveBeenCalledTimes(1);
    await flush(); await flush();
  });
  it('does not persist malformed or aborted output', async () => {
    const tours = { save: jest.fn() };
    const invalid: CodexRun = async () => ({ review: {}, author: {} });
    await expect(new CodexTourGenerator(tours as any, invalid).generateTextTour(request)).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    const run = jest.fn();
    await expect(new CodexTourGenerator(tours as any, run).generateTextTour(request, undefined, controller.signal)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled(); expect(tours.save).not.toHaveBeenCalled();
  });
  it.each([{ language: 'en' }, { theme: 'food' }, { durationMinutes: 90 }, { city: ' ' }])('rejects unsupported input before creating a job: %j', override => {
    const next = jest.fn(), res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    validateCodexTourRequest({ body: { ...request, ...override } } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(400); expect(next).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'false publicationPassed', mutate: (t: any) => { t.metadata.codexAuthor.publicationPassed = false; } },
    { name: 'nonzero findings', mutate: (t: any) => { t.metadata.codexAuthor.findingCount = 1; } },
    { name: 'nonzero language findings', mutate: (t: any) => { t.metadata.codexAuthor.languageFindingCount = 1; } },
    { name: 'missing delivery flag', mutate: (t: any) => { delete t.metadata.codexAuthor.narrationWithinTarget; } },
    { name: 'missing stopReviews', mutate: (t: any) => { delete t.metadata.codexAuthor.stopReviews; } },
    { name: 'unsupported finding', mutate: (t: any) => { t.metadata.codexAuthor.stopReviews[0].findings[0].classification = 'unsupported'; } },
    { name: 'wrong language review', mutate: (t: any) => { t.metadata.codexAuthor.stopReviews[0].languageReview.matchesRequestedLanguage = false; } },
    { name: 'blank description', mutate: (t: any) => { t.places[0].description = ''; } },
  ])('publicationProblems detects %s', ({ mutate }) => {
    const { review, author } = artifacts('run');
    const tour = mapCodexTourArtifact(request, 'run', review, author);
    mutate(tour);
    expect(publicationProblems(tour).length).toBeGreaterThan(0);
  });
  it('legacy tour without codexAuthor still requires legacy audits', () => {
    const tour: any = {
      id: '', city: 'Test City', country: 'Spain', countryCode: 'ES', theme: 'history', language: 'es', durationMinutes: 60,
      status: 'published', introduction: 'Intro',
      places: [1, 2, 3, 4, 5].map(i => ({ id: '', tourId: '', name: 'P' + i, description: 'D' + i, latitude: 40, longitude: -3, position: i, metadata: { sourcePoi: { wikidata: 'Q' + i } } })),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      metadata: { generationPipeline: 'legacy' },
    };
    expect(publicationProblems(tour).length).toBeGreaterThan(0);
  });
});
