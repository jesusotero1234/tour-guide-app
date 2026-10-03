import { coverOf, type CardTour } from '@/lib/tourSummary';
import { TourPhoto } from '@/components/tour/TourPhoto';

export function TourCover({ tour, priority = false }: { tour: CardTour; priority?: boolean }) {
  const photo = coverOf(tour);
  if (!photo) return null;
  return <div className="tour-cover"><TourPhoto key={photo.id + photo.url} photo={photo} language={tour.language} hero priority={priority} /></div>;
}
