'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTourStore } from '@/lib/store';
import type { Tour } from '@/types/api';
import { TourExperience } from '@/components/tour/TourExperience';
import { TourOverview } from '@/components/tours/TourOverview';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { browseCopy } from '@/lib/browseCopy';
import '@/components/tours/MobileTours.css';

/** The tour arrives already loaded from the server; `tour` is null only when the backend could not be reached. */
export function TourDetailClient({ tour }: { tour: Tour | null }) {
  const search = useSearchParams();
  const router = useRouter();
  const { language } = usePageLanguage();
  const t = mobileTourCopy(language);
  const setTour = useTourStore(state => state.setTour);
  useEffect(() => { if (tour) setTour(tour); }, [tour, setTour]);

  if (tour) return search.get('listen') === '1' ? <TourExperience key={tour.id} tour={tour} /> : <TourOverview key={tour.id} tour={tour} />;
  return <main className="min-h-screen bg-surface p-6 text-darkBrown">
    <Link href="/tours" className="inline-flex min-h-11 items-center">← {t.allWalks}</Link>
    <div className="mx-auto mt-24 max-w-sm text-center">
      <p role="alert">{t.loadError}</p>
      <button className="mt-4 min-h-11 rounded-full border px-6" onClick={() => router.refresh()}>{browseCopy(language).retry}</button>
    </div>
  </main>;
}
