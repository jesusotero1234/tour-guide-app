'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { TourMapStop } from '@/components/tour/map/types';
import type { Language } from '@/types/api';
import { seoCopy } from '@/lib/seoCopy';

const TourMap = dynamic(() => import('@/components/tour/map/TourMap').then(module => module.TourMap), { ssr: false });

export function SeoRouteMap({ tourId, language, stops }: { tourId: string; language: Language; stops: TourMapStop[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const t = seoCopy(language);
  return <div className="seo-map">
    <button type="button" className="seo-text-link" aria-expanded={open} aria-controls="walk-map" onClick={() => setOpen(value => !value)}>{open ? t.closeMap : t.openMap}</button>
    {open && <div id="walk-map"><TourMap tourId={tourId} stops={stops} language={language} currentIndex={index} onStopSelect={setIndex} compact /></div>}
  </div>;
}
