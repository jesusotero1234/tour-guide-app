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

  it.each([
    ['París', 'FR', 'it', 'Parigi'], ['Lyon', 'FR', 'en', 'Lyon'], ['Marsella', 'FR', 'it', 'Marsiglia'],
    ['Toulouse', 'FR', 'it', 'Tolosa'], ['Lille', 'FR', 'de', 'Lille'], ['Niza', 'FR', 'de', 'Nizza'],
    ['Burdeos', 'FR', 'en', 'Bordeaux'], ['Estrasburgo', 'FR', 'de', 'Straßburg'], ['Nantes', 'FR', 'fr', 'Nantes'],
    ['Montpellier', 'FR', 'it', 'Montpellier'], ['Berlín', 'DE', 'it', 'Berlino'], ['Múnich', 'DE', 'de', 'München'],
    ['Hamburgo', 'DE', 'fr', 'Hambourg'], ['Fráncfort del Meno', 'DE', 'en', 'Frankfurt'], ['Colonia', 'DE', 'de', 'Köln'],
    ['Düsseldorf', 'DE', 'en', 'Düsseldorf'], ['Dresde', 'DE', 'it', 'Dresda'], ['Núremberg', 'DE', 'de', 'Nürnberg'],
    ['Stuttgart', 'DE', 'it', 'Stoccarda'], ['Leipzig', 'DE', 'it', 'Lipsia'], ['Roma', 'IT', 'en', 'Rome'],
    ['Florencia', 'IT', 'it', 'Firenze'], ['Venecia', 'IT', 'fr', 'Venise'], ['Nápoles', 'IT', 'de', 'Neapel'],
    ['Milán', 'IT', 'de', 'Mailand'], ['Turín', 'IT', 'it', 'Torino'], ['Palermo', 'IT', 'fr', 'Palermo'],
    ['Bolonia', 'IT', 'fr', 'Bologne'], ['Pisa', 'IT', 'de', 'Pisa'], ['Verona', 'IT', 'en', 'Verona'],
  ] as const)('localizes %s for %s in %s', (city, countryCode, language, expected) => {
    expect(getCityNames(city, countryCode)?.[language]).toBe(expected);
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
