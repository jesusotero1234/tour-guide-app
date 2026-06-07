import { TourQualityStatus } from '../../types/tourQuality';

interface VerifiedCityEntry {
  canonicalCity: string;
  countryCode: string;
  theme: string;
  aliases?: string[];
}

const VERIFIED_CITY_ENTRIES: VerifiedCityEntry[] = [
  { canonicalCity: 'Madrid', countryCode: 'ES', theme: 'history' },
  { canonicalCity: 'Berlin', countryCode: 'DE', theme: 'history' },
  { canonicalCity: 'Paris', countryCode: 'FR', theme: 'history' },
  { canonicalCity: 'Roma', countryCode: 'IT', theme: 'history', aliases: ['Rome'] },
  { canonicalCity: 'Amsterdam', countryCode: 'NL', theme: 'history' },
  { canonicalCity: 'Barcelona', countryCode: 'ES', theme: 'history' },
  { canonicalCity: 'Toulouse', countryCode: 'FR', theme: 'history' },
  { canonicalCity: 'Toledo', countryCode: 'ES', theme: 'history' },
  { canonicalCity: 'Valencia', countryCode: 'ES', theme: 'history' },
  { canonicalCity: 'Malaga', countryCode: 'ES', theme: 'history', aliases: ['Málaga'] },
];

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeTheme(theme: string): string {
  return normalizeToken(theme);
}

function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

function matchesCity(entry: VerifiedCityEntry, normalizedCity: string): boolean {
  if (normalizeCityName(entry.canonicalCity) === normalizedCity) {
    return true;
  }

  return (entry.aliases ?? []).some((alias) => normalizeCityName(alias) === normalizedCity);
}

function findEntry(city: string, countryCode: string, theme: string): VerifiedCityEntry | undefined {
  const normalizedCity = normalizeCityName(city);
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const normalizedTheme = normalizeTheme(theme);

  return VERIFIED_CITY_ENTRIES.find((entry) => (
    entry.countryCode === normalizedCountryCode
    && normalizeTheme(entry.theme) === normalizedTheme
    && matchesCity(entry, normalizedCity)
  ));
}

export function normalizeCityName(city: string): string {
  return normalizeToken(city);
}

export function isVerifiedCityTheme(city: string, countryCode: string, theme: string): boolean {
  return Boolean(findEntry(city, countryCode, theme));
}

export function getCanonicalVerifiedCity(city: string, countryCode: string, theme: string): string | null {
  return findEntry(city, countryCode, theme)?.canonicalCity ?? null;
}

export function getVerifiedCityThemes(theme?: string): Array<Pick<VerifiedCityEntry, 'canonicalCity' | 'countryCode' | 'theme'>> {
  const normalizedTheme = theme ? normalizeTheme(theme) : null;

  return VERIFIED_CITY_ENTRIES
    .filter((entry) => normalizedTheme === null || normalizeTheme(entry.theme) === normalizedTheme)
    .map(({ canonicalCity, countryCode, theme: entryTheme }) => ({
      canonicalCity,
      countryCode,
      theme: entryTheme,
    }));
}

export function getQualityStatusForRequest(city: string, countryCode: string, theme: string): TourQualityStatus {
  return isVerifiedCityTheme(city, countryCode, theme) ? 'verified' : 'unverified';
}
