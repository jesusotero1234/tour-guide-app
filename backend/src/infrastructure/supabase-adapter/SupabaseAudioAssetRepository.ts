import axios from 'axios';
import { AudioAssetRepository } from '../../domain/repositories/AudioAssetRepository';
import { AudioAsset } from '../../domain/entities/AudioAsset';

export class SupabaseAudioAssetRepository implements AudioAssetRepository {
  constructor(private readonly baseUrl: string) {}

  async findByPlaceId(placeId: string): Promise<AudioAsset | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/audio/place/${placeId}`);

      if (!response.data || !response.data.success) {
        return null;
      }

      const items: any[] = response.data.data || [];
      if (items.length === 0) {
        console.warn(`No audio files found for place ${placeId}`);
        return null;
      }

      const sorted = [...items].sort((a, b) => {
        const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
        const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      const d = sorted[0];
      return {
        id: d.id,
        placeId: d.place_id || d.placeId || placeId,
        language: d.language || 'en',
        format: d.format || 'wav',
        storagePath: d.storage_path || d.storagePath || '',
        audioUrl: d.url || d.audioUrl || d.audio_url,
        createdAt: d.created_at || d.createdAt,
        updatedAt: d.updated_at || d.updatedAt
      };
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error(`Failed to fetch audio for place ${placeId}:`, error);
      return null;
    }
  }

  async save(_asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioAsset> {
    throw new Error('Not implemented: supabase-pod handles audio writes');
  }
}
