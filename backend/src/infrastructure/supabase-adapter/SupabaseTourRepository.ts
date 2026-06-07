import axios from 'axios';
import { ListToursOptions, TourRepository } from '../../domain/repositories/TourRepository';
import { Tour } from '../../domain/entities/Tour';
import { Place } from '../../domain/entities/Place';

export class SupabaseTourRepository implements TourRepository {
  constructor(private readonly baseUrl: string) {}

  async save(tour: Tour): Promise<Tour> {
    const tourResponse = await axios.post(`${this.baseUrl}/tours`, {
      tour: {
        city: tour.city,
        country: tour.country,
        country_code: tour.countryCode,
        theme: tour.theme,
        language: tour.language,
        duration_minutes: tour.durationMinutes,
        metadata: {
          ...(tour.metadata ?? {}),
          placeCount: tour.places.length
        }
      }
    });

    if (!tourResponse.data || !tourResponse.data.success) {
      throw new Error(tourResponse.data?.error?.message || 'Unknown storage error');
    }

    const tourId: string = tourResponse.data.data.id;
    console.log(`Created tour with ID: ${tourId}`);

    const savedPlaces: Place[] = [];
    for (let i = 0; i < tour.places.length; i++) {
      const place = tour.places[i];
      const position = i;
      const isFirst = i === 0;
      const isLast = i === tour.places.length - 1;

      try {
        const placeResponse = await axios.post(`${this.baseUrl}/places`, {
          place: {
            tour_id: tourId,
            name: place.name,
            description: place.description,
            lat: place.latitude,
            lng: place.longitude,
            position,
            importance_score: isFirst || isLast ? 0.9 : (place.importanceScore ?? 0.5),
            image_url: place.imageUrl,
            metadata: {
              ...(place.metadata ?? {}),
              isFirst,
              isLast,
              position,
            }
          }
        });

        if (placeResponse.data && placeResponse.data.success) {
          console.log(`Created place with ID: ${placeResponse.data.data.id} at position: ${position}`);
          savedPlaces.push({ ...place, id: placeResponse.data.data.id, tourId, position });
        } else {
          console.error(`Failed to create place: ${place.name}`, placeResponse.data?.error);
          savedPlaces.push({ ...place, tourId, position });
        }
      } catch (placeError) {
        console.error(`Error creating place: ${place.name}`, placeError);
        savedPlaces.push({ ...place, tourId, position });
      }
    }

    return {
      ...tour,
      id: tourId,
      places: savedPlaces,
      createdAt: tour.createdAt || new Date().toISOString(),
      updatedAt: tour.updatedAt || new Date().toISOString()
    };
  }

  async findById(id: string): Promise<Tour | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/tours/${id}`);

      if (!response.data.success) {
        if (response.data.error?.message?.toLowerCase().includes('not found')) {
          return null;
        }
        throw new Error(response.data.error?.message || 'Failed to retrieve tour');
      }

      const d = response.data.data;
      const rawPlaces: any[] = (d.places || []).sort(
        (a: any, b: any) => (a.position || 0) - (b.position || 0)
      );

      const places: Place[] = rawPlaces.map((p: any, idx: number) => ({
        id: p.id,
        tourId: d.id,
        name: p.name,
        description: p.description,
        latitude: p.coordinates?.lat ?? p.lat ?? 0,
        longitude: p.coordinates?.lng ?? p.lng ?? 0,
        position: p.position ?? idx,
        importanceScore: p.importance_score ?? p.importanceScore,
        imageUrl: p.imageUrl || p.image_url,
        audioUrl: p.audioUrl || p.audio_url,
        metadata: p.metadata,
        createdAt: p.created_at || p.createdAt,
        updatedAt: p.updated_at || p.updatedAt
      }));

      return {
        id: d.id,
        city: d.city,
        country: d.country,
        countryCode: d.country_code || d.countryCode,
        theme: d.theme,
        language: d.language,
        durationMinutes: d.duration_minutes ?? d.durationMinutes ?? 240,
        metadata: d.metadata,
        places,
        createdAt: d.created_at || d.createdAt,
        updatedAt: d.updated_at || d.updatedAt || d.created_at || d.createdAt
      };
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async listRecent(limit: number): Promise<Tour[]> {
    const response = await axios.get(`${this.baseUrl}/tours`, {
      params: { limit }
    });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list tours');
    }

    const items: any[] = response.data.data || [];
    return items.map((d: any) => ({
      id: d.id,
      city: d.city,
      country: d.country,
      countryCode: d.country_code || d.countryCode,
      theme: d.theme,
      language: d.language,
      durationMinutes: d.duration_minutes ?? d.durationMinutes ?? 240,
      places: (d.places || []).map((p: any, idx: number) => ({
        id: p.id,
        tourId: d.id,
        name: p.name,
        description: p.description,
        latitude: p.coordinates?.lat ?? p.lat ?? 0,
        longitude: p.coordinates?.lng ?? p.lng ?? 0,
        position: p.position ?? idx,
        importanceScore: p.importance_score ?? p.importanceScore,
        imageUrl: p.imageUrl || p.image_url,
        audioUrl: p.audioUrl || p.audio_url,
        metadata: p.metadata,
        createdAt: p.created_at || p.createdAt,
        updatedAt: p.updated_at || p.updatedAt
      })),
      metadata: d.metadata,
      createdAt: d.created_at || d.createdAt,
      updatedAt: d.updated_at || d.updatedAt || d.created_at || d.createdAt
    }));
  }

  async list(options: ListToursOptions): Promise<Tour[]> {
    const response = await axios.get(`${this.baseUrl}/tours`, {
        params: {
          city: options.city,
          countryCode: options.countryCode,
          theme: options.theme,
          language: options.language,
          durationMinutes: options.durationMinutes,
          limit: options.limit,
          offset: options.offset
        }
    });

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to list tours');
    }

    const items: any[] = response.data.data?.tours || response.data.data || [];
    return items.map((d: any) => ({
      id: d.id,
      city: d.city,
      country: d.country,
      countryCode: d.country_code || d.countryCode,
      theme: d.theme,
      language: d.language,
      durationMinutes: d.duration_minutes ?? d.durationMinutes ?? 240,
      metadata: d.metadata,
      places: (d.places || []).map((p: any, idx: number) => ({
        id: p.id,
        tourId: d.id,
        name: p.name,
        description: p.description,
        latitude: p.coordinates?.lat ?? p.lat ?? 0,
        longitude: p.coordinates?.lng ?? p.lng ?? 0,
        position: p.position ?? idx,
        importanceScore: p.importance_score ?? p.importanceScore,
        imageUrl: p.imageUrl || p.image_url,
        audioUrl: p.audioUrl || p.audio_url,
        metadata: p.metadata,
        createdAt: p.created_at || p.createdAt,
        updatedAt: p.updated_at || p.updatedAt
      })),
      createdAt: d.created_at || d.createdAt,
      updatedAt: d.updated_at || d.updatedAt || d.created_at || d.createdAt
    }));
  }
}
