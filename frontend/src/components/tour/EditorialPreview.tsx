'use client';

import { ChangeEvent, useState } from 'react';
import dynamic from 'next/dynamic';
import { Tour } from '@/types/api';
import { PlaceCard } from './PlaceCard';

const TourMap = dynamic(
  () => import('@/components/tour/map/TourMap').then((module) => module.TourMap),
  { ssr: false },
);

type PreviewTour = Tour & {
  metadata?: {
    textAudit?: { passed?: boolean; score?: number; reasons?: string[] };
  };
};

export function EditorialPreview() {
  const [tour, setTour] = useState<PreviewTour | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as PreviewTour;
      if (!parsed.city || !Array.isArray(parsed.places)) throw new Error('Not a tour artifact');
      setTour(parsed);
      setError(null);
    } catch (parseError) {
      console.error('Invalid preview artifact:', parseError);
      setTour(null);
      setError('This file is not a valid tour JSON artifact.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm">
        <h1 className="text-3xl font-serif font-bold text-darkBrown">Editorial tour preview</h1>
        <p className="mt-2 text-sm leading-6 text-darkBrown/70">Load a local fixture or generated tour. This page never generates, persists, or publishes.</p>
        <input type="file" accept="application/json,.json" onChange={loadFile} className="mt-4 block w-full text-sm text-darkBrown" />
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {tour && (
        <>
          <section className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-mutedGold">{tour.status || 'artifact'}</p>
            <h2 className="mt-2 text-2xl font-serif font-bold text-darkBrown">{tour.city} · {tour.theme} · {tour.durationMinutes} min</h2>
            {tour.metadata?.textAudit && (
              <p className={`mt-3 text-sm font-medium ${tour.metadata.textAudit.passed ? 'text-darkBrown' : 'text-danger'}`}>
                Text audit: {tour.metadata.textAudit.passed ? 'pass' : 'fail'} · score {tour.metadata.textAudit.score ?? '—'}
                {tour.metadata.textAudit.reasons?.length ? ` · ${tour.metadata.textAudit.reasons.join(', ')}` : ''}
              </p>
            )}
            {tour.introduction && <p className="mt-4 font-serif text-lg leading-8 text-darkBrown">{tour.introduction}</p>}
          </section>

          {tour.places.length > 0 && (
            <TourMap stops={tour.places} currentIndex={0} onStopSelect={() => {}} userLocation={null} />
          )}
          <div>
            {tour.places.map((place) => <PlaceCard key={place.id || place.position} place={place} language={tour.language} />)}
          </div>
        </>
      )}
    </div>
  );
}
