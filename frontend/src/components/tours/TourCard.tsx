'use client';

import Link from 'next/link';
import { stopCountOf, type CardTour } from '@/lib/tourSummary';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { browseCopy } from '@/lib/browseCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { TourCover } from './TourCover';
import { TourSample } from './TourSample';

/** The whole card opens the tour through one link, the title (a stretched link); "View tour" is only a visual cue and is hidden from assistive technology. */
export const TourCard = ({ tour, priority = false, prefetch, distance }: { tour: CardTour; priority?: boolean; prefetch?: boolean; distance?: string }) => {
  const { language } = usePageLanguage();
  const t = browseCopy(language);
  const m = mobileTourCopy(language);
  const city = tour.cityNames?.[language] || tour.city;
  const country = /^[A-Z]{2}$/i.test(tour.countryCode ?? '')
    ? new Intl.DisplayNames([language], { type: 'region' }).of(tour.countryCode.toUpperCase()) || tour.country : tour.country;
  return <article className="mobile-tour-card">
    <TourCover tour={tour} priority={priority} />
    <div className="mobile-tour-card-body">
      <p className="tour-eyebrow">{city} · {m.walkingTour}</p>
      {tour.localReview && <p className="tour-private-review">{t.privateReview}</p>}
      <h3 lang={tour.title ? tour.language : language}><Link href={`/tours/${tour.id}`} prefetch={prefetch}>{tour.title || `${city}, ${country}`}</Link></h3>
      {tour.subtitle && <p className="tour-card-description" lang={tour.language}>{tour.subtitle}</p>}
      {!tour.subtitle && tour.introduction && <p className="tour-card-description" lang={tour.language}>{tour.introduction}</p>}
      <p className="tour-card-meta">{distance && <span className="tour-card-distance">{distance}</span>}{tour.durationMinutes > 0 && <span>~{tour.durationMinutes} min <span className="sr-only">{m.estimated}</span></span>}<span>{t.stopsCount(stopCountOf(tour))}</span><span lang={tour.language}>{tour.language.toUpperCase()}</span></p>
      <div className="tour-card-actions"><TourSample tour={tour} language={language} /><span className="tour-card-link" aria-hidden="true">{t.viewTour}</span></div>
    </div>
  </article>;
};
