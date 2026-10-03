import type { Tour, TourSummary } from '@/types/api';
import type { TourImage } from '@/types/tourImages';
import { getVerifiedTourImages } from '@/components/tour/PlaceCard';

/** A card is drawn from a full tour (the tour's own page, the city pages) or from a catalogue summary; these read the same facts from either. */
export type CardTour = Tour | TourSummary;
const isFull = (tour: CardTour): tour is Tour => 'places' in tour;

export const stopCountOf = (tour: CardTour) => (isFull(tour) ? tour.places.length : tour.stopCount);
export const startOf = (tour: CardTour) => (isFull(tour) ? tour.places[0] : tour.start);
export const sampleUrlOf = (tour: CardTour) => (isFull(tour)
  ? tour.introductionAudio?.audioUrl || tour.places.find(place => place.audioUrl)?.audioUrl : tour.sampleAudioUrl);
export const coverOf = (tour: CardTour): TourImage | undefined => (isFull(tour)
  ? tour.places.flatMap(place => getVerifiedTourImages(place)).find(image => image.role === 'primary') : tour.cover);
