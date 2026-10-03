'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Tour, WalkingLegs, WalkingRoute } from '@/types/api';
import { getWalkingLegs, getWalkingRoute } from '@/lib/api';
import { browseCopy, languageNames } from '@/lib/browseCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { usePageLanguage, PageLanguageSelect } from '@/components/layout/PageLanguage';
import { listeningCopy } from '@/components/tour/listeningCopy';
import { TourCover } from './TourCover';
import { TourSample } from './TourSample';
import { SourceCredits } from '@/components/legal/SourceCredits';
import { readListeningProgress, listeningKey } from '@/lib/tourProgress';
import { flexibleCopy } from '@/components/tour/flexibleCopy';
import { saveTourSelection } from '@/lib/tourSelection';
import { clearTourOrder, saveTourOrder, startFrom } from '@/lib/tourOrder';
import { haversineMeters, legSeconds, estimatedSeconds, type LatLng } from '@/lib/walkingLegs';
import { appleMapsDirectionsUrl, formatDistanceLabel, googleMapsDirectionsUrl, prefersAppleMaps, walkingMinutes } from '@/lib/geo';
import { readTourSelection } from '@/lib/tourSelection';
import { shareTour } from '@/lib/shareTour';

/** A visitor this close to a stop is offered to start there; further away, the way to the first stop is shown instead. */
const NEAR_METERS = 400;
type Nearby = { kind: 'near'; placeId: string; name: string; number: number; meters: number } | { kind: 'far'; meters: number; seconds: number } | { kind: 'denied' } | { kind: 'locating' };

