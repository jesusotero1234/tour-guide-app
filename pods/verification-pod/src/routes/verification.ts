import express from 'express';
import { placeService } from '../services/places';
import { verifyRoute } from '../services/routes';
import { 
  PlaceVerificationRequest, 
  RouteVerificationRequest,
  ErrorResponse,
  ValidationError 
} from '../types/api';

const router = express.Router();

router.post('/place', async (req, res) => {
  try {
    const request = req.body as PlaceVerificationRequest;

    // Validate required fields
    if (!request.name || !request.city || !request.country || !request.countryCode) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields',
          details: {
            message: 'name, city, country, and countryCode are required'
          }
        }
      } satisfies ErrorResponse);
    }

    // Get verification with translations
    const result = await placeService.verifyPlace(request);
    res.json(result);

  } catch (error) {
    console.error('Place verification error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: {
          message: 'An internal error occurred during place verification',
          value: error
        }
      }
    } satisfies ErrorResponse);
  }
});

router.post('/route', async (req, res) => {
  try {
    const request = req.body as RouteVerificationRequest;

    // Validate required fields
    if (!request.stops || !request.city || !request.country || !request.countryCode || !request.duration) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields',
          details: {
            message: 'stops, city, country, countryCode, and duration are required'
          }
        }
      } satisfies ErrorResponse);
    }

    // Use the route verification service
    const result = await verifyRoute(
      request.stops,
      request.duration,
      request.city,
      request.country,
      request.countryCode
    );

    res.json(result);

  } catch (error) {
    console.error('Route verification error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: {
          message: 'An internal error occurred during route verification',
          value: error
        }
      }
    } satisfies ErrorResponse);
  }
});

export default router;
