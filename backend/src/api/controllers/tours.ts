import { Request, Response } from 'express';
import { ConceptTourRequest, TourRequest, TourResponse } from '../../types/api';
import { orchestrationService } from '../../services/orchestrationService';
import { CityNotAvailableError, CITY_NOT_AVAILABLE_CODE } from '../../domain/errors/CityNotAvailableError';
import { CityQualityNotAvailableError, CITY_QUALITY_NOT_AVAILABLE_CODE } from '../../domain/errors/CityQualityNotAvailableError';
import { TourDurationNotRecommendedError, TOUR_DURATION_NOT_RECOMMENDED_CODE } from '../../domain/errors/TourDurationNotRecommendedError';

export async function generateTour(req: Request, res: Response) {
  try {
    const tourRequest = req.body as TourRequest;
    console.log(`Received tour generation request for ${tourRequest.city}, theme: ${tourRequest.theme}, durationMinutes: ${tourRequest.durationMinutes || tourRequest.duration || 'default'}`);
    console.log('Full request body:', req.body);

    // Use orchestration service to generate the complete tour
    const tour = await orchestrationService.generateCompleteTour(tourRequest);
    
    res.status(201).json(tour);
  } catch (error) {
    console.error('Error generating tour:', error);
    if (error instanceof CityNotAvailableError) {
      return res.status(422).json({
        error: {
          code: CITY_NOT_AVAILABLE_CODE,
          message: error.message
        }
      });
    }
    if (error instanceof CityQualityNotAvailableError) {
      return res.status(422).json({
        error: {
          code: CITY_QUALITY_NOT_AVAILABLE_CODE,
          message: error.message,
          details: error.details,
        }
      });
    }
    if (error instanceof TourDurationNotRecommendedError) {
      return res.status(422).json({
        error: {
          code: TOUR_DURATION_NOT_RECOMMENDED_CODE,
          message: error.message,
          details: error.details,
        }
      });
    }
    res.status(500).json({
      error: {
        code: 'TOUR_GENERATION_ERROR',
        message: 'Failed to generate tour'
      }
    });
  }
}

export async function generateTourFromConcept(req: Request, res: Response) {
  try {
    const conceptRequest = req.body as ConceptTourRequest;
    console.log(`Received concept tour generation request for ${conceptRequest.city}, concept: ${conceptRequest.conceptSlug}, durationMinutes: ${conceptRequest.durationMinutes || 'default'}`);
    console.log('Full concept request body:', req.body);

    const tour = await orchestrationService.generateTourFromConcept(conceptRequest);
    res.status(201).json(tour);
  } catch (error) {
    console.error('Error generating concept tour:', error);
    if (error instanceof CityNotAvailableError) {
      return res.status(422).json({
        error: {
          code: CITY_NOT_AVAILABLE_CODE,
          message: error.message
        }
      });
    }
    if (error instanceof CityQualityNotAvailableError) {
      return res.status(422).json({
        error: {
          code: CITY_QUALITY_NOT_AVAILABLE_CODE,
          message: error.message,
          details: error.details,
        }
      });
    }
    if (error instanceof TourDurationNotRecommendedError) {
      return res.status(422).json({
        error: {
          code: TOUR_DURATION_NOT_RECOMMENDED_CODE,
          message: error.message,
          details: error.details,
        }
      });
    }
    res.status(500).json({
      error: {
        code: 'CONCEPT_TOUR_GENERATION_ERROR',
        message: 'Failed to generate tour from concept'
      }
    });
  }
}

export async function getTour(req: Request, res: Response) {
  try {
    const { id } = req.params;
    console.log(`Retrieving tour with ID: ${id}`);
    
    // Use orchestration service to retrieve the tour
    try {
      const tour = await orchestrationService.retrieveTour(id);
      res.json(tour);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: {
            code: 'TOUR_NOT_FOUND',
            message: 'Tour not found'
          }
        });
      }
      throw error; // re-throw for the outer catch block
    }
  } catch (error) {
    console.error('Error retrieving tour:', error);
    res.status(500).json({
      error: {
        code: 'TOUR_RETRIEVAL_ERROR',
        message: 'Failed to retrieve tour'
      }
    });
  }
}

export async function listTours(req: Request, res: Response) {
  try {
    console.log('Listing tours with query:', req.query);
    
    // Extract filter parameters from query string
    const filters = {
      city: req.query.city as string,
      countryCode: req.query.countryCode as string,
      theme: req.query.theme as string,
      language: req.query.language as string,
      readyOnly: req.query.readyOnly === 'true',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    };
    
    const tourData = await orchestrationService.listTours(filters);
    res.json(tourData);
  } catch (error) {
    console.error('Error listing tours:', error);
    res.status(500).json({
      error: {
        code: 'TOUR_LIST_ERROR',
        message: 'Failed to list tours'
      }
    });
  }
}
