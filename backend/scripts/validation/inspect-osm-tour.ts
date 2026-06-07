import 'dotenv/config';
import { OrchestrationService } from '../../src/services/orchestrationService';
import { TourRepository } from '../../src/domain/repositories/TourRepository';
import { AudioAssetRepository } from '../../src/domain/repositories/AudioAssetRepository';
import { AudioStorage } from '../../src/domain/storage/AudioStorage';
import { Tour } from '../../src/domain/entities/Tour';
import { AudioAsset } from '../../src/domain/entities/AudioAsset';

class NullTourRepository implements TourRepository {
  async save(tour: Tour): Promise<Tour> { return tour; }
  async findById(): Promise<Tour | null> { return null; }
  async listRecent(): Promise<Tour[]> { return []; }
  async list(): Promise<Tour[]> { return []; }
}

class NullAudioAssetRepository implements AudioAssetRepository {
  async findByPlaceId(): Promise<AudioAsset | null> { return null; }
  async save(asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioAsset> {
    return {
      id: 'debug-audio',
      placeId: asset.placeId,
      language: asset.language,
      format: asset.format,
      storagePath: asset.storagePath,
      audioUrl: asset.audioUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

class NullAudioStorage implements AudioStorage {
  async save(): Promise<{ storagePath: string; audioUrl: string }> {
    return { storagePath: 'debug.wav', audioUrl: '' };
  }
}

async function main(): Promise<void> {
  const city = process.argv[2] || 'Madrid';
  const theme = process.argv[3] || 'history';
  const language = process.argv[4] || 'es';
  const durationMinutes = Number(process.argv[5] || '240');

  const service = new OrchestrationService(
    new NullTourRepository(),
    new NullAudioAssetRepository(),
    new NullAudioStorage()
  );

  const result = await (service as any).generatePlacesFromOsm(city, theme, language, durationMinutes);

  const summary = {
    city,
    theme,
    language,
    durationMinutes,
    degraded: result.routeDiagnostics.degraded,
    degradationReason: result.routeDiagnostics.degradationReason,
    coverageRatio: Number(result.routeDiagnostics.coverageRatio.toFixed(3)),
    estimatedTourMinutes: Math.round(result.routeDiagnostics.estimatedTourMinutes),
    stopCount: result.places.length,
    places: result.places.map((place: any, index: number) => ({
      index,
      name: place.name,
      category: place.category,
      lat: place.coordinates?.lat,
      lng: place.coordinates?.lng,
      textPreview: typeof place.description === 'string' ? place.description.slice(0, 280) : '',
      sections: place.descriptionSections,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[inspect-osm-tour] failed:', error);
  process.exit(1);
});
