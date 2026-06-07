import express, { Request, Response } from 'express';
import { tourService } from '../services/tourService';
import { CreateTourRequest, UpdateTourRequest, ListToursRequest } from '../types/api';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Create a new tour
 * POST /tours
 */
router.post('/', async (req: Request<{}, {}, CreateTourRequest>, res: Response) => {
  try {
    const result = await tourService.createTour(req.body);
    if (result.success) {
      return res.status(201).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in create tour endpoint', { error });
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
 * Get a tour by ID
 * GET /tours/:id
 */
router.get('/:id', async (req: Request<{id: string}>, res: Response) => {
  try {
    const result = await tourService.getTourById(req.params.id);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in get tour endpoint', { error, id: req.params.id });
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
 * List tours with optional filtering
 * GET /tours
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const queryParams: ListToursRequest = {
      city: req.query.city as string,
      theme: req.query.theme as string,
      language: req.query.language as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    };

    const result = await tourService.listTours(queryParams);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in list tours endpoint', { error, query: req.query });
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
 * Delete a tour by ID
 * DELETE /tours/:id
 */
router.delete('/:id', async (req: Request<{id: string}>, res: Response) => {
  try {
    const result = await tourService.deleteTour(req.params.id);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 
                    result.error?.code === 'DB_ERROR' ? 400 : 500;
      return res.status(status).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in delete tour endpoint', { error, id: req.params.id });
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
