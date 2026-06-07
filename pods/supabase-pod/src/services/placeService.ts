import { supabaseAdmin } from './supabaseClient';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api';

export class PlaceService {
  /**
   * Create a new place for a tour
   */
  async createPlace(place: {
    tour_id: string;
    name: string;
    description: string;
    lat: number;
    lng: number;
    position: number;
    importance_score?: number;
    image_url?: string;
  }): Promise<ApiResponse<any>> {
    try {
      // Validate the tour exists first
      const { data: tourData, error: tourError } = await supabaseAdmin
        .from('tours')
        .select('id')
        .eq('id', place.tour_id)
        .single();

      if (tourError) {
        if (tourError.code === 'PGRST116') {
          logger.error(`Tour with ID ${place.tour_id} not found`);
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Tour with ID ${place.tour_id} not found`
            }
          };
        }
        
        logger.error('Error validating tour', { error: tourError, tourId: place.tour_id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to validate tour',
            details: tourError
          }
        };
      }

      // Create the place
      const { data, error } = await supabaseAdmin
        .from('places')
        .insert({
          tour_id: place.tour_id,
          name: place.name,
          description: place.description,
          lat: place.lat,
          lng: place.lng,
          position: place.position,
          importance_score: place.importance_score || 0.5,
          image_url: place.image_url
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating place', { error, place });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to create place',
            details: error
          }
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      logger.error('Unexpected error creating place', { error, place });
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: error
        }
      };
    }
  }

  /**
   * Get a place by ID
   */
  async getPlaceById(id: string): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabaseAdmin
        .from('places')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Place with ID ${id} not found`
            }
          };
        }
        
        logger.error('Error fetching place', { error, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to fetch place',
            details: error
          }
        };
      }

      // Convert lat/lng to coordinates object for API consistency
      const placeWithCoordinates = {
        ...data,
        coordinates: {
          lat: data.lat,
          lng: data.lng
        }
      };

      return {
        success: true,
        data: placeWithCoordinates
      };
    } catch (error) {
      logger.error('Unexpected error getting place', { error, id });
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: error
        }
      };
    }
  }

  /**
   * Delete a place
   */
  async deletePlace(id: string): Promise<ApiResponse<{ id: string }>> {
    try {
      // Delete the place
      const { error } = await supabaseAdmin
        .from('places')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Error deleting place', { error, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to delete place',
            details: error
          }
        };
      }

      return {
        success: true,
        data: { id }
      };
    } catch (error) {
      logger.error('Unexpected error deleting place', { error, id });
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: error
        }
      };
    }
  }
}

export const placeService = new PlaceService();