export function TourOverview({ tour }: { tour: Tour }) {
  const { language } = usePageLanguage();
  const t = mobileTourCopy(language);
  const b = browseCopy(language);
  const listening = listeningCopy(language);
  const [expanded, setExpanded] = useState(false);
  const [resume, setResume] = useState(false);
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [legs, setLegs] = useState<WalkingLegs | null>(null);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [apple, setApple] = useState(false);
  const [shared, setShared] = useState(false);
  const [resumeName, setResumeName] = useState('');
  const f = flexibleCopy(language);
  useEffect(() => {
    let active = true;
    setResume(tour.places.some(place => readListeningProgress(listeningKey(tour.id, place.id, place.audioVersion)).position > 0)
      || readListeningProgress(listeningKey(tour.id, 'introduction', tour.introductionAudio?.version)).position > 0);
    void getWalkingRoute(tour.id).then(value => { if (active) setRoute(value); }).catch(() => {});
    setApple(prefersAppleMaps());
    // Where the listener was, so that the start bar can say where it will continue.
    const ids = tour.places.map(place => place.id);
    const saved = readTourSelection(tour.id, ids, Boolean(tour.introduction?.trim()), 'tour-progress:' + tour.id + ':' + (tour.pilot?.version ?? ''));
    const resumed = saved.kind === 'stop' ? tour.places.find(place => place.id === saved.placeId) : undefined;
    setResumeName(resumed && (resumed.id !== ids[0] || readListeningProgress(listeningKey(tour.id, resumed.id, resumed.audioVersion)).position > 0) ? resumed.nameInTourLanguage || resumed.name : '');
    if (tour.orderFlexible === true) void getWalkingLegs(tour.id).then(value => { if (active) setLegs(value); }).catch(() => {});
    return () => { active = false; };
  }, [tour]);
  // Starting anywhere needs the walking legs; without them the walk keeps its published order, exactly as before.
  const flexible = tour.orderFlexible === true && !!legs;
  const points = useMemo(() => Object.fromEntries(tour.places.map(p => [p.id, { latitude: p.latitude, longitude: p.longitude }])) as Record<string, LatLng>, [tour.places]);
  const city = tour.cityNames?.[language] || tour.city;
  const stops = expanded ? tour.places : tour.places.slice(0, 3);
  const first = tour.places[0];
  const title = tour.title || `${city}, ${tour.country}`;
  const hasFirst = !!first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude);
  const directions = hasFirst ? googleMapsDirectionsUrl(first) : null;
  const appleDirections = hasFirst && apple ? appleMapsDirectionsUrl(first) : null;
  const start = () => {
    // The safety and location notice is visible below the start button.
    try { localStorage.setItem('tour-notice:v1', '1'); } catch { /* The listening screen can also show the notice. */ }
  };
  /** "Start here": the chosen stop first and the rest by the shortest walk, kept for the player to read. Nothing plays by itself. */
  const startAt = useCallback((placeId: string) => {
    start();
    const ids = tour.places.map(p => p.id);
    if (placeId === ids[0]) { clearTourOrder(tour.id, tour.pilot?.version ?? 'unversioned'); }
    else {
      const listened = new Set(tour.places.filter(p => readListeningProgress(listeningKey(tour.id, p.id, p.audioVersion)).completed).map(p => p.id));
      saveTourOrder(tour.id, tour.pilot?.version ?? 'unversioned', startFrom(ids, ids, placeId, listened, (a, b) => legSeconds(legs, a, b, points)));
    }
    saveTourSelection(tour.id, { kind: 'stop', placeId });
  }, [tour, legs, points]);
  /** Opens the player at this stop and nothing else: the order is left as it is. */
  const openAt = (placeId: string) => { start(); saveTourSelection(tour.id, { kind: 'stop', placeId }); };
  const share = async () => {
    if (await shareTour({ title, url: location.origin + '/tours/' + tour.id }) === 'copied') { setShared(true); setTimeout(() => setShared(false), 3000); }
  };
  const startAtBeginning = () => { start(); clearTourOrder(tour.id, tour.pilot?.version ?? 'unversioned'); };
  const locate = () => {
    if (!navigator.geolocation) { setNearby({ kind: 'denied' }); return; }
    setNearby({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(position => {
      try { localStorage.setItem('tour-location:v1', 'granted'); } catch { /* The preference is a convenience. */ }
      const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const distances = tour.places.map((place, index) => ({ place, index, meters: haversineMeters(here, place) }));
      const closest = distances.reduce((best, current) => (current.meters < best.meters ? current : best));
      if (closest.meters <= NEAR_METERS && closest.index > 0) setNearby({ kind: 'near', placeId: closest.place.id, name: closest.place.nameInTourLanguage || closest.place.name, number: closest.index + 1, meters: closest.meters });
      else if (closest.meters <= NEAR_METERS) setNearby(null);
      else { const meters = haversineMeters(here, tour.places[0]); setNearby({ kind: 'far', meters, seconds: estimatedSeconds(meters) }); }
    }, () => setNearby({ kind: 'denied' }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  };

  return <main className="tour-entry tour-overview">
    <header className="mobile-tour-header"><Link className="nomuvia-wordmark" href="/tours"><Image src="/icon.png" unoptimized alt="" width={40} height={40} className="nomuvia-brand-icon" />nomuvia</Link><PageLanguageSelect /></header>
    <div className="overview-back"><Link href="/tours">← {t.allWalks}</Link><span>{city}</span></div>
    <TourCover tour={tour} priority />
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
        <div><Link className="overview-stop-link" href={`/tours/${tour.id}?listen=1`} onClick={() => openAt(place.id)}><strong lang={tour.language}>{place.nameInTourLanguage || place.name}</strong></Link>{index === 0 && <small>{t.firstStop}</small>}
          {flexible && <Link className="overview-start-here" href={`/tours/${tour.id}?listen=1`} onClick={() => startAt(place.id)}>{f.startHere}<span className="sr-only"> · {place.nameInTourLanguage || place.name}</span></Link>}</div>
      </li>)}</ol>
      {flexible && <div className="overview-nearby">
        {!nearby && <button type="button" className="overview-locate" onClick={locate}>{f.useLocation}</button>}
        {nearby?.kind === 'locating' && <p role="status">{f.locating}</p>}
        {nearby?.kind === 'denied' && <p role="status">{f.locationDeniedHere}</p>}
        {nearby?.kind === 'near' && <div role="status" className="overview-nearby-card"><p>{f.nearTitle(formatDistanceLabel(nearby.meters, language), nearby.name, nearby.number)}</p>
          <div><Link className="tour-primary" href={`/tours/${tour.id}?listen=1`} onClick={() => startAt(nearby.placeId)}>{f.startThere}</Link>
            <Link href={`/tours/${tour.id}?listen=1`} onClick={startAtBeginning}>{f.fromBeginning}</Link></div></div>}
        {nearby?.kind === 'far' && <div role="status" className="overview-nearby-card"><p>{f.farTitle(formatDistanceLabel(nearby.meters, language), f.minutes(walkingMinutes(nearby.seconds)))}</p>
          {directions && <a href={directions} target="_blank" rel="noopener noreferrer">{f.getThere} ↗</a>}</div>}
      </div>}
      {tour.places.length > 3 && <button className="overview-expand" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? t.fewerStops : t.showStops} {expanded ? '↑' : '↓'}</button>}
      {directions && <a className="overview-directions" href={directions} target="_blank" rel="noopener noreferrer">{t.firstStop} · {listening.directions} ↗</a>}
      {appleDirections && <a className="overview-directions" href={appleDirections} target="_blank" rel="noopener noreferrer">{t.firstStop} · {listening.openAppleMaps} ↗</a>}
      <button type="button" className="overview-share" onClick={() => void share()}>{listening.share}</button>
      {shared && <p role="status" className="overview-shared">{listening.linkCopied}</p>}
      <aside className="overview-notice" aria-label={t.about}>
        <h2>{t.safetyHeading}</h2><p>{listening.safetyShort}</p>
        <p className="overview-disclosure">{tour.localReview ? b.privateReview : listening.experimental}</p>
      </aside>
      {tour.places.some(place => place.metadata?.sourceCredits) && <details className="overview-sources"><summary>{b.sources}</summary>{tour.places.map(place => <SourceCredits key={place.id} place={place} language={language} />)}</details>}
      {first && <div className="overview-start"><Link className="tour-primary" href={`/tours/${tour.id}?listen=1`} onClick={start}>{resume ? t.resume : t.start}<span aria-hidden="true">→</span></Link>
        <p>{resume && resumeName ? `${listening.resumeAt} ${resumeName}` : t.startHint}</p></div>}
    </section>
  </main>;
}
