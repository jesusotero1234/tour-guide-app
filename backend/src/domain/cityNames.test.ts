import type { PrismaClient } from '@prisma/client';
import { citySearchAliases, getCityNames } from './cityNames';
import { PostgresTourRepository } from '../infrastructure/postgres/PostgresTourRepository';
import { presentPilotTour } from '../services/PilotRelease';
import type { Tour } from './entities/Tour';
import type { TourAudioState } from '../services/TourAudioService';

describe('catalogue city names', () => {
  it.each(['Séville', 'seville', '  SÉV  ', 'Siviglia', 'Sevilla'])('finds Sevilla by %s', query => {
    expect(citySearchAliases(query)).toContainEqual(expect.objectContaining({
      countryCode: 'ES', names: expect.arrayContaining(['Sevilla', 'Séville', 'Seville', 'Siviglia']),
    }));
  });

  it('uses the country when translating names and preserves unknown places', () => {
    expect(getCityNames('Barcelona', 'es')?.fr).toBe('Barcelone');
    expect(getCityNames('Roma', 'IT')?.fr).toBe('Rome');
    expect(getCityNames('Munich', 'DE')?.de).toBe('München');
    expect(getCityNames('Valence', 'FR')).toBeUndefined();
    expect(getCityNames('Toledo', 'US')).toBeUndefined();
    expect(getCityNames('Unknown town', 'ES')).toBeUndefined();
    expect(citySearchAliases('   ')).toEqual([]);
  });

  it('adds country-scoped aliases to catalogue search and keeps filters and pagination', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PostgresTourRepository({ tour: { findMany } } as unknown as PrismaClient);
    await repository.list({ city: 'Sévi', cityMatch: 'contains', language: 'fr', status: 'published', limit: 20, offset: 3 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20, skip: 3,
      where: {
        language: 'fr', status: 'published',
        OR: [
          { city: { contains: 'Sévi', mode: 'insensitive' } },
          { countryCode: 'ES', city: { in: expect.arrayContaining(['Sevilla']), mode: 'insensitive' } },
        ],
      },
    }));
  });

  it('keeps generation identity exact and escapes wildcard searches', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PostgresTourRepository({ tour: { findMany } } as unknown as PrismaClient);
    await repository.list({ city: 'Rome', countryCode: 'IT' });
    expect(findMany.mock.calls[0][0].where).toEqual({ city: { equals: 'Rome', mode: 'insensitive' }, countryCode: 'IT' });
    await repository.list({ city: '%_', cityMatch: 'contains' });
    expect(findMany.mock.calls[1][0].where.OR).toEqual([{ city: { contains: '\\%\\_', mode: 'insensitive' } }]);
  });

  it('exposes display names without changing the saved city or tour language', () => {
    const tour = { id: 'example', city: 'Sevilla', countryCode: 'ES', language: 'es', places: [] } as unknown as Tour;
    const response = presentPilotTour(tour, { audioUrls: {} } as TourAudioState, true);
    expect(response).toMatchObject({ city: 'Sevilla', language: 'es', cityNames: { fr: 'Séville', en: 'Seville' } });
    expect(tour.city).toBe('Sevilla');
  });
});
