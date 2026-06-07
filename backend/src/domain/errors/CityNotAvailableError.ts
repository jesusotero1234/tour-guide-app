export const CITY_NOT_AVAILABLE_CODE = 'CITY_NOT_AVAILABLE';

export class CityNotAvailableError extends Error {
  readonly code = CITY_NOT_AVAILABLE_CODE;

  constructor(city: string, poiCount: number) {
    super(
      `Not enough POIs available for "${city}" (found ${poiCount}, minimum 5 required)`
    );
    this.name = 'CityNotAvailableError';
  }
}
