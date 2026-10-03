'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SEO_CITIES } from '@/lib/seoInventory';
import { formatDistanceLabel } from '@/lib/geo';
import { shareTour } from '@/lib/shareTour';
import { DETOUR_FACTOR, haversineMeters, legMeters, type LatLng } from '@/lib/walkingLegs';
import type { Tour, WalkingLegs } from '@/types/api';
import { SourceCredits } from '@/components/legal/SourceCredits';
import { TourFeedback } from './TourFeedback';
import { listeningCopy } from './listeningCopy';

interface Props { tour: Tour; stops: Tour['places']; listened: number; legs: WalkingLegs | null; onClose: () => void }

/** Plan 06 B7: what the walk was, how to keep going and where the words and pictures came from. */
export function TourEnd({ tour, stops, listened, legs, onClose }: Props) {
  const t = listeningCopy(tour.language);
  const [copied, setCopied] = useState(false);
  const points = Object.fromEntries(stops.map(stop => [stop.id, { latitude: stop.latitude, longitude: stop.longitude }])) as Record<string, LatLng>;
  let meters = 0;
  for (let i = 1; i < stops.length; i++) meters += legMeters(legs, stops[i - 1].id, stops[i].id, points);
  if (!Number.isFinite(meters)) meters = stops.slice(1).reduce((sum, stop, i) => sum + haversineMeters(stops[i], stop) * DETOUR_FACTOR, 0);
  const city = tour.cityNames?.[tour.language] || tour.city;
  const seoCity = SEO_CITIES.find(entry => entry.countryCode === tour.countryCode && (entry.name === tour.city || Object.values(entry.names).includes(tour.city)));
  const otherWalks = seoCity ? `/${tour.language}/${seoCity.slug}` : '/tours';
  return <section className="tour-end" role="dialog" aria-modal="true" aria-label={t.tourFinished}>
    <button className="tour-end-close" onClick={onClose}>{t.closeSummary}</button>
    <h2>{t.tourFinished}</h2>
    <p>{t.stopsListened(listened, stops.length)}</p>
    {meters > 0 && <p>{t.walkedApprox(formatDistanceLabel(meters, tour.language))}</p>}
    <div className="tour-end-actions">
      <Link href={otherWalks}>{t.otherWalks(city)} →</Link>
      <button type="button" onClick={async () => { if (await shareTour({ title: tour.title || city, url: location.origin + '/tours/' + tour.id }) === 'copied') { setCopied(true); setTimeout(() => setCopied(false), 3000); } }}>{t.share}</button>
      {copied && <span role="status">{t.linkCopied}</span>}
    </div>
    <TourFeedback key={tour.id} tourId={tour.id} language={tour.language} />
    <details className="tour-end-sources"><summary>{t.sourcesTitle}</summary>{stops.map(stop => <SourceCredits key={stop.id} place={stop} language={tour.language} />)}</details>
  </section>;
}
