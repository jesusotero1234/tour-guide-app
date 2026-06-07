import { Place } from './Place';
import { TourMetadata } from '../../types/tourQuality';

export interface Tour {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  theme: string;
  language: string;
  durationMinutes: number;
  places: Place[];
  metadata?: TourMetadata;
  createdAt: string;
  updatedAt: string;
}
