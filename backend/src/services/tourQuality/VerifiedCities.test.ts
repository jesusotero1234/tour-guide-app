import {
  getCanonicalVerifiedCity,
  getQualityStatusForRequest,
  getVerifiedCityThemes,
  isVerifiedCityTheme,
  normalizeCityName,
} from './VerifiedCities';

describe('VerifiedCities', () => {
  it('marks Madrid history in Spain as verified', () => {
    expect(isVerifiedCityTheme('Madrid', 'ES', 'history')).toBe(true);
  });

  it('does not auto-verify a different theme', () => {
    expect(isVerifiedCityTheme('Madrid', 'ES', 'architecture')).toBe(false);
  });

  it('resolves Rome to canonical Roma in Italy', () => {
    expect(getCanonicalVerifiedCity('Rome', 'IT', 'history')).toBe('Roma');
  });

  it('normalizes accents and casing for Malaga', () => {
    expect(normalizeCityName('  MÁLAGA ')).toBe('malaga');
    expect(getCanonicalVerifiedCity('Málaga', 'ES', 'history')).toBe('Malaga');
  });

  it('does not collide Toledo across countries', () => {
    expect(isVerifiedCityTheme('Toledo', 'ES', 'history')).toBe(true);
    expect(isVerifiedCityTheme('Toledo', 'US', 'history')).toBe(false);
  });

  it('returns unverified for unknown cities', () => {
    expect(getQualityStatusForRequest('Kyoto', 'JP', 'history')).toBe('unverified');
  });

  it('exposes the verified history list from a single registry', () => {
    expect(getVerifiedCityThemes('history')).toEqual([
      { canonicalCity: 'Madrid', countryCode: 'ES', theme: 'history' },
      { canonicalCity: 'Berlin', countryCode: 'DE', theme: 'history' },
      { canonicalCity: 'Paris', countryCode: 'FR', theme: 'history' },
      { canonicalCity: 'Roma', countryCode: 'IT', theme: 'history' },
      { canonicalCity: 'Amsterdam', countryCode: 'NL', theme: 'history' },
      { canonicalCity: 'Barcelona', countryCode: 'ES', theme: 'history' },
      { canonicalCity: 'Toulouse', countryCode: 'FR', theme: 'history' },
      { canonicalCity: 'Toledo', countryCode: 'ES', theme: 'history' },
      { canonicalCity: 'Valencia', countryCode: 'ES', theme: 'history' },
      { canonicalCity: 'Malaga', countryCode: 'ES', theme: 'history' },
    ]);
  });
});
