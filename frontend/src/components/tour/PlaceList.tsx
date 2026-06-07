import { Tour } from '@/types/api';
import { PlaceCard } from './PlaceCard';

interface PlaceListProps {
  tour: Tour;
}

export const PlaceList = ({ tour }: PlaceListProps) => {
  return (
    <div className="space-y-6">
      <div className="mb-6 rounded-2xl border border-darkBrown/12 bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-3xl font-serif font-bold text-darkBrown mb-2 md:mb-0">
            {tour.title || `Tour of ${tour.city}, ${tour.country}`}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-beige border border-darkBrown/30 text-darkBrown">
              {tour.experienceLabel || tour.theme}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-mutedGold/20 text-darkBrown">
              {tour.language.toUpperCase()} audio
            </span>
          </div>
        </div>
        {tour.subtitle && (
          <p className="text-darkBrown/75 leading-7">
            {tour.subtitle}
          </p>
        )}
        
        <div className="mt-4 pt-4 border-t border-darkBrown/20">
          <h3 className="text-lg font-serif font-medium text-darkBrown mb-2">Tour Information</h3>
          <p className="text-darkBrown/80 leading-relaxed">
            Explore {tour.places.length} narrated stops in {tour.city}, {tour.country}. All content is available in {tour.language.toUpperCase()} audio and text.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {tour.places.map((place) => (
          <PlaceCard key={place.id} place={place} language={tour.language} />
        ))}
      </div>

      {tour.places.length === 0 && (
        <div className="text-center py-12 bg-beige rounded-lg border border-darkBrown/20">
          <p className="text-darkBrown/70 italic">
            No places found for this tour.
          </p>
        </div>
      )}
    </div>
  );
};
