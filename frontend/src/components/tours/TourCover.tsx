import type { Tour } from '@/types/api';
import { getVerifiedTourImages } from '@/components/tour/PlaceCard';
import { TourPhoto } from '@/components/tour/TourPhoto';

export function TourCover({ tour, priority = false }: { tour: Tour; priority?: boolean }) {
  const photo = tour.places.flatMap(place => getVerifiedTourImages(place)).find(image => image.role === 'primary');
  if (!photo) return null;
  return <div className="tour-cover"><TourPhoto key={photo.id + photo.url} photo={photo} language={tour.language} hero priority={priority} /></div>;
}
