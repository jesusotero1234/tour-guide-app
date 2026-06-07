import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error('Unhandled error', { 
    error, 
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'An unexpected error occurred'
  });
}
