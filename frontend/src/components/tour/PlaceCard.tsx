import { Place } from '@/types/api';

interface PlaceCardProps {
  place: Place;
  language?: string;
}

export const PlaceCard = ({ place }: PlaceCardProps) => {
  const paragraphs = place.description.split('\n\n').filter((paragraph) => paragraph.trim().length > 0);

  return (
    <article className="mb-4 rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm sm:p-6">
      <div className="mb-4 border-b border-darkBrown/15 pb-3">
        <h3 className="text-2xl font-serif font-bold text-darkBrown sm:text-[2rem]">{place.name}</h3>
        {place.nameInTourLanguage && (
          <p className="mt-1 font-serif text-sm italic text-darkBrown/60">{place.nameInTourLanguage}</p>
        )}
      </div>

      {place.imageUrl && (
        <div className="mx-auto mb-6 mt-6 w-full max-w-xl overflow-hidden rounded-2xl shadow-sm">
          {/* Existing remote image support is intentionally retained for generated tours. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.imageUrl}
            alt={place.name}
            className="h-64 w-full object-cover"
          />
        </div>
      )}

      <div className="font-serif text-base leading-8 text-darkBrown">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className={index === 0 ? 'leading-8' : 'mt-4 leading-8'}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
};
