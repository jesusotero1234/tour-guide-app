import { cache } from 'react';
import { proxyBackend } from './backendProxy';
import { SEO_CITIES, SEO_ROUTES, findSeoCity, seoEntry, type SeoEntry, type SeoWalkingRoute } from './seoCatalog';
import type { Tour } from '@/types/api';

export const getSeoCityCatalog = cache(async (citySlug: string): Promise<SeoEntry[]> => {
  const city = findSeoCity(citySlug);
  if (!city) return [];
  // A city/route page checks only its own editions, not the full inventory.
  const entries = await Promise.all(SEO_ROUTES.filter(route => route.city === citySlug).map(async route => {
    const response = await proxyBackend(`tours/${route.id}`, { signal: AbortSignal.timeout(12000) });
    if (response.status === 404 || response.status === 410) return null;
    // An outage must fail the page/sitemap, not publish an empty catalog or erase URLs.
    if (!response.ok) throw new Error(`Public catalog unavailable (${response.status})`);
    const tour = await response.json() as Tour;
    if (tour.status !== 'published' || tour.localReview) return null;
    if (tour.id !== route.id || tour.language !== route.locale || tour.city !== city.name
      || tour.countryCode?.toUpperCase() !== city.countryCode || !tour.places?.length
      || !tour.places.every(place => place.id && place.name && place.description?.trim() && place.audioUrl
        && Number.isFinite(place.latitude) && Number.isFinite(place.longitude))) {
      throw new Error('Invalid public tour data');
    }
    return seoEntry(route, tour);
  }));
  return entries.filter((entry): entry is SeoEntry => entry !== null);
});

export const getSeoCatalog = cache(async (): Promise<SeoEntry[]> => {
  const entries: SeoEntry[] = [];
  // Bound sitemap concurrency; a backend outage must never erase its URLs.
  for (let i = 0; i < SEO_CITIES.length; i += 3) {
    entries.push(...(await Promise.all(SEO_CITIES.slice(i, i + 3).map(city => getSeoCityCatalog(city.slug)))).flat());
  }
  return entries;
});

export const getSeoWalkingRoute = cache(async (id: string): Promise<SeoWalkingRoute | null> => {
  try {
    const response = await proxyBackend(`tours/${id}/walking-route`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const { data } = await response.json();
    if (!Number.isFinite(data?.distanceMeters) || data.distanceMeters <= 0
      || !Number.isFinite(data?.durationSeconds) || data.durationSeconds <= 0) return null;
    return { distanceMeters: data.distanceMeters, durationSeconds: data.durationSeconds };
  } catch {
    // The written route and audio remain useful if routing is temporarily unavailable.
    return null;
  }
});
