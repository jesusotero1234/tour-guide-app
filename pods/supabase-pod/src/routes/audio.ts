import express, { Request, Response } from 'express';
import { audioService } from '../services/audioService';
import { UploadAudioRequest } from '../types/api';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Upload a new audio file
 * POST /audio
 */
router.post('/', async (req: Request<{}, {}, UploadAudioRequest>, res: Response) => {
  try {
    const result = await audioService.uploadAudio(req.body);
    if (result.success) {
      return res.status(201).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 :
                    result.error?.code === 'STORAGE_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in upload audio endpoint', { error });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

/**
 * Get audio file by ID
 * GET /audio/:id
 */
router.get('/:id', async (req: Request<{id: string}>, res: Response) => {
  try {
    const result = await audioService.getAudioById(req.params.id);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in get audio endpoint', { error, id: req.params.id });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

/**
 * Get all audio files for a place
 * GET /audio/place/:placeId
 */
router.get('/place/:placeId', async (req: Request<{placeId: string}>, res: Response) => {
  try {
    const result = await audioService.listAudioForPlace(req.params.placeId);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in list audio endpoint', { error, placeId: req.params.placeId });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

/**
 * Delete an audio file
 * DELETE /audio/:id
 */
router.delete('/:id', async (req: Request<{id: string}>, res: Response) => {
  try {
    const result = await audioService.deleteAudio(req.params.id);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in delete audio endpoint', { error, id: req.params.id });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

export default router;
