import type { Language, Tour, WalkingRoute } from '@/types/api';
import { SEO_CITIES, SEO_ROUTE_DEFINITIONS, type SeoCity, type SeoRouteDefinition } from './seoInventory';
import { seoCopy } from './seoCopy';
export { SEO_CITIES, type SeoCity } from './seoInventory';
export { isSeoPagePath } from './seoInventory';

export const SITE_URL = 'https://nomuvia.com';
export type SeoLocale = Language;
export const SEO_LOCALES: readonly SeoLocale[] = ['es', 'en', 'fr', 'de', 'it'];
export interface SeoRoute extends SeoRouteDefinition {
  title: string;
  description: string;
  summary: string;
}
export interface SeoEntry {
  route: SeoRoute;
  tour: Tour;
  city: SeoCity;
}
export type SeoWalkingRoute = Pick<WalkingRoute, 'distanceMeters' | 'durationSeconds'>;

// Preserve the editorial copy and URLs from the first Madrid release.
const madridOverrides = [
  {
    id: '5b393fef-f58b-5e42-861e-b3baafbb3a8a', locale: 'es', slug: 'madrid-esencial', group: 'madrid-general',
    title: 'Madrid esencial: ruta a pie con audioguía gratis',
    description: 'Descubre Madrid por libre, de la Almudena a la plaza de Colón. Siete paradas con audio, texto y mapa. Gratis, sin instalar nada ni crear una cuenta.',
    summary: 'De la Almudena a la plaza de Colón, un paseo por palacios, plazas y puertas de la ciudad. Elige cuándo empezar y dedica a cada parada el tiempo que quieras.',
  },
  {
    id: '169a5a4c-3748-51e9-8aa6-5f96df1eb8f4', locale: 'en', slug: 'madrid-highlights', group: 'madrid-general',
    title: 'Madrid highlights: free self-guided audio walking tour',
    description: 'Explore Madrid at your own pace, from Almudena Cathedral to Plaza de Colón. Seven stops with audio, text and a map. Free, with no app or account needed.',
    summary: 'Walk from Almudena Cathedral to Plaza de Colón through the palaces, squares and gateways of Madrid. Start whenever you like and take your time at each stop.',
  },
  {
    id: 'bdfc7fda-3643-5a06-ae6a-23a09489fc1e', locale: 'es', slug: 'madrid-de-los-austrias', group: 'madrid-austrias',
    title: 'Madrid de los Austrias: audioguía gratis a pie',
    description: 'Recorre el Madrid de los Austrias desde la Plaza de Oriente al Palacio de Santa Cruz. Cinco paradas con audioguía gratuita, a tu ritmo y sin registro.',
    summary: 'Una villa se convierte en corte. Sigue las decisiones que transformaron Madrid, desde el antiguo Alcázar y las Descalzas Reales hasta la Plaza Mayor y el Palacio de Santa Cruz.',
  },
];

export const SEO_ROUTES: readonly SeoRouteDefinition[] = SEO_ROUTE_DEFINITIONS.map(route => {
  const existing = madridOverrides.find(item => item.id === route.id);
  return existing ? { ...route, title: existing.title, description: existing.description, summary: existing.summary } : route;
});

export const isSeoLocale = (value: string): value is SeoLocale => SEO_LOCALES.includes(value as SeoLocale);
export const findSeoCity = (slug: string) => SEO_CITIES.find(city => city.slug === slug);
export const cityPath = (locale: SeoLocale, city: string) => `/${locale}/${city}`;
export const routePath = (route: SeoRouteDefinition) => `${cityPath(route.locale, route.city)}/rutas/${route.slug}`;
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href;

export function cityAlternates(city: string, entries: SeoEntry[]): Record<string, string> {
  return Object.fromEntries(SEO_LOCALES
    .filter(locale => entries.some(entry => entry.route.city === city && entry.route.locale === locale))
    .map(locale => [locale, absoluteUrl(cityPath(locale, city))]));
}

export function routeAlternates(entry: SeoEntry, entries: SeoEntry[]): Record<string, string> {
  return Object.fromEntries(entries.filter(other => other.route.city === entry.route.city && other.route.group === entry.route.group
    && other.tour.places.length === entry.tour.places.length
    && other.tour.places.every((place, i) => Math.abs(place.latitude - entry.tour.places[i].latitude) < 0.00001
      && Math.abs(place.longitude - entry.tour.places[i].longitude) < 0.00001))
    .map(other => [other.route.locale, absoluteUrl(routePath(other.route))]));
}

const madridContent = {
  es: {
    title: 'Audioguía de Madrid gratis: rutas a pie',
    description: 'Descubre Madrid a tu ritmo con rutas a pie y audioguías gratuitas. Consulta las paradas, elige tu paseo y empieza sin instalar nada ni registrarte.',
    heading: 'Madrid tiene mucho que contarte.',
  },
  en: {
    title: 'Free Madrid audio guides and self-guided walking tours',
    description: 'Discover Madrid at your own pace with free audio walking tours. Explore the stops, choose your walk and start listening. No app or account needed.',
    heading: 'Madrid has a lot to tell you.',
  },
} as const;

export function cityContent(locale: SeoLocale, city: SeoCity) {
  if (city.slug === 'madrid' && (locale === 'es' || locale === 'en')) return madridContent[locale];
  const t = seoCopy(locale), name = city.names[locale];
  return { title: t.cityTitle(name), description: t.cityDescription(name), heading: t.cityHeading(name) };
}

export function seoEntry(definition: SeoRouteDefinition, tour: Tour): SeoEntry {
  const city = findSeoCity(definition.city)!;
  const t = seoCopy(definition.locale);
  const places = [...tour.places].sort((a, b) => a.position - b.position);
  const first = places[0], last = places[places.length - 1];
  const description = definition.description ?? t.routeDescription(city.names[definition.locale], first.nameInTourLanguage || first.name, last.nameInTourLanguage || last.name, places.length);
  // Reuse this tour's already-published introduction, without fabricating new stories.
  const introduction = tour.introduction?.replace(/\s+/g, ' ').trim();
  const excerpt = introduction && introduction.length > 360 ? introduction.slice(0, 357).replace(/\s+\S*$/, '') + '…' : introduction;
  return { city, tour: { ...tour, places }, route: { ...definition,
    title: definition.title ?? (tour.title?.trim() || t.routeTitle(city.names[definition.locale])),
    description, summary: definition.summary ?? (excerpt || description),
  } };
}
