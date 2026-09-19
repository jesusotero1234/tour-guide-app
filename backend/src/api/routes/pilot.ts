import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { TourRepository } from '../../domain/repositories/TourRepository';
import { TourBlueprintRepository } from '../../services/TourBlueprint';
import { TourAudioService } from '../../services/TourAudioService';
import { admittedToPilot, presentPilotTour, validWalkingRoute, ownerAuthorized } from '../../services/PilotRelease';
import { assertBlueprintSources, buildSourceCredits } from '../../services/SourceCredits';
import { sha256 } from '../../services/AudioProvenance';
import { pilotLaunchReady } from '../../config/pilotLaunch';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validPilotKey(value: string | undefined): boolean {
  const key = process.env.PILOT_API_KEY;
  return !!value && !!key && key.length >= 32 && !(process.env.API_KEYS ?? '').split(',').includes(key)
    && timingSafeEqual(Buffer.from(sha256(value)), Buffer.from(sha256(key)));
}

export function createPilotRouter(tours: TourRepository, bases: TourBlueprintRepository,
  audio: Pick<TourAudioService, 'get' | 'audioFile'>, ready = pilotLaunchReady): Router {
  const requestedReviewIds = (process.env.LOCAL_REVIEW_TOUR_ID ?? '').split(',');
  const localReviewIds = process.env.NODE_ENV === 'development' && process.env.BIND_HOST === '127.0.0.1'
    && requestedReviewIds.length <= 60 && requestedReviewIds.every(id => uuid.test(id))
    ? new Set(requestedReviewIds) : undefined;
  const router = Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!validPilotKey(req.header('X-API-Key'))) return res.status(401).json({ error: { code: 'PILOT_ACCESS_REQUIRED' } });
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: { code: 'PILOT_READ_ONLY' } });
    try {
      if (!localReviewIds && !await ready()) return res.status(503).json({ error: { code: 'PILOT_NOT_OPEN', message: 'La prueba todavía no está abierta.' } });
      next();
    } catch { res.status(503).json({ error: { code: 'PILOT_NOT_OPEN' } }); }
  });

  async function released(id: string) {
    if (!uuid.test(id)) return null;
    if (localReviewIds && !localReviewIds.has(id)) return null;
    const tour = await tours.findById(id);
    if (!tour) return null;
    if (localReviewIds && tour.status === 'published') {
      const state = await audio.get(id, true);
      return { tour, state };
    }
    if (ownerAuthorized(tour)) {
      const state = await audio.get(id, true);
      return admittedToPilot(tour, state) ? { tour, state } : null;
    }
    if (!tour?.blueprintId || tour.metadata?.pilotRelease?.status !== 'approved') return null;
    if (!await bases.isCurrent(tour.blueprintId)) return null;
    const base = await bases.findById(tour.blueprintId);
    if (!base?.snapshot || tour.metadata.codexAuthor?.blueprintFingerprint !== base.snapshot.fingerprint) return null;
    try {
      assertBlueprintSources(base.snapshot);
      for (const place of tour.places) {
        const expected = buildSourceCredits(base.snapshot, place.metadata?.sourcePoi?.wikidata ?? '');
        const actual = place.metadata?.sourceCredits;
        if (!actual || actual.version !== expected.version || actual.items.length !== expected.items.length
          || expected.items.some(credit => !actual.items.some(saved => Object.entries(credit).every(([key, value]) => saved[key as keyof typeof saved] === value)))) return null;
      }
      const state = await audio.get(id, true);
      return admittedToPilot(tour, state) ? { tour, state } : null;
    } catch { return null; }
  }
  const get = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { await handler(req, res); }
    catch { if (!res.headersSent) res.status(503).json({ error: { code: 'PILOT_UNAVAILABLE', message: 'La guía no está disponible ahora.' } }); }
  };
  const notFound = (res: Response) => res.status(404).json({ error: { code: 'TOUR_NOT_FOUND', message: 'La guía no está disponible.' } });

  router.get('/tours', get(async (req, res) => {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: { code: 'INVALID_PAGINATION' } });
    const filters: Record<string, string> = {};
    for (const key of ['city', 'countryCode', 'language', 'theme']) {
      const value = req.query[key];
      if (value !== undefined && (typeof value !== 'string' || value.length > 200)) return res.status(400).json({ error: { code: 'INVALID_FILTER' } });
      if (typeof value === 'string' && value) filters[key] = value;
    }
    // ponytail: review the small pilot inventory before pagination; index releases if the catalogue grows.
    const candidates = await tours.list({ ...filters, cityMatch: 'contains', status: 'published' });
    const admitted = [];
    for (const candidate of candidates) {
      const current = await released(candidate.id);
      if (current) admitted.push(presentPilotTour(current.tour, current.state, Boolean(localReviewIds)));
    }
    res.json({ success: true, data: { tours: admitted.slice(offset, offset + limit), total: admitted.length } });
  }));
  router.get('/tours/:id', get(async (req, res) => {
    const current = await released(req.params.id);
    return current ? res.json(presentPilotTour(current.tour, current.state, Boolean(localReviewIds))) : notFound(res);
  }));
  router.get('/tours/:id/walking-route', get(async (req, res) => {
    const current = await released(req.params.id);
    if (!current) return notFound(res);
    const route = current.tour.metadata?.pilotWalkingRoute;
    if (!validWalkingRoute(route)) return res.status(503).json({ error: { code: 'WALKING_ROUTE_UNAVAILABLE' } });
    return res.json({ data: route });
  }));
  router.get('/tours/:id/audio', get(async (req, res) => {
    const current = await released(req.params.id);
    return current ? res.json({ tourId: current.tour.id, status: current.state.status, phase: current.state.phase,
      completedStops: current.state.completedStops, totalStops: current.state.totalStops,
      audioUrls: current.state.audioUrls, audioVersions: current.state.audioVersions,
      transcripts: current.state.transcripts, introduction: current.state.introduction, canGenerate: false }) : notFound(res);
  }));
  router.get('/tours/:id/provenance', get(async (req, res) => {
    const current = await released(req.params.id);
    if (!current) return notFound(res);
    const publicTour = presentPilotTour(current.tour, current.state, Boolean(localReviewIds));
    return res.json({ version: 1, generatedByAI: true, tourId: publicTour.id, release: publicTour.pilot,
      localReview: Boolean(localReviewIds),
      audioVersions: current.state.audioVersions, introduction: current.state.introduction,
      sources: publicTour.places.map(p => ({ placeId: p.id, sources: p.metadata.sourceCredits })) });
  }));
  router.get('/tours/:id/audio/introduction', get(async (req, res) => {
    const current = await released(req.params.id);
    if (!current?.state.introduction) return notFound(res);
    if (req.query.v && req.query.v !== current.state.introduction.version) return res.status(409).json({ error: { code: 'AUDIO_VERSION_CHANGED' } });
    const path = await audio.audioFile(req.params.id, 'introduction', current.state.introduction.version);
    res.setHeader('Link', '</api/backend/tours/' + req.params.id + '/provenance>; rel="describedby"; type="application/json"');
    res.sendFile(path, error => { if (error && !res.headersSent) res.status(503).end(); });
  }));
  router.get('/tours/:id/audio/:placeId', get(async (req, res) => {
    const current = await released(req.params.id);
    if (!current || !uuid.test(req.params.placeId) || !current.state.audioVersions?.[req.params.placeId]) return notFound(res);
    if (req.query.v && req.query.v !== current.state.audioVersions[req.params.placeId]) return res.status(409).json({ error: { code: 'AUDIO_VERSION_CHANGED' } });
    const path = await audio.audioFile(req.params.id, req.params.placeId, current.state.audioVersions[req.params.placeId]);
    res.setHeader('Link', '</api/backend/tours/' + req.params.id + '/provenance>; rel="describedby"; type="application/json"');
    res.sendFile(path, error => { if (error && !res.headersSent) res.status(503).end(); });
  }));
  return router;
}
