'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Tour } from '@/types/api';
import { readTourSelection, saveTourSelection, TourSelection } from '@/lib/tourSelection';
import { trackEvent } from '@/lib/analytics';
import { TourFeedback } from './TourFeedback';
import { ListeningProgress, listeningKey, readListeningProgress } from '@/lib/tourProgress';
import { getVerifiedTourImages } from './PlaceCard';
import { TourPhoto } from './TourPhoto';
import { TourAudioPanel } from './TourAudioPanel';
import { listeningCopy } from './listeningCopy';
import { InfoLinks } from '@/components/legal/InfoLinks';
import { SourceCredits } from '@/components/legal/SourceCredits';
import './TourExperience.css';

const TourMap = dynamic(() => import('./map/TourMap').then(mod => mod.TourMap), { ssr: false });
type View = 'photos' | 'story' | 'map';
type LocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable';
const TOUR_NOTICE_KEY = 'tour-notice:v1';
const readNumber = (key: string) => {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; }
};
const saveNumber = (key: string, value: number) => {
  try { localStorage.setItem(key, String(value)); } catch { /* The tour also works without browser storage. */ }
};

export function TourExperience({ tour: sourceTour }: { tour: Tour }) {
  const tour = useMemo(() => ({
    ...sourceTour,
    places: sourceTour.places.map(place => {
      const name = (place.nameInTourLanguage?.trim() || place.name.trim())
        .replace(/\p{L}/u, initial => initial.toLocaleUpperCase(sourceTour.language));
      return { ...place, name, nameInTourLanguage: name };
    }),
  }), [sourceTour]);
  const t = listeningCopy(tour.language);
  const [started, setStarted] = useState<boolean | null>(null);
  const progressVersion = tour.pilot?.version ?? tour.places.map(p => p.audioVersion ?? 'unversioned').join('|');
  const tourProgressKey = 'tour-progress:' + tour.id + ':' + progressVersion;
  const [selection, setSelection] = useState<TourSelection>(() => readTourSelection(tour.id, tour.places.map(p => p.id), Boolean(tour.introduction?.trim()), tourProgressKey));
  const isIntroduction = selection.kind === 'introduction';
  const currentIndex = selection.kind === 'stop' ? Math.max(0, tour.places.findIndex(p => p.id === selection.placeId)) : 0;
  const [introductionAudio, setIntroductionAudio] = useState(tour.introductionAudio);
  const [introductionProgress, setIntroductionProgress] = useState(() => readListeningProgress(listeningKey(tour.id, 'introduction', tour.introductionAudio?.version)));
  const [view, setView] = useState<View>('photos');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [destinationIndex, setDestinationIndex] = useState(currentIndex);
  const [progress, setProgress] = useState<Record<string, ListeningProgress>>(() => Object.fromEntries(tour.places.map(place => [place.id, readListeningProgress(listeningKey(tour.id, place.id, place.audioVersion))])));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const place = tour.places[currentIndex];
  const destination = tour.places[destinationIndex];
  const images = useMemo(() => place ? getVerifiedTourImages(place) : [], [place]);
  const currentProgress = isIntroduction ? introductionProgress : place ? progress[place.id] : undefined;
  const ended = !!currentProgress?.completed && currentProgress.duration > 0 && currentProgress.position >= currentProgress.duration - 0.1;
  const allListened = tour.places.length > 0 && tour.places.every(stop => progress[stop.id]?.completed);
  const next = tour.places[currentIndex + 1];

  useEffect(() => { saveTourSelection(tour.id, selection); }, [tour.id, selection]);
  useEffect(() => {
    setStarted(readNumber(TOUR_NOTICE_KEY) === 1);
  }, []);
  useEffect(() => {
    if (started !== true) return;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      trackEvent('tour_started', { tour_id: tour.id, language: tour.language });
    };
    const script = document.getElementById('umami-analytics');
    if (script) {
      send();
    } else {
      const handler = () => send();
      window.addEventListener('umami-ready', handler);
      return () => window.removeEventListener('umami-ready', handler);
    }
  }, [started, tour.id, tour.language]);
  useEffect(() => {
    // Keep Next's own history fields; internal views need only one extra browser entry.
    history.replaceState({ ...history.state, tourView: 'photos' }, '');
    const back = () => setView(history.state?.tourView === 'story' || history.state?.tourView === 'map' ? history.state.tourView : 'photos');
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const openView = (nextView: View) => {
    if (nextView === view) return;
    if (view === 'photos') history.pushState({ ...history.state, tourView: nextView }, '');
    else history.replaceState({ ...history.state, tourView: nextView }, '');
    setView(nextView);
  };
  const backToPhotos = () => {
    if (history.state?.tourView && history.state.tourView !== 'photos') history.back();
    else setView('photos');
  };
  useEffect(() => {
    if ((!isIntroduction && view !== 'story') || !place) return;
    const element = storyRef.current;
    if (!element) return;
    const key = 'tour-reading:' + tour.id + ':' + (isIntroduction ? 'introduction' : place.id);
    element.scrollTop = readNumber(key);
    let position = element.scrollTop;
    const capture = () => { position = element.scrollTop; };
    const save = () => saveNumber(key, position);
    element.addEventListener('scroll', capture, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      save();
      element.removeEventListener('scroll', capture);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, [view, place, tour.id, isIntroduction]);

  useEffect(() => {
    if (!locationAttempt || !started) { setUserLocation(null); return; }
    if (!navigator.geolocation) { setLocationStatus('unavailable'); return; }
    let active = true;
    setLocationStatus('loading');
    const watch = navigator.geolocation.watchPosition(position => {
      if (!active) return;
      setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setLocationStatus('ready');
    }, error => {
      if (!active) return;
      setUserLocation(null);
      setLocationStatus(error.code === 1 ? 'denied' : 'unavailable');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    return () => { active = false; navigator.geolocation.clearWatch(watch); };
  }, [locationAttempt, started]);

  useEffect(() => {
    if (!started || !place || isIntroduction) return;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      trackEvent('stop_viewed', { tour_id: tour.id, place_id: place.id, language: tour.language, view });
    };
    const script = document.getElementById('umami-analytics');
    if (script) {
      send();
    } else {
      const handler = () => send();
      window.addEventListener('umami-ready', handler);
      return () => window.removeEventListener('umami-ready', handler);
    }
  }, [started, tour.id, tour.language, place?.id, view, isIntroduction]);

  useEffect(() => {
    if (!started || !place || isIntroduction || view !== 'story') return;
    let lastActivity = performance.now();
    let baseline = performance.now();
    let accumulated = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const isActive = () => document.visibilityState === 'visible' && performance.now() - lastActivity <= 60000;
    const flush = () => {
      if (accumulated >= 0.001) {
        const seconds = Math.round(accumulated * 1000) / 1000;
        trackEvent('reading_active', { tour_id: tour.id, place_id: place.id, language: tour.language, seconds });
        accumulated = 0;
      }
    };
    const sample = () => {
      const now = performance.now();
      if (isActive()) {
        const elapsed = (now - baseline) / 1000;
        if (elapsed > 0) {
          accumulated += Math.min(elapsed, 1);
          if (accumulated >= 15) {
            flush();
          }
        }
      }
      baseline = now;
    };
    const onActivity = () => {
      sample();
      lastActivity = performance.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        baseline = performance.now();
      }
    };
    const onPageHide = () => {
      sample();
      flush();
    };
    timer = setInterval(sample, 1000);
    document.addEventListener('pointerdown', onActivity, { capture: true });
    document.addEventListener('keydown', onActivity, { capture: true });
    document.addEventListener('scroll', onActivity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      if (timer) clearInterval(timer);
      sample();
      flush();
      document.removeEventListener('pointerdown', onActivity, { capture: true });
      document.removeEventListener('keydown', onActivity, { capture: true });
      document.removeEventListener('scroll', onActivity, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [started, place?.id, view, tour.id, tour.language, isIntroduction]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) closeMenu();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { closeMenu(); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menuOpen, closeMenu]);
  const openMenu = () => {
    if (menuOpen) { closeMenu(); return; }
    const panel = menuRef.current;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!panel || !rect) return;
    panel.style.setProperty('--menu-top', rect.top + 'px');
    panel.style.setProperty('--menu-right', window.innerWidth - rect.right + 'px');
    panel.style.setProperty('--trigger-width', rect.width + 'px');
    panel.style.setProperty('--trigger-height', rect.height + 'px');
    setMenuOpen(true);
  };
  const selectStop = (index: number) => {
    closeMenu();
    if (!isIntroduction && index === currentIndex) return;
    setSelection({ kind: 'stop', placeId: tour.places[index].id });
    if (isIntroduction) {
      setView('photos');
      history.replaceState({ ...history.state, tourView: 'photos' }, '');
    }
    setDestinationIndex(index);
    setPhotoIndex(0);
  };
  const onProgress = useCallback((value: ListeningProgress) => {
    if (isIntroduction) setIntroductionProgress(value);
    else if (place) setProgress(previous => ({ ...previous, [place.id]: value }));
  }, [place, isIntroduction]);
  const selectIntroduction = () => { closeMenu(); setSelection({ kind: 'introduction' }); };

  if (!place) return <main className="tour-experience"><Link href="/tours">← {t.back}</Link><p>{t.empty}</p></main>;
  if (started === null) return <main className="tour-safety" lang={tour.language} aria-busy="true"></main>;
  if (!started) return <main className="tour-safety" lang={tour.language}>
    <p className="pilot-badge">{tour.localReview ? (tour.language === 'fr' ? 'En révision privée' : 'En revisión privada') : t.experimental}</p><h1>{t.beforeStarting}</h1>
    <p>{t.safety}</p><p>{t.locationChoice}</p>
    {tour.pilot && <p>{t.humanReviewed} {tour.pilot.reviewedAt.slice(0, 10)}</p>}
    <button className="safety-start" onClick={() => { saveNumber(TOUR_NOTICE_KEY, 1); setStarted(true); }}>{t.startSafely}</button>
    <p>{t.rememberNotice}</p>
    <Link href="/tours">← {t.back}</Link><InfoLinks language={tour.language} />
  </main>;
  const directions = destination && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)
    ? 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: destination.latitude + ',' + destination.longitude, travelmode: 'walking', dir_action: 'navigate' })
    : null;
  const stopLabel = isIntroduction ? t.introduction : t.stop + ' ' + (currentIndex + 1) + ' ' + t.of + ' ' + tour.places.length;

  return <main className="tour-experience" lang={tour.language} data-view={isIntroduction ? 'story' : view} data-segment={selection.kind}>
    <header className="listening-header">
      <p className="pilot-badge">{tour.localReview ? (tour.language === 'fr' ? 'En révision privée' : 'En revisión privada') : t.experimental}</p>
      {isIntroduction || view === 'photos' ? <Link href="/tours" className="listening-back">← {t.back}</Link> : <button className="listening-back" onClick={backToPhotos}>← {t.back}</button>}
      <button ref={triggerRef} className="stop-selector" onClick={openMenu} aria-expanded={menuOpen} aria-controls={menuId} aria-haspopup="dialog">{stopLabel} <span aria-hidden="true">☷</span></button>
    </header>
    <div ref={menuRef} id={menuId} className="stop-popover" data-open={menuOpen}
      role="dialog" aria-label={t.stops}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-stop]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[nextIndex]?.focus();
      }}>
      <button className="stop-popover-title" onClick={closeMenu}>{stopLabel} <span aria-hidden="true">☷</span></button>
      <div className="stop-popover-content"><h2>{t.stops}</h2>
        {tour.introduction?.trim() && <button data-stop="introduction" aria-current={isIntroduction ? 'step' : undefined} onClick={selectIntroduction}>
          <span className="stop-number" aria-hidden="true">{introductionProgress.completed ? '✓' : '·'}</span><span className="stop-row-text">{t.introduction}</span>
        </button>}<ol>
        {tour.places.map((stop, index) => <li key={stop.id}><button data-stop={index} aria-current={!isIntroduction && index === currentIndex ? 'step' : undefined} onClick={() => selectStop(index)}>
          <span className="stop-number">{progress[stop.id]?.completed ? '✓' : index + 1}</span>
          <span className="stop-row-text"><span>{stop.nameInTourLanguage || stop.name}</span><small>{!isIntroduction && index === currentIndex ? t.current + (progress[stop.id]?.completed ? ' · ' + t.listened : '') : progress[stop.id]?.completed ? t.listened : progress[stop.id]?.position > 0 ? t.partial : t.pending}</small></span>
        </button></li>)}
      </ol></div>
    </div>

    <nav hidden={isIntroduction} className="listening-tabs" aria-label={tour.city}>
      {(['photos', 'story', 'map'] as View[]).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => openView(mode)}>{t[mode]}</button>)}
    </nav>

    <div className="listening-content">
      {!isIntroduction && view === 'photos' && <section className="listening-gallery" aria-label={t.photos}
        onTouchStart={event => { touchX.current = event.touches[0].clientX; }}
        onTouchEnd={event => {
          if (touchX.current !== null && images.length > 1) {
            const distance = event.changedTouches[0].clientX - touchX.current;
            if (Math.abs(distance) > 50) setPhotoIndex(index => (index + (distance < 0 ? 1 : -1) + images.length) % images.length);
          }
          touchX.current = null;
        }}>
        {images[photoIndex] ? <TourPhoto key={place.id + images[photoIndex].id} photo={images[photoIndex]} language={tour.language} hero /> : <div className="photo-empty"><span aria-hidden="true">⌑</span><p>{t.photoMissing}</p><small>{t.photoHint}</small></div>}
        {images.length > 1 && <div className="photo-navigation"><button aria-label={t.previousPhoto} onClick={() => setPhotoIndex(index => (index - 1 + images.length) % images.length)}>‹</button><span aria-live="polite">{photoIndex + 1} / {images.length}</span><button aria-label={t.nextPhoto} onClick={() => setPhotoIndex(index => (index + 1) % images.length)}>›</button></div>}
      </section>}
      {(isIntroduction || view === 'story') && <article ref={storyRef} className="listening-story" tabIndex={0} aria-label={t.story}>
        <p className="story-eyebrow">{isIntroduction ? t.introduction : t.story} · {tour.cityNames?.[tour.language] || tour.city}</p><h1>{isIntroduction ? t.welcome : place.nameInTourLanguage || place.name}</h1>
        {(isIntroduction ? tour.introduction || '' : [currentIndex === 0 && !introductionAudio ? tour.introduction : '', place.description].filter(Boolean).join('\n\n')).split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {!isIntroduction && <SourceCredits place={place} language={tour.language} />}
      </article>}
      {!isIntroduction && view === 'map' && <section className="listening-map" aria-label={t.map}>
        <TourMap tourId={tour.id} stops={tour.places} currentIndex={destinationIndex} onStopSelect={setDestinationIndex} userLocation={userLocation} compact language={tour.language} />
        <div className="map-actions">
          <details className="map-options">
            <summary>{t.mapOptions} <span aria-hidden="true">⌄</span></summary>
            <div className="map-destination"><label htmlFor="tour-destination">{t.destination}</label>
              <select id="tour-destination" aria-label={t.chooseDestination} value={destinationIndex} onChange={event => setDestinationIndex(Number(event.target.value))}>
                {tour.places.map((stop, index) => <option key={stop.id} value={index}>{index + 1}. {stop.nameInTourLanguage || stop.name}</option>)}
              </select>
              <p className="location-status">{t.externalMap}</p>
              <p className="location-status">{t.locationChoice}</p>
              {!locationAttempt && <div className="location-actions"><button onClick={() => setLocationAttempt(1)}>{t.locate}</button></div>}
            </div>
          </details>
          {directions && <a className="directions-link" href={directions} target="_blank" rel="noopener noreferrer" title={t.externalMap}>{t.directions} ↗</a>}
        </div>
        {locationAttempt > 0 && <div className="location-actions map-location-status"><p role="status">{locationStatus === 'loading' ? t.locating : locationStatus === 'denied' ? t.locationDenied : locationStatus === 'ready' ? t.yourLocation : t.locationMissing}</p><button onClick={() => { setLocationAttempt(0); setUserLocation(null); setLocationStatus('idle'); }}>{t.stopLocation}</button></div>}
      </section>}
    </div>

    <footer className="listening-footer">
      {!isIntroduction && ended && <div className="stop-finished" role="status">
        <p>{next ? '✓ ' + t.finished : allListened ? t.tourFinished : t.routeEnd}</p>
        {next ? <div><button onClick={() => selectStop(currentIndex + 1)}>{t.next}: {next.nameInTourLanguage || next.name} →</button><button onClick={() => { setDestinationIndex(currentIndex + 1); openView('map'); }}>{t.map}</button></div> : <Link href="/tours">{t.tours} →</Link>}
      </div>}
      {isIntroduction && <button className="introduction-continue" onClick={() => selectStop(0)}>{t.firstStop} →</button>}
      <TourAudioPanel introduction={isIntroduction} onIntroductionReady={setIntroductionAudio} tourId={tour.id} language={tour.language} currentPlaceId={place.id} currentPlaceName={isIntroduction ? t.introduction : place.nameInTourLanguage || place.name} compact={isIntroduction || view !== 'photos'} onProgress={onProgress} />
      <TourFeedback key={tour.id} tourId={tour.id} language={tour.language} />
      <details className="tour-information"><summary>{t.aboutTour}</summary>
        {tour.introduction?.trim() && <button type="button" className="welcome-reopen" onClick={selectIntroduction}>{t.introduction}</button>}
        {tour.pilot && <p>{t.humanReviewed} {tour.pilot.reviewedAt.slice(0, 10)} · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">{tour.pilot.scriptLicense}</a><br />{tour.pilot.changes}</p>}
        <p>{t.safety}</p><p>{t.locationChoice}</p>
        {!isIntroduction && <SourceCredits place={place} language={tour.language} />}<InfoLinks language={tour.language} />
        <Link href={'/about?lang=' + tour.language + '#contact'}>{t.reportIssue}</Link>
      </details>
    </footer>
  </main>;
}
