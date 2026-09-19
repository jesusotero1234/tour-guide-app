'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getTour } from '@/lib/api';
import { useTourStore } from '@/lib/store';
import { Tour } from '@/types/api';
import { TourExperience } from '@/components/tour/TourExperience';
import { TourOverview } from '@/components/tours/TourOverview';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { browseCopy } from '@/lib/browseCopy';
import '@/components/tours/MobileTours.css';

export default function TourDetailPage() {
  const params = useParams();
  const search = useSearchParams();
  const { language } = usePageLanguage();
  const t = mobileTourCopy(language);
  const { setTour, setLoading, setError } = useTourStore();
  const [tour, setLocalTour] = useState<Tour | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setError(null);
    setLocalTour(null);
    void getTour(String(params.id)).then(data => {
      if (!active) return;
      setTour(data);
      setLocalTour(data);
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id, attempt, setTour, setLoading, setError]);

  if (tour) return search.get('listen') === '1' ? <TourExperience key={tour.id} tour={tour} /> : <TourOverview key={tour.id} tour={tour} />;
  return <main className="min-h-screen bg-surface p-6 text-darkBrown">
    <Link href="/tours" className="inline-flex min-h-11 items-center">← {t.allWalks}</Link>
    <div className="mx-auto mt-24 max-w-sm text-center">
      <p role={failed ? 'alert' : 'status'}>{failed ? t.loadError : t.loading}</p>
      {failed && <button className="mt-4 min-h-11 rounded-full border px-6" onClick={() => setAttempt(value => value + 1)}>{browseCopy(language).retry}</button>}
    </div>
  </main>;
}
