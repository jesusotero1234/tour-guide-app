'use client';

import { Tour } from '@/types/api';
import { useRouter } from 'next/navigation';

interface TourCardProps {
  tour: Tour;
}

export const TourCard = ({ tour }: TourCardProps) => {
  const router = useRouter();
  
  const handleClick = () => {
    router.push(`/tours/${tour.id}`);
  };
  
  // Format creation date
  const formattedDate = new Date(tour.createdAt ?? tour.created_at ?? new Date().toISOString()).toLocaleDateString();
  const previewStops = tour.previewStopNames?.join(' · ');
  
  return (
    <div 
      className="cursor-pointer rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm transition-shadow hover:shadow-md"
      onClick={handleClick}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-serif font-medium text-darkBrown">
            {tour.title || `${tour.city}, ${tour.country}`}
          </h3>
          <p className="mt-1 text-sm text-darkBrown/65">
            {tour.city}, {tour.country}
          </p>
          {tour.subtitle && (
            <p className="mt-2 text-sm leading-6 text-darkBrown/75">
              {tour.subtitle}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {tour.experienceLabel && (
            <span className="inline-flex items-center rounded-full border border-darkBrown/20 bg-surface px-2.5 py-1 text-xs font-medium text-darkBrown">
              {tour.experienceLabel}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-mutedGold/20 px-2.5 py-1 text-xs font-medium text-darkBrown">
            {tour.language.toUpperCase()} guide
          </span>
        </div>
      </div>
      
      <div className="mb-3 text-sm text-darkBrown/60">
        Created {formattedDate}
      </div>

      {previewStops && (
        <div className="mb-4 text-sm text-darkBrown/75">
          {previewStops}
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div className="text-sm text-darkBrown/80">
          {tour.places.length} {tour.places.length === 1 ? 'stop' : 'stops'}
        </div>
        <div className="text-sm font-medium text-mutedGold hover:text-darkBrown transition-colors">
          Open walk →
        </div>
      </div>
    </div>
  );
};
