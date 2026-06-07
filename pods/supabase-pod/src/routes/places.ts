import express, { Request, Response } from 'express';
import { placeService } from '../services/placeService';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Create a new place
 * POST /places
 */
router.post('/', async (req: Request<{}, {}, { place: any }>, res: Response) => {
  try {
    if (!req.body.place) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing place data in request body'
        }
      });
    }

    const result = await placeService.createPlace(req.body.place);
    if (result.success) {
      return res.status(201).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in create place endpoint', { error });
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
 * Get a place by ID
 * GET /places/:id
 */
router.get('/:id', async (req: Request<{id: string}>, res: Response) => {
  try {
    const result = await placeService.getPlaceById(req.params.id);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in get place endpoint', { error, id: req.params.id });
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
 * Delete a place by ID
 * DELETE /places/:id
 */
router.delete('/:id', async (req: Request<{id: string}>, res: Response) => {
  try {
    const result = await placeService.deletePlace(req.params.id);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in delete place endpoint', { error, id: req.params.id });
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
