import { supabaseAdmin } from './supabaseClient';
import logger from '../utils/logger';
import { config } from '../config/env';
import { AudioFile, UploadAudioRequest, ApiResponse } from '../types/api';

export class AudioService {
  /**
   * Upload an audio file to Supabase storage and record metadata in the database
   */
  async uploadAudio(data: UploadAudioRequest): Promise<ApiResponse<AudioFile>> {
    try {
      // Validate place_id is provided
      if (!data.place_id) {
        logger.error('Missing place_id in upload audio request');
        return {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'place_id is required and cannot be undefined'
          }
        };
      }
      
      // Validate the place exists
      const { data: placeData, error: placeError } = await supabaseAdmin
        .from('places')
        .select('id, tour_id')
        .eq('id', data.place_id)
        .single();

      if (placeError) {
        if (placeError.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Place with ID ${data.place_id} not found`
            }
          };
        }
        
        logger.error('Error validating place', { error: placeError, placeId: data.place_id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to validate place',
            details: placeError
          }
        };
      }

      // Decode base64 audio data
      const audioBuffer = Buffer.from(data.audioData, 'base64');
      
      // Generate storage path based on tour ID and place ID
      const storagePath = `${placeData.tour_id}/${data.place_id}_${data.language}.${data.format}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabaseAdmin
        .storage
        .from(config.storageBucket)
        .upload(storagePath, audioBuffer, {
          contentType: this.getContentType(data.format),
          upsert: true  // Overwrite if exists
        });

      if (uploadError) {
        logger.error('Error uploading audio file', { error: uploadError, placeId: data.place_id });
        return {
          success: false,
          error: {
            code: 'STORAGE_ERROR',
            message: 'Failed to upload audio file',
            details: uploadError
          }
        };
      }

      // Create database entry for the audio file
      const { data: audioData, error: audioError } = await supabaseAdmin
        .from('audio_files')
        .insert({
          place_id: data.place_id,
          language: data.language,
          format: data.format,
          storage_path: uploadData?.path || storagePath,
          metadata: data.metadata || {}
        })
        .select()
        .single();

      if (audioError) {
        logger.error('Error creating audio file record', { error: audioError, placeId: data.place_id });
        
        // Clean up the storage if the database insert fails
        await supabaseAdmin
          .storage
          .from(config.storageBucket)
          .remove([storagePath]);
          
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to create audio file record',
            details: audioError
          }
        };
      }

      // Generate a public URL for the audio file
      const { data: publicUrl } = supabaseAdmin
        .storage
        .from(config.storageBucket)
        .getPublicUrl(storagePath);

      return {
        success: true,
        data: {
          ...audioData,
          url: publicUrl.publicUrl
        } as AudioFile & { url: string }
      };
    } catch (error) {
      logger.error('Unexpected error uploading audio', { error });
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
   * Get audio file by ID
   */
  async getAudioById(id: string): Promise<ApiResponse<AudioFile & { url: string }>> {
    try {
      const { data: audioData, error: audioError } = await supabaseAdmin
        .from('audio_files')
        .select('*')
        .eq('id', id)
        .single();

      if (audioError) {
        if (audioError.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Audio file with ID ${id} not found`
            }
          };
        }
        
        logger.error('Error fetching audio file', { error: audioError, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to fetch audio file',
            details: audioError
          }
        };
      }

      // Generate a public URL for the audio file
      const { data: publicUrl } = supabaseAdmin
        .storage
        .from(config.storageBucket)
        .getPublicUrl(audioData.storage_path);

      return {
        success: true,
        data: {
          ...audioData,
          url: publicUrl.publicUrl
        }
      };
    } catch (error) {
      logger.error('Unexpected error fetching audio', { error, id });
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
   * List audio files for a place
   */
  async listAudioForPlace(placeId: string): Promise<ApiResponse<(AudioFile & { url: string })[]>> {
    try {
      const { data: audioFiles, error: audioError } = await supabaseAdmin
        .from('audio_files')
        .select('*')
        .eq('place_id', placeId);

      if (audioError) {
        logger.error('Error listing audio files', { error: audioError, placeId });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to list audio files',
            details: audioError
          }
        };
      }

      // Add public URLs to each audio file
      const audioFilesWithUrls = audioFiles.map(file => {
        const { data: publicUrl } = supabaseAdmin
          .storage
          .from(config.storageBucket)
          .getPublicUrl(file.storage_path);

        return {
          ...file,
          url: publicUrl.publicUrl
        };
      });

      return {
        success: true,
        data: audioFilesWithUrls
      };
    } catch (error) {
      logger.error('Unexpected error listing audio files', { error, placeId });
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
   * Delete an audio file by ID
   */
  async deleteAudio(id: string): Promise<ApiResponse<{ id: string }>> {
    try {
      // Get the audio file first to find the storage path
      const { data: audioData, error: getError } = await supabaseAdmin
        .from('audio_files')
        .select('*')
        .eq('id', id)
        .single();

      if (getError) {
        if (getError.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: `Audio file with ID ${id} not found`
            }
          };
        }
        
        logger.error('Error getting audio file before delete', { error: getError, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to fetch audio file for deletion',
            details: getError
          }
        };
      }

      // Delete from the database
      const { error: deleteError } = await supabaseAdmin
        .from('audio_files')
        .delete()
        .eq('id', id);

      if (deleteError) {
        logger.error('Error deleting audio file from database', { error: deleteError, id });
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to delete audio file record',
            details: deleteError
          }
        };
      }

      // Delete from storage
      const { error: storageError } = await supabaseAdmin
        .storage
        .from(config.storageBucket)
        .remove([audioData.storage_path]);

      if (storageError) {
        logger.warn('Error deleting audio file from storage', { 
          error: storageError, 
          id, 
          storagePath: audioData.storage_path 
        });
        // We don't fail the whole operation if storage deletion fails
      }

      return {
        success: true,
        data: { id }
      };
    } catch (error) {
      logger.error('Unexpected error deleting audio', { error, id });
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
   * Helper method to get content type from format
   */
  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'm4a': 'audio/mp4'
    };

    return contentTypes[format.toLowerCase()] || 'application/octet-stream';
  }
}

export const audioService = new AudioService();
