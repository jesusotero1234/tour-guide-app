import { Request, Response, NextFunction } from 'express';
import { ErrorCode, ErrorResponse } from '../types/api';

/**
 * Create standardized error response
 */
function createError(code: ErrorCode, message: string, details?: ErrorResponse['error']['details']): ErrorResponse {
  return {
    error: {
      code,
      message,
      details
    }
  };
}

/**
 * Validate required fields in request body
 */
export function validateRequest(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter(field => !(field in req.body));
    
    if (missingFields.length > 0) {
      return res.status(400).json(createError(
        'VALIDATION_ERROR',
        'Missing required fields',
        {
          message: `Missing fields: ${missingFields.join(', ')}`
        }
      ));
    }
    next();
  };
}

/**
 * Validate coordinates format and range
 */
export function validateCoordinates() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { coordinates } = req.body;

    if (!coordinates || typeof coordinates !== 'object') {
      return res.status(400).json(createError(
        'INVALID_COORDINATES',
        'Invalid coordinates format',
        {
          message: 'Coordinates must be an object with lat and lng'
        }
      ));
    }

    const { lat, lng } = coordinates;
    if (
      typeof lat !== 'number' || 
      typeof lng !== 'number' ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      return res.status(400).json(createError(
        'INVALID_COORDINATES',
        'Invalid coordinates values',
        {
          message: 'Latitude must be between -90 and 90, longitude between -180 and 180'
        }
      ));
    }

    next();
  };
}

/**
 * Validate country code format
 */
export function validateCountryCode() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { countryCode } = req.body;

    if (typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode)) {
      return res.status(400).json(createError(
        'VALIDATION_ERROR',
        'Invalid country code',
        {
          message: 'Country code must be a 2-letter ISO code (e.g., ES, US)',
          value: countryCode
        }
      ));
    }

    next();
  };
}
