import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ApiError } from '../types/api';

/**
 * Error type for standardized API errors
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode = 500, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // This is necessary for extending Error in TypeScript
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handling middleware
 * This catches all errors thrown in the application and formats them consistently
 */
export function errorHandler(
  error: any, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  // Log all errors
  logger.error('API Error', { 
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  // Format the response based on error type
  let response: ApiError;
  let statusCode = 500;
  
  if (error instanceof AppError) {
    // Use the properties from our AppError
    statusCode = error.statusCode;
    response = {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    };
  } else if (error instanceof SyntaxError && 'body' in error) {
    // Handle JSON parsing errors
    statusCode = 400;
    response = {
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        details: error.message
      }
    };
  } else if (error.name === 'ValidationError') {
    // Handle validation errors (e.g., from express-validator)
    statusCode = 400;
    response = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors || error.message
      }
    };
  } else {
    // Generic error handling
    response = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };
  }
  
  // Send the response
  res.status(statusCode).json(response);
}

/**
 * 404 handler middleware
 * This handles requests to non-existent routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`
    }
  });
}
