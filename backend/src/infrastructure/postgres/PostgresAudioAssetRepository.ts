import { PrismaClient } from '@prisma/client';
import { AudioAssetRepository } from '../../domain/repositories/AudioAssetRepository';
import { AudioAsset } from '../../domain/entities/AudioAsset';

export class PostgresAudioAssetRepository implements AudioAssetRepository {
  private readonly baseUrl: string;

  constructor(
    private readonly client: PrismaClient,
    baseUrl: string = process.env.AUDIO_BASE_URL ?? 'http://localhost:3001/audio/'
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  }

  private toAudioAsset(
    row: {
      id: string;
      placeId: string;
      language: string;
      format: string;
      storagePath: string;
      createdAt: Date;
      updatedAt: Date;
    }
  ): AudioAsset {
    return {
      id: row.id,
      placeId: row.placeId,
      language: row.language,
      format: row.format,
      storagePath: row.storagePath,
      audioUrl: this.baseUrl + row.storagePath,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  async findByPlaceId(placeId: string): Promise<AudioAsset | null> {
    const row = await this.client.audioAsset.findFirst({
      where: { placeId },
      orderBy: { createdAt: 'desc' }
    });

    if (!row) {
      return null;
    }

    return this.toAudioAsset(row);
  }

  async save(
    asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AudioAsset> {
    const row = await this.client.audioAsset.create({
      data: {
        placeId: asset.placeId,
        language: asset.language,
        format: asset.format,
        storagePath: asset.storagePath
      }
    });

    return this.toAudioAsset(row);
  }
}
