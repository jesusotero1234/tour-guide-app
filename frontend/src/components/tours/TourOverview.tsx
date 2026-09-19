'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Tour, WalkingRoute } from '@/types/api';
import { getWalkingRoute } from '@/lib/api';
import { browseCopy, languageNames } from '@/lib/browseCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { usePageLanguage, PageLanguageSelect } from '@/components/layout/PageLanguage';
import { listeningCopy } from '@/components/tour/listeningCopy';
import { TourCover } from './TourCover';
import { TourSample } from './TourSample';
import { SourceCredits } from '@/components/legal/SourceCredits';
import { readListeningProgress, listeningKey } from '@/lib/tourProgress';

export function TourOverview({ tour }: { tour: Tour }) {
  const { language } = usePageLanguage();
  const t = mobileTourCopy(language);
  const b = browseCopy(language);
  const listening = listeningCopy(language);
  const [expanded, setExpanded] = useState(false);
  const [resume, setResume] = useState(false);
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  useEffect(() => {
    let active = true;
    setResume(tour.places.some(place => readListeningProgress(listeningKey(tour.id, place.id, place.audioVersion)).position > 0)
      || readListeningProgress(listeningKey(tour.id, 'introduction', tour.introductionAudio?.version)).position > 0);
    void getWalkingRoute(tour.id).then(value => { if (active) setRoute(value); }).catch(() => {});
    return () => { active = false; };
  }, [tour]);
  const city = tour.cityNames?.[language] || tour.city;
  const stops = expanded ? tour.places : tour.places.slice(0, 3);
  const first = tour.places[0];
  const title = tour.title || `${city}, ${tour.country}`;
  const directions = first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)
    ? 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: `${first.latitude},${first.longitude}`, travelmode: 'walking' }) : null;
  const start = () => {
    // The safety and location notice is visible below the start button.
    try { localStorage.setItem('tour-notice:v1', '1'); } catch { /* The listening screen can also show the notice. */ }
  };

  return <main className="tour-entry tour-overview">
    <header className="mobile-tour-header"><Link className="nomuvia-wordmark" href="/tours">nomuvia<span aria-hidden="true">↗</span></Link><PageLanguageSelect /></header>
    <div className="overview-back"><Link href="/tours">← {t.allWalks}</Link><span>{city}</span></div>
    <TourCover tour={tour} />
    <section className="overview-body" aria-labelledby="overview-title">
      <p className="tour-eyebrow">{city} · {t.walkingTour}</p>
      <h1 id="overview-title" lang={tour.title ? tour.language : language}>{title}</h1>
      {tour.subtitle && <p className="overview-description" lang={tour.language}>{tour.subtitle}</p>}
      {tour.introduction && <p className="overview-description overview-introduction" lang={tour.language}>{tour.introduction}</p>}
      <dl className="overview-facts">
        <div><dt>{t.estimated}</dt><dd>{tour.durationMinutes > 0 ? `~${tour.durationMinutes} min` : t.durationPending}</dd></div>
        <div><dt>{t.yourWalk}</dt><dd>{b.stopsCount(tour.places.length)}</dd></div>
        <div><dt>{t.audioAndText}</dt><dd lang={tour.language}>{languageNames[tour.language]}</dd></div>
      </dl>
      {route && <p className="overview-distance">{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(route.distanceMeters / 1000)} km · ~{Math.ceil(route.durationSeconds / 60)} min {t.walkingTime}</p>}
      <TourSample tour={tour} language={language} expanded />
      <div className="overview-route-heading"><h2>{t.yourWalk}</h2><span>{b.stopsCount(tour.places.length)}</span></div>
      <ol className="overview-stops">{stops.map((place, index) => <li key={place.id}>
        <span className="overview-stop-number">{index + 1}</span>
        <div><strong lang={tour.language}>{place.nameInTourLanguage || place.name}</strong>{index === 0 && <small>{t.firstStop}</small>}</div>
      </li>)}</ol>
      {tour.places.length > 3 && <button className="overview-expand" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? t.fewerStops : t.showStops} {expanded ? '↑' : '↓'}</button>}
      {directions && <a className="overview-directions" href={directions} target="_blank" rel="noopener noreferrer">{t.firstStop} · {listening.directions} ↗</a>}
      {first && <div className="overview-start"><Link className="tour-primary" href={`/tours/${tour.id}?listen=1`} onClick={start}>{resume ? t.resume : t.start}<span aria-hidden="true">→</span></Link><p>{t.startHint}</p></div>}
      <aside className="overview-notice" aria-label={t.about}>
        <h2>{t.safetyHeading}</h2><p>{listening.safety}</p><p>{listening.locationChoice}</p>
        <p className="overview-disclosure">{tour.localReview ? b.privateReview : listening.experimental}</p>
      </aside>
      {tour.places.some(place => place.metadata?.sourceCredits) && <details className="overview-sources"><summary>{b.sources}</summary>{tour.places.map(place => <SourceCredits key={place.id} place={place} language={language} />)}</details>}
    </section>
  </main>;
}
