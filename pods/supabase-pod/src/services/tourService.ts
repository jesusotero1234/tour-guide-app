import { supabaseAdmin } from './supabaseClient';
import logger from '../utils/logger';
import { Tour, CreateTourRequest, UpdateTourRequest, ListToursRequest, ListToursResponse, ApiResponse } from '../types/api';

export class TourService {
  /**
   * Create a new tour in the database
   */
  async createTour(data: CreateTourRequest): Promise<ApiResponse<Tour>> {
    try {
      // First, create the tour entry
      const { data: tourData, error: tourError } = await supabaseAdmin
        .from('tours')
        .insert({
          city: data.tour.city,
          theme: data.tour.theme,
          language: data.tour.language,
          metadata: data.tour.metadata || {}
        })
        .select()
        .single();

      if (tourError) {
        logger.error('Error creating tour', { error: tourError });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to create tour',
            details: tourError
          }
        };
      }

      // Then, create places for this tour
      if (data.tour.places && data.tour.places.length > 0) {
        const placesWithTourId = data.tour.places.map((place, index) => ({
          tour_id: tourData.id,
          name: place.name,
          description: place.description,
          lat: place.coordinates.lat,
          lng: place.coordinates.lng,
          position: place.position || index,
          importance_score: place.importance_score,
          image_url: place.image_url
        }));

        const { error: placesError } = await supabaseAdmin
          .from('places')
          .insert(placesWithTourId);

        if (placesError) {
          logger.error('Error creating places for tour', { error: placesError, tourId: tourData.id });
          // Don't fail the whole operation, but log the error
        }
      }

      // Retrieve the complete tour with places
      const completeTour = await this.getTourById(tourData.id);
      return completeTour;
    } catch (error) {
      logger.error('Unexpected error creating tour', { error });
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
   * Get a tour by ID with all related places
   */
  async getTourById(id: string): Promise<ApiResponse<Tour>> {
    try {
      // Get the tour
      const { data: tourData, error: tourError } = await supabaseAdmin
        .from('tours')
        .select('*')
        .eq('id', id)
        .single();

      if (tourError) {
        if (tourError.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Tour with ID ${id} not found`
            }
          };
        }
        
        logger.error('Error fetching tour', { error: tourError, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to fetch tour',
            details: tourError
          }
        };
      }

      // Get the places for this tour
      const { data: placesData, error: placesError } = await supabaseAdmin
        .from('places')
        .select('*')
        .eq('tour_id', id)
        .order('position');

      if (placesError) {
        logger.error('Error fetching places for tour', { error: placesError, tourId: id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to fetch tour places',
            details: placesError
          }
        };
      }

      // Transform places data to match the expected format
        const places = placesData.map(place => ({
          id: place.id,
          name: place.name,
          description: place.description,
          coordinates: {
            lat: place.lat,
            lng: place.lng
          },
          position: place.position,
          importance_score: place.importance_score,
          image_url: place.image_url
        }));

      // Construct the complete tour object
      const tour: Tour = {
        id: tourData.id,
        city: tourData.city,
        theme: tourData.theme,
        language: tourData.language,
        places,
        created_at: tourData.created_at,
        user_id: tourData.user_id,
        metadata: tourData.metadata
      };

      return {
        success: true,
        data: tour
      };
    } catch (error) {
      logger.error('Unexpected error fetching tour', { error, id });
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
   * List tours with optional filtering
   */
  async listTours(params: ListToursRequest): Promise<ApiResponse<ListToursResponse>> {
    try {
      const limit = params.limit || 10;
      const offset = params.offset || 0;
      
      // Build query
      let query = supabaseAdmin
        .from('tours')
        .select('*', { count: 'exact' });
      
      // Apply filters if provided
      if (params.city) {
        query = query.ilike('city', params.city); // Use case-insensitive exact match for city name
      }
      
      if (params.theme) {
        query = query.ilike('theme', `%${params.theme}%`);
      }
      
      if (params.language) {
        query = query.eq('language', params.language);
      }
      
      // Add pagination
      query = query.range(offset, offset + limit - 1);
      
      // Execute query
      const { data: toursData, error: toursError, count } = await query;
      
      if (toursError) {
        logger.error('Error listing tours', { error: toursError, params });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to list tours',
            details: toursError
          }
        };
      }
      
      // Need to fetch places for each tour
      const tours: Tour[] = [];
      
      for (const tourData of toursData) {
        const { data: placesData, error: placesError } = await supabaseAdmin
          .from('places')
          .select('*')
          .eq('tour_id', tourData.id)
          .order('position');
          
        if (placesError) {
          logger.warn('Error fetching places for tour', { tourId: tourData.id, error: placesError });
          continue;
        }
        
        const places = placesData.map(place => ({
          id: place.id,
          name: place.name,
          description: place.description,
          coordinates: {
            lat: place.lat,
            lng: place.lng
          },
          position: place.position,
          importance_score: place.importance_score,
          image_url: place.image_url
        }));
        
        tours.push({
          id: tourData.id,
          city: tourData.city,
          theme: tourData.theme,
          language: tourData.language,
          places,
          created_at: tourData.created_at,
          user_id: tourData.user_id,
          metadata: tourData.metadata
        });
      }
      
      return {
        success: true,
        data: {
          tours,
          total: count || 0,
          hasMore: (count || 0) > offset + tours.length
        }
      };
    } catch (error) {
      logger.error('Unexpected error listing tours', { error, params });
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
   * Delete a tour by ID (also deletes associated places due to cascade)
   */
  async deleteTour(id: string): Promise<ApiResponse<{ id: string }>> {
    try {
      // Check if tour exists
      const { data: existingTour, error: checkError } = await supabaseAdmin
        .from('tours')
        .select('id')
        .eq('id', id)
        .single();
        
      if (checkError) {
        if (checkError.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Tour with ID ${id} not found`
            }
          };
        }
        
        logger.error('Error checking tour existence', { error: checkError, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to check tour existence',
            details: checkError
          }
        };
      }
      
      // Delete the tour (places will be deleted via cascade)
      const { error: deleteError } = await supabaseAdmin
        .from('tours')
        .delete()
        .eq('id', id);
        
      if (deleteError) {
        logger.error('Error deleting tour', { error: deleteError, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to delete tour',
            details: deleteError
          }
        };
      }
      
      return {
        success: true,
        data: { id }
      };
    } catch (error) {
      logger.error('Unexpected error deleting tour', { error, id });
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

export const tourService = new TourService();
