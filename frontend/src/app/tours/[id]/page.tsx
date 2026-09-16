'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getTour } from '@/lib/api';
import { useTourStore } from '@/lib/store';
import { Tour } from '@/types/api';
import { TourExperience } from '@/components/tour/TourExperience';

export default function TourDetailPage() {
  const params = useParams();
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

  if (tour) return <TourExperience key={tour.id} tour={tour} />;
  return <main className="min-h-screen bg-surface p-6 text-darkBrown">
    <Link href="/tours" className="inline-flex min-h-11 items-center">← Volver</Link>
    <div className="mx-auto mt-24 max-w-sm text-center">
      <p role={failed ? 'alert' : 'status'}>{failed ? 'No se pudo cargar el tour.' : 'Cargando tu tour…'}</p>
      {failed && <button className="mt-4 min-h-11 rounded-full border px-6" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>}
    </div>
  </main>;
}
