import { Request, Response, NextFunction } from 'express';
import { 
  DescriptionRequest, 
  ContextRequest, 
  TipsRequest,
  PlaceInfo,
  TourPositionContext
} from '../types/api';
import logger from '../utils/logger';

/**
 * Validate description generation request
 */
export function validateDescriptionRequest(
  req: Request<{}, {}, DescriptionRequest>,
  res: Response,
  next: NextFunction
): void {
  const { place, language, detailLevel, style, tourContext } = req.body;

  // Validate place info
  if (!validatePlaceInfo(place, res)) {
    return; // Return stops execution if validation fails
  }
  
  // Validate language if provided
  if (language && typeof language !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid language format',
        details: 'Language must be a valid string language code'
      }
    });
    return;
  }

  // Validate detail level if provided
  if (detailLevel && !['brief', 'standard', 'detailed'].includes(detailLevel)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid detailLevel',
        details: 'Detail level must be one of: brief, standard, detailed'
      }
    });
    return;
  }

  // Validate style if provided
  if (style && typeof style !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid style format',
        details: 'Style must be a string'
      }
    });
    return;
  }
  
  // Validate tour context if provided
  if (tourContext && !validateTourContext(tourContext, res)) {
    return; // Return stops execution if validation fails
  }

  next();
}

/**
 * Validate context generation request
 */
export function validateContextRequest(
  req: Request<{}, {}, ContextRequest>,
  res: Response,
  next: NextFunction
): void {
  const { place, language, contextType, timeframe, tourContext } = req.body;
  
  // Validate place info
  if (!validatePlaceInfo(place, res)) {
    return; // Return stops execution if validation fails
  }
  
  // Validate language if provided
  if (language && typeof language !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid language format',
        details: 'Language must be a valid string language code'
      }
    });
    return;
  }
  
  // Validate context type
  if (!contextType || !['historical', 'cultural', 'architectural', 'general'].includes(contextType)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid contextType',
        details: 'Context type must be one of: historical, cultural, architectural, general'
      }
    });
    return;
  }
  
  // Validate timeframe if provided
  if (timeframe && typeof timeframe !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid timeframe format',
        details: 'Timeframe must be a string'
      }
    });
    return;
  }
  
  // Validate tour context if provided
  if (tourContext && !validateTourContext(tourContext, res)) {
    return; // Return stops execution if validation fails
  }
  
  next();
}

/**
 * Validate tips generation request
 */
export function validateTipsRequest(
  req: Request<{}, {}, TipsRequest>,
  res: Response,
  next: NextFunction
): void {
  const { place, language, audience, tipTypes, tourContext } = req.body;
  
  // Validate place info
  if (!validatePlaceInfo(place, res)) {
    return; // Return stops execution if validation fails
  }
  
  // Validate language if provided
  if (language && typeof language !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid language format',
        details: 'Language must be a valid string language code'
      }
    });
    return;
  }
  
  // Validate audience if provided
  if (audience && !['general', 'family', 'solo', 'couples', 'seniors', 'budget'].includes(audience)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid audience',
        details: 'Audience must be one of: general, family, solo, couples, seniors, budget'
      }
    });
    return;
  }
  
  // Validate tip types if provided
  const validTipTypes = ['visiting', 'photography', 'timing', 'practical', 'cultural', 'insider'];
  if (tipTypes) {
    if (!Array.isArray(tipTypes)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid tipTypes format',
          details: 'tipTypes must be an array'
        }
      });
      return;
    }
    
    for (const tipType of tipTypes) {
      if (!validTipTypes.includes(tipType)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid tipType',
            details: `Tip type '${tipType}' is not valid. Must be one of: ${validTipTypes.join(', ')}`
          }
        });
        return;
      }
    }
  }
  
  // Validate tour context if provided
  if (tourContext && !validateTourContext(tourContext, res)) {
    return; // Return stops execution if validation fails
  }
  
  next();
}

/**
 * Validate place info structure
 * Returns true if valid, false if invalid (and sends error response)
 */
function validatePlaceInfo(place: PlaceInfo | undefined, res: Response): boolean {
  if (!place) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing required field: place',
        details: 'Place information is required'
      }
    });
    return false;
  }
  
  if (!place.name || typeof place.name !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid or missing place.name',
        details: 'Place name is required and must be a string'
      }
    });
    return false;
  }
  
  if (!place.city || typeof place.city !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid or missing place.city',
        details: 'Place city is required and must be a string'
      }
    });
    return false;
  }
  
  if (!place.country || typeof place.country !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid or missing place.country',
        details: 'Place country is required and must be a string'
      }
    });
    return false;
  }
  
  // Check coordinates if provided
  if (place.coordinates) {
    if (
      typeof place.coordinates !== 'object' ||
      typeof place.coordinates.lat !== 'number' ||
      typeof place.coordinates.lng !== 'number'
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid coordinates format',
          details: 'Coordinates must include lat and lng as numbers'
        }
      });
      return false;
    }
  }
  
  // Check tags if provided
  if (place.tags && (!Array.isArray(place.tags) || !place.tags.every(tag => typeof tag === 'string'))) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid tags format',
        details: 'Tags must be an array of strings'
      }
    });
    return false;
  }
  
  return true;
}

/**
 * Validate tour context structure
 * Returns true if valid, false if invalid (and sends error response)
 */
function validateTourContext(tourContext: TourPositionContext | undefined, res: Response): boolean {
  if (!tourContext) return true;
  
  // Validate position is required
  if (!tourContext.position || !['first', 'middle', 'last'].includes(tourContext.position)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid or missing tourContext.position',
        details: "Tour position must be one of 'first', 'middle', or 'last'"
      }
    });
    return false;
  }
  
  // Validate tour name if provided
  if (tourContext.tourName && typeof tourContext.tourName !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid tourContext.tourName',
        details: 'Tour name must be a string'
      }
    });
    return false;
  }
  
  // Validate tour theme if provided
  if (tourContext.tourTheme && typeof tourContext.tourTheme !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid tourContext.tourTheme',
        details: 'Tour theme must be a string'
      }
    });
    return false;
  }
  
  // Validate previousStops if provided
  if (tourContext.previousStops && !Array.isArray(tourContext.previousStops)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid previousStops format',
        details: 'Previous stops must be an array'
      }
    });
    return false;
  }
  
  // Validate nextStops if provided
  if (tourContext.nextStops && !Array.isArray(tourContext.nextStops)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid nextStops format',
        details: 'Next stops must be an array'
      }
    });
    return false;
  }
  
  // Validate expectedDuration if provided
  if (tourContext.expectedDuration && typeof tourContext.expectedDuration !== 'number') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid expectedDuration',
        details: 'Expected duration must be a number (minutes)'
      }
    });
    return false;
  }
  
  return true;
}
