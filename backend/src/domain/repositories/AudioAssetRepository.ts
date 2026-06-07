import { AudioAsset } from '../entities/AudioAsset';

export interface AudioAssetRepository {
  findByPlaceId(placeId: string): Promise<AudioAsset | null>;
  save(asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioAsset>;
}
