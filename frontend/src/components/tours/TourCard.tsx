'use client';

import Link from 'next/link';
import { Tour } from '@/types/api';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { browseCopy } from '@/lib/browseCopy';

export const TourCard = ({ tour }: { tour: Tour }) => {
  const { language } = usePageLanguage();
  const t = browseCopy(language);
  const city = tour.cityNames?.[language] || tour.city;
  const country = /^[A-Z]{2}$/i.test(tour.countryCode ?? '')
    ? new Intl.DisplayNames([language], { type: 'region' }).of(tour.countryCode.toUpperCase()) || tour.country
    : tour.country;
  return (
  <article className="rounded-2xl border border-darkBrown/15 bg-surface-elevated p-5 text-darkBrown">
    {tour.localReview && <p className="mb-2 text-xs font-medium text-darkBrown/70">{t.privateReview}</p>}
    <h2 className="font-serif text-xl" lang={tour.title ? tour.language : language}>{tour.title || `${city}, ${country}`}</h2>
    <p className="mt-2 text-sm text-darkBrown/70">{city}, {country}</p>
    {tour.subtitle && <p lang={tour.language} className="mt-3 text-sm leading-relaxed text-darkBrown/75">{tour.subtitle}</p>}
    <p className="my-4 text-sm text-darkBrown/75">
      {tour.durationMinutes > 0 && <>{tour.durationMinutes} min · </>}
      {t.stopsCount(tour.places.length)} · {tour.language.toUpperCase()}
    </p>
    <Link href={`/tours/${tour.id}`} className="flex min-h-12 items-center justify-center rounded-xl bg-darkBrown px-4 py-3 text-base font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-darkBrown">{t.viewTour}</Link>
  </article>
);
};
