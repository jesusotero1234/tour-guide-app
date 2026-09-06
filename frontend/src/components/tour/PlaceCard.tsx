import { Place } from '@/types/api';
import { TourImage, TourImageSet } from '@/types/tourImages';
import { TourPhoto } from './TourPhoto';

interface PlaceCardProps {
  place: Place;
  language?: string;
}

const isVerifiedImage = (image: TourImage, paragraphs: string[]): boolean => {
  if (!image || typeof image !== 'object') return false;
  if (!Number.isInteger(image.paragraphIndex) || image.paragraphIndex < 0 || image.paragraphIndex >= paragraphs.length) return false;
  if (image.paragraphText !== paragraphs[image.paragraphIndex]) return false;
  if (image.role !== 'primary' && image.role !== 'detail') return false;
  if (!image.attribution || !image.author || !image.license || !image.sourceUrl || !image.url || !image.alt || !image.caption) return false;
  try {
    const url = new URL(image.url);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (url.port !== '') return false;
    if (url.hostname !== 'upload.wikimedia.org' && url.hostname !== 'thumb.wikimedia.org') return false;
    const sourceUrl = new URL(image.sourceUrl);
    if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'commons.wikimedia.org') return false;
    if (sourceUrl.username || sourceUrl.password) return false;
    if (sourceUrl.port !== '') return false;
    if (!sourceUrl.pathname.startsWith('/wiki/File:')) return false;
    const licenseUrl = new URL(image.licenseUrl);
    if (licenseUrl.protocol !== 'https:' || licenseUrl.hostname !== 'creativecommons.org') return false;
    if (licenseUrl.username || licenseUrl.password) return false;
    if (licenseUrl.port !== '') return false;
  } catch {
    return false;
  }
  return true;
};

export const PlaceCard = ({ place, language }: PlaceCardProps) => {
  const paragraphs = place.description.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  const set: TourImageSet | undefined = place.metadata?.tourImages;
  const verifiedImages: TourImage[] = [];
  if (
    set &&
    set.version === 1 &&
    set.status === 'ready' &&
    set.sourceText === place.description &&
    Array.isArray(set.images)
  ) {
    for (const image of set.images) {
      if (!image || typeof image !== 'object') continue;
      if (isVerifiedImage(image, paragraphs)) {
        verifiedImages.push(image);
      }
    }
  }
  const primary = verifiedImages.find((i) => i.role === 'primary');
  const detail = primary
    ? verifiedImages.find((i) => i.role === 'detail' && i.id !== primary.id && i.url !== primary.url)
    : undefined;
  const selected = primary ? [primary, ...(detail ? [detail] : [])] : [];

  return (
    <article className="mb-4 rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm sm:p-6">
      <div className="mb-4 border-b border-darkBrown/15 pb-3">
        <h3 className="text-2xl font-serif font-bold text-darkBrown sm:text-[2rem]">{place.name}</h3>
        {place.nameInTourLanguage && (
          <p className="mt-1 font-serif text-sm italic text-darkBrown/60">{place.nameInTourLanguage}</p>
        )}
      </div>

      <div className="font-serif text-base leading-8 text-darkBrown">
        {paragraphs.map((paragraph, index) => {
          const photos = selected.filter((p) => p.paragraphIndex === index);
          return (
            <div key={index}>
              <p className={index === 0 ? 'leading-8' : 'mt-4 leading-8'}>{paragraph}</p>
              {photos.map((photo) => (
                <div key={`${photo.id}-${photo.paragraphId}`} className="mt-4">
                  <TourPhoto photo={photo} language={language} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </article>
  );
};
