import { Tour, TourStatus } from '../entities/Tour';

export type ListToursOptions = {
  city?: string;
  countryCode?: string;
  theme?: string;
  language?: string;
  durationMinutes?: number;
  status?: TourStatus;
  readyOnly?: boolean;
  limit?: number;
  offset?: number;
};

export interface TourRepository {
  save(tour: Tour): Promise<Tour>;
  findById(id: string): Promise<Tour | null>;
  listRecent(limit: number): Promise<Tour[]>;
  list(options: ListToursOptions): Promise<Tour[]>;
  updateStatus(id: string, status: TourStatus): Promise<Tour>;
}
