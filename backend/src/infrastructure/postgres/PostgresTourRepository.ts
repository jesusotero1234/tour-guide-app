import { PrismaClient } from '@prisma/client';
import { ListToursOptions, TourRepository } from '../../domain/repositories/TourRepository';
import { Tour, TourStatus } from '../../domain/entities/Tour';
import { Place, PlaceMetadata } from '../../domain/entities/Place';
import { TourMetadata } from '../../types/tourQuality';

type PrismaPlace = {
  id: string;
  tourId: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  position: number;
  importanceScore: number | null;
  imageUrl: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaTour = {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  theme: string;
  language: string;
  durationMinutes: number;
  status: string;
  introduction: string | null;
  metadata: unknown;
  blueprintId: string | null;
  createdAt: Date;
  updatedAt: Date;
  places: PrismaPlace[];
};

function mapTourMetadata(metadata: unknown): TourMetadata | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as TourMetadata;
}

function mapPlaceMetadata(metadata: unknown): PlaceMetadata | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as PlaceMetadata;
}

function mapPlace(p: PrismaPlace, tourId: string): Place {
  const metadata = mapPlaceMetadata(p.metadata);
  return {
    id: p.id,
    tourId,
    name: p.name,
    description: p.description,
    descriptionSections: metadata?.descriptionSections,
    nameInTourLanguage: metadata?.nameInTourLanguage,
    latitude: p.latitude,
    longitude: p.longitude,
    position: p.position,
    importanceScore: p.importanceScore ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    audioUrl: undefined,
    metadata,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString()
  };
}

function mapTour(t: PrismaTour): Tour {
  return {
    id: t.id,
    city: t.city,
    country: t.country,
    countryCode: t.countryCode,
    theme: t.theme,
    language: t.language,
    durationMinutes: t.durationMinutes,
    status: (t.status || 'draft') as TourStatus,
    introduction: t.introduction ?? undefined,
    metadata: mapTourMetadata(t.metadata),
    blueprintId: t.blueprintId ?? undefined,
    places: t.places.map(p => mapPlace(p, t.id)),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString()
  };
}

const PLACE_ORDER = { orderBy: { position: 'asc' } } as const;

export class PostgresTourRepository implements TourRepository {
  constructor(private readonly client: PrismaClient) {}

  async save(tour: Tour): Promise<Tour> {
    const saved = await this.client.$transaction(async (tx) => {
      const tourData: Record<string, unknown> = {
        city: tour.city,
        country: tour.country,
        countryCode: tour.countryCode,
        theme: tour.theme,
        language: tour.language,
        durationMinutes: tour.durationMinutes,
        status: tour.status ?? 'draft',
        introduction: tour.introduction ?? null,
        metadata: tour.metadata ?? {},
        blueprintId: tour.blueprintId ?? null
      };
      if (tour.id) {
        tourData.id = tour.id;
      }

      const dbTour = await tx.tour.create({ data: tourData as Parameters<typeof tx.tour.create>[0]['data'] });

      const dbPlaces = [];
      for (let i = 0; i < tour.places.length; i++) {
        const place = tour.places[i];
        const position = i;

        const placeData: Record<string, unknown> = {
          tourId: dbTour.id,
          name: place.name,
          description: place.description,
          latitude: place.latitude,
          longitude: place.longitude,
          position,
          importanceScore: place.importanceScore ?? null,
          imageUrl: place.imageUrl ?? null,
          metadata: {
            ...(place.metadata ?? {}),
            ...(place.descriptionSections ? { descriptionSections: place.descriptionSections } : {}),
            ...(place.nameInTourLanguage ? { nameInTourLanguage: place.nameInTourLanguage } : {}),
          }
        };
        if (place.id) {
          placeData.id = place.id;
        }

        const dbPlace = await tx.place.create({ data: placeData as Parameters<typeof tx.place.create>[0]['data'] });
        dbPlaces.push(dbPlace);
      }

      return { ...dbTour, places: dbPlaces };
    });

    return mapTour(saved as PrismaTour);
  }

  async findById(id: string): Promise<Tour | null> {
    const dbTour = await this.client.tour.findUnique({
      where: { id },
      include: { places: PLACE_ORDER }
    });

    if (!dbTour) {
      return null;
    }

    return mapTour(dbTour as unknown as PrismaTour);
  }

  async listRecent(limit: number): Promise<Tour[]> {
    const dbTours = await this.client.tour.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { places: PLACE_ORDER }
    });

    return dbTours.map(t => mapTour(t as unknown as PrismaTour));
  }

  async list(options: ListToursOptions): Promise<Tour[]> {
    const where: {
      city?: string;
      countryCode?: string;
      theme?: string;
      language?: string;
      durationMinutes?: number;
      status?: string;
    } = {};

    if (options.city) {
      where.city = options.city;
    }
    if (options.countryCode) {
      where.countryCode = options.countryCode;
    }
    if (options.theme) {
      where.theme = options.theme;
    }
    if (options.language) {
      where.language = options.language;
    }
    if (options.durationMinutes) {
      where.durationMinutes = options.durationMinutes;
    }
    if (options.status) {
      where.status = options.status;
    }

    const dbTours = await this.client.tour.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
      include: { places: PLACE_ORDER }
    });

    return dbTours.map(t => mapTour(t as unknown as PrismaTour));
  }

  async updateStatus(id: string, status: TourStatus): Promise<Tour> {
    const tour = await this.client.tour.update({
      where: { id },
      data: { status },
      include: { places: PLACE_ORDER },
    });

    return mapTour(tour as unknown as PrismaTour);
  }
}
