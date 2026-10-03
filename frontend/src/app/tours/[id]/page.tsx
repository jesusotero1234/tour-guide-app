import { notFound } from 'next/navigation';
import { proxyBackend } from '@/lib/backendProxy';
import { TourDetailClient } from '@/components/tours/TourDetailClient';
import type { Tour } from '@/types/api';

/** Read on the server, through the same gate as the browser proxy, so the page arrives with the tour instead of fetching it after loading. */
async function loadTour(id: string): Promise<Tour | 'missing' | null> {
  try {
    const response = await proxyBackend(`tours/${encodeURIComponent(id)}`);
    if ([400, 403, 404].includes(response.status)) return 'missing';
    if (!response.ok) return null;
    const tour = await response.json() as Tour;
    // The API already sends the stops by position; the player depends on it, so it is not left to chance.
    return Array.isArray(tour.places) ? { ...tour, places: [...tour.places].sort((a, b) => a.position - b.position) } : tour;
  } catch {
    return null;
  }
}

export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const tour = await loadTour((await params).id);
  if (tour === 'missing') notFound();
  return <TourDetailClient tour={tour} />;
}
