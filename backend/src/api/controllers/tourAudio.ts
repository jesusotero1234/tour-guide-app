import { Request, Response } from 'express';
import { tourAudioService } from '../../services/tourAudioServiceInstance';
import { TourAudioError } from '../../services/TourAudioService';

function fail(res: Response, error: unknown) {
  if (error instanceof TourAudioError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  console.error('[tour-audio] Request failed', error);
  return res.status(503).json({ error: { code: 'AUDIO_UNAVAILABLE', message: 'Audio is temporarily unavailable. Please try again.' } });
}

export async function createTourAudio(req: Request, res: Response) {
  try {
    const state = await tourAudioService.create(req.params.id);
    return res.status(state.status === 'completed' ? 200 : 202).json(state);
  } catch (error) { return fail(res, error); }
}

export async function getTourAudio(req: Request, res: Response) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await tourAudioService.get(req.params.id));
  } catch (error) { return fail(res, error); }
}

export async function playTourAudio(req: Request, res: Response) {
  try {
    const path = await tourAudioService.audioFile(req.params.id, req.params.placeId);
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.sendFile(path, error => {
      if (error && !res.headersSent) fail(res, error);
    });
  } catch (error) { return fail(res, error); }
}
