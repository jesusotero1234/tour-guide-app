import { Place } from './Place';
import { TourMetadata } from '../../types/tourQuality';

export type TourStatus = 'draft' | 'review' | 'published' | 'archived';

export interface Tour {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  theme: string;
  language: string;
  durationMinutes: number;
  status?: TourStatus;
  introduction?: string;
  places: Place[];
  metadata?: TourMetadata;
  blueprintId?: string;
  createdAt: string;
  updatedAt: string;
}
