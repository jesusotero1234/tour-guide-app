'use client';

import { readingParagraphs } from '@/lib/readingParagraphs';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Tour } from '@/types/api';
import { readTourSelection, saveTourSelection, TourSelection } from '@/lib/tourSelection';
import { useReadingAnalytics, useStopViewedEvent, useTourStartedEvent } from '@/hooks/useTourAnalytics';
import { TourFeedback } from './TourFeedback';
import { ListeningProgress, listeningKey, readListeningProgress } from '@/lib/tourProgress';
import { getVerifiedTourImages } from './PlaceCard';
import { TourPhoto } from './TourPhoto';
import { TourAudioPanel } from './TourAudioPanel';
import { flexibleCopy } from './flexibleCopy';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, FrameIcon, ListIcon } from './icons';
import { getWalkingLegs } from '@/lib/api';
import type { WalkingLegs } from '@/types/api';
import type { TourAudioState } from '@/lib/tourAudio';
import { activeOrder, clearTourOrder, isRecommended, readTourOrder, saveTourOrder, startFrom, type TourOrder } from '@/lib/tourOrder';
import { estimatedSeconds, haversineMeters, legSeconds, orderedLegs, type LatLng } from '@/lib/walkingLegs';
import { formatDistanceLabel, walkingMinutes } from '@/lib/geo';
import { cueFor, cueRefAfter, type PlayPosition } from '@/lib/playerPlan';
import { reached, updateStreaks } from '@/lib/arrival';
import { listeningCopy } from './listeningCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { InfoLinks } from '@/components/legal/InfoLinks';
import { SourceCredits } from '@/components/legal/SourceCredits';
import './TourExperience.css';

const TourEnd = dynamic(() => import('./TourEnd').then(mod => mod.TourEnd), { ssr: false });
const TourMap = dynamic(() => import('./map/TourMap').then(mod => mod.TourMap), { ssr: false });
type View = 'photos' | 'story' | 'map';
type LocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable';
const TOUR_NOTICE_KEY = 'tour-notice:v1';
/** Only the choice is remembered, never a coordinate: a visitor who allowed location is not asked again inside the app. */
const LOCATION_PREFERENCE_KEY = 'tour-location:v1';
const readNumber = (key: string) => {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; }
};
const saveNumber = (key: string, value: number) => {
  try { localStorage.setItem(key, String(value)); } catch { /* The tour also works without browser storage. */ }
};

/**
 * The player speaks the language of the tour (its texts, the voice and the buttons around them); the overview and the catalogue use the language
 * of the page. They are different on purpose: someone browsing in Spanish can listen to a French walk (plan 06 C5).
 */
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
  const mobile = mobileTourCopy(tour.language);
  const f = flexibleCopy(tour.language);
  const [started, setStarted] = useState<boolean | null>(null);
  const progressVersion = tour.pilot?.version ?? tour.places.map(p => p.audioVersion ?? 'unversioned').join('|');
  const tourProgressKey = 'tour-progress:' + tour.id + ':' + progressVersion;
  const [selection, setSelection] = useState<TourSelection>(() => readTourSelection(tour.id, tour.places.map(p => p.id), Boolean(tour.introduction?.trim()), tourProgressKey));
  const isIntroduction = selection.kind === 'introduction';
  // The order of the walk (plan 05 section 4). Without link clips and legs the published order is the only one, as before.
  const canonicalIds = useMemo(() => tour.places.map(p => p.id), [tour.places]);
  const orderVersion = tour.pilot?.version ?? 'unversioned';
  const [audioState, setAudioState] = useState<TourAudioState | null>(null);
  const [legs, setLegs] = useState<WalkingLegs | null>(null);
  const [savedOrder, setSavedOrder] = useState<TourOrder | null>(() => readTourOrder(tour.id, orderVersion, tour.places.map(p => p.id)));
  const flexible = tour.orderFlexible === true && !!audioState?.cues && !!legs;
  const order = useMemo(() => (flexible ? activeOrder(canonicalIds, savedOrder) : canonicalIds), [flexible, canonicalIds, savedOrder]);
  const stops = useMemo(() => {
    const byId = new Map(tour.places.map(p => [p.id, p]));
    return order.map(id => byId.get(id)!).filter(Boolean);
  }, [order, tour.places]);
  const currentIndex = selection.kind === 'stop' ? Math.max(0, stops.findIndex(p => p.id === selection.placeId)) : 0;
  const [introductionAudio, setIntroductionAudio] = useState(tour.introductionAudio);
  const [introductionProgress, setIntroductionProgress] = useState(() => readListeningProgress(listeningKey(tour.id, 'introduction', tour.introductionAudio?.version)));
  const [view, setView] = useState<View>('photos');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [destinationId, setDestinationId] = useState(() => (selection.kind === 'stop' ? selection.placeId : canonicalIds[0]));
  const [progress, setProgress] = useState<Record<string, ListeningProgress>>(() => Object.fromEntries(tour.places.map(place => [place.id, readListeningProgress(listeningKey(tour.id, place.id, place.audioVersion))])));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [userLocation, setUserLocation] = useState<(LatLng & { accuracy?: number }) | null>(null);
  const place = stops[currentIndex];
  const destinationIndex = Math.max(0, stops.findIndex(p => p.id === destinationId));
  const destination = stops[destinationIndex];
  const images = useMemo(() => place ? getVerifiedTourImages(place) : [], [place]);
  const currentProgress = isIntroduction ? introductionProgress : place ? progress[place.id] : undefined;
  const ended = !!currentProgress?.completed && currentProgress.duration > 0 && currentProgress.position >= currentProgress.duration - 0.1;
  const allListened = tour.places.length > 0 && tour.places.every(stop => progress[stop.id]?.completed);
  const next = stops[currentIndex + 1];

  useEffect(() => { saveTourSelection(tour.id, selection); }, [tour.id, selection]);
  useTourStartedEvent({ started, tourId: tour.id, language: tour.language });
  const analyticsState = { started, tourId: tour.id, language: tour.language, placeId: place?.id, view, isIntroduction };
  useStopViewedEvent(analyticsState);
  useReadingAnalytics(analyticsState);
  useEffect(() => {
    if (tour.orderFlexible !== true) return;
    let active = true;
    void getWalkingLegs(tour.id).then(value => { if (active) setLegs(value); }).catch(() => { /* Without legs the walk keeps the published order. */ });
    return () => { active = false; };
  }, [tour.id, tour.orderFlexible]);
  useEffect(() => {
    setStarted(readNumber(TOUR_NOTICE_KEY) === 1);
  }, []);
  useEffect(() => {
    // Keep Next's own history fields; internal views need only one extra browser entry.
    history.replaceState({ ...history.state, tourView: 'photos' }, '');
    // The tab the listener was on comes back for this tour (and only this session): they are listening, not browsing.
    try {
      const saved = sessionStorage.getItem('tour-view:' + tour.id);
      if (saved === 'story' || saved === 'map') { history.pushState({ ...history.state, tourView: saved }, ''); setView(saved); }
    } catch { /* Session storage is optional. */ }
    const back = () => setView(history.state?.tourView === 'story' || history.state?.tourView === 'map' ? history.state.tourView : 'photos');
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  // The tour never changes while this component lives (the page keys it by tour id), so this runs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { sessionStorage.setItem('tour-view:' + tour.id, view); } catch { /* Session storage is optional. */ } }, [tour.id, view]);
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
      setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
      setLocationStatus('ready');
      try { localStorage.setItem(LOCATION_PREFERENCE_KEY, 'granted'); } catch { /* The preference is a convenience. */ }
    }, error => {
      if (!active) return;
      setUserLocation(null);
      setLocationStatus(error.code === 1 ? 'denied' : 'unavailable');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    return () => { active = false; navigator.geolocation.clearWatch(watch); };
  }, [locationAttempt, started]);
  useEffect(() => {
    // Someone who already allowed location is not asked again; nothing starts for anyone else.
    if (started !== true || !flexible) return;
    try { if (localStorage.getItem(LOCATION_PREFERENCE_KEY) === 'granted') setLocationAttempt(attempt => attempt || 1); } catch { /* Storage is optional. */ }
  }, [started, flexible]);



  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) closeMenu();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };   // closeMenu returns the focus, once
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menuOpen, closeMenu]);
  // The list is a modal dialog (plan 06 D7): the focus goes to the current stop when it opens and stays inside until it closes.
  useEffect(() => {
    if (!menuOpen) return;
    const panel = menuRef.current;
    const target = panel?.querySelector<HTMLElement>('[data-stop][aria-current="step"]') ?? panel?.querySelector<HTMLElement>('[data-stop]');
    target?.focus({ preventScroll: true });
  }, [menuOpen]);
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
  const [autoplayFor, setAutoplayFor] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [arrival, setArrival] = useState<{ kind: 'arrived' | 'near'; placeId: string } | null>(null);
  const dismissed = useRef(new Set<string>());
  const streaks = useRef<Record<string, number>>({});
  const selectPlace = (placeId: string, options: { play?: boolean } = {}) => {
    closeMenu();
    setPendingJump(null);
    if (options.play) setAutoplayFor(placeId);
    if (!isIntroduction && placeId === place?.id) return;
    setSelection({ kind: 'stop', placeId });
    if (isIntroduction) {
      setView('photos');
      history.replaceState({ ...history.state, tourView: 'photos' }, '');
    }
    setDestinationId(placeId);
    setPhotoIndex(0);
  };
  const selectStop = (index: number, options: { play?: boolean } = {}) => { const target = stops[index]; if (target) selectPlace(target.id, options); };
  const points = useMemo(() => Object.fromEntries(tour.places.map(p => [p.id, { latitude: p.latitude, longitude: p.longitude }])) as Record<string, LatLng>, [tour.places]);
  const cost = useCallback((a: string, b: string) => legSeconds(legs, a, b, points), [legs, points]);
  // The line to draw for a custom order: each leg in the direction walked. Memoised: the map redraws whenever it changes.
  const routeLegs = useMemo(() => (flexible && savedOrder ? orderedLegs(legs, order).map(leg => ({ line: leg.line })) : undefined), [flexible, savedOrder, legs, order]);
  /** "Start at X": X first, then what is left by the shortest walk, and what was already listened to last. */
  const reorderFrom = (placeId: string, options: { play?: boolean } = {}) => {
    const listened = new Set(tour.places.filter(p => progress[p.id]?.completed).map(p => p.id));
    const next = startFrom(canonicalIds, order, placeId, listened, cost);
    if (isRecommended(canonicalIds, next.placeIds)) { clearTourOrder(tour.id, orderVersion); setSavedOrder(null); }
    else { saveTourOrder(tour.id, orderVersion, next); setSavedOrder(next); }
    selectPlace(placeId, options);
  };
  const backToRecommended = () => { clearTourOrder(tour.id, orderVersion); setSavedOrder(null); closeMenu(); };
  /** Picking a stop that is not the next one asks first whether to reorder the rest (plan 05 section 4.3); it never happens by itself. */
  const requestStop = (index: number) => {
    const target = stops[index];
    if (!target) return;
    const expected = isIntroduction ? stops[0] : stops[currentIndex + 1];
    if (!flexible || target.id === expected?.id || (!isIntroduction && target.id === place?.id)) { selectPlace(target.id); return; }
    closeMenu();
    setPendingJump(target.id);
  };
  const goNext = (options: { play?: boolean } = {}) => { if (isIntroduction) selectStop(0, options); else if (next) selectStop(currentIndex + 1, options); };

  // Arrival (plan 05 section 5.2): two readings in a row inside the radius. It only shows a notice and vibrates briefly; nothing plays by itself.
  useEffect(() => {
    if (!flexible || !userLocation || !place) return;
    streaks.current = updateStreaks(streaks.current, userLocation, stops);
    const pending = (id: string) => !progress[id]?.completed && !dismissed.current.has(id);
    const target = next && reached(streaks.current, next.id) && pending(next.id) ? { kind: 'arrived' as const, placeId: next.id }
      : isIntroduction && stops[0] && reached(streaks.current, stops[0].id) && pending(stops[0].id) ? { kind: 'arrived' as const, placeId: stops[0].id }
      : (() => { const other = stops.find(s => s.id !== place.id && s.id !== next?.id && reached(streaks.current, s.id) && pending(s.id)); return other ? { kind: 'near' as const, placeId: other.id } : null; })();
    setArrival(previous => {
      if (!target) return previous && !reached(streaks.current, previous.placeId) ? null : previous;
      if (previous?.placeId === target.placeId && previous.kind === target.kind) return previous;
      if (target.kind === 'arrived') { try { navigator.vibrate?.(200); } catch { /* Vibration is optional. */ } }
      return target;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);
  useEffect(() => { setArrival(previous => (previous && previous.placeId === place?.id ? null : previous)); }, [place?.id]);
  const onProgress = useCallback((value: ListeningProgress) => {
    if (isIntroduction) setIntroductionProgress(value);
    else if (place) setProgress(previous => ({ ...previous, [place.id]: value }));
  }, [place, isIntroduction]);
  const selectIntroduction = (options: { play?: boolean } = {}) => { closeMenu(); setPendingJump(null); if (options.play) setAutoplayFor('introduction'); setSelection({ kind: 'introduction' }); };

  if (!place) return <main className="tour-experience"><Link href="/tours">← {t.back}</Link><p>{t.empty}</p></main>;
  if (started === null) return <main className="tour-experience tour-skeleton" lang={tour.language} aria-busy="true" data-view="photos">
    <div className="skeleton-header"><span className="skeleton-bar" style={{ width: '30%' }} /><span className="skeleton-bar" style={{ width: '26%' }} /></div>
    <div className="skeleton-heading"><span className="skeleton-bar" style={{ width: '58%', height: 30 }} /></div>
    <div className="skeleton-content"><span className="skeleton-block" /></div>
    <div className="skeleton-footer"><span className="skeleton-bar" style={{ width: '100%', height: 8 }} /><span className="skeleton-play" /></div>
  </main>;
  if (!started) return <main className="tour-safety" lang={tour.language}>
    <p className="pilot-badge">{tour.localReview ? t.privateReview : t.experimental}</p><h1>{t.beforeStarting}</h1>
    <p>{t.safety}</p><p>{t.locationChoice}</p>
    {tour.pilot && <p>{tour.pilot.approvalMode === 'owner-authorized' ? t.published : t.humanReviewed} {tour.pilot.reviewedAt.slice(0, 10)}</p>}
    <button className="safety-start" onClick={() => { saveNumber(TOUR_NOTICE_KEY, 1); setStarted(true); }}>{t.startSafely}</button>
    <p>{t.rememberNotice}</p>
    <Link href="/tours">← {t.back}</Link><InfoLinks language={tour.language} />
  </main>;
  const directions = destination && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)
    ? 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: destination.latitude + ',' + destination.longitude, travelmode: 'walking', dir_action: 'navigate' })
    : null;
  // With location on: how far the next stop is (straight line from where you are) and how long it takes (from the walking legs, or estimated).
  // The time comes from the walking legs only while the visitor is at the current stop; anywhere else the legs describe another walk, so it is estimated from the distance.
  const toNext = userLocation && next ? (() => {
    const meters = haversineMeters(userLocation, next);
    return { meters, seconds: haversineMeters(userLocation, place) <= 150 ? legSeconds(legs, place.id, next.id, points) : estimatedSeconds(meters) };
  })() : null;
  const toNextLabel = toNext ? `${formatDistanceLabel(toNext.meters, tour.language)} · ${f.minutes(walkingMinutes(toNext.seconds))}` : '';
  const position: PlayPosition = isIntroduction ? { kind: 'introduction' } : { kind: 'stop', placeId: place.id };
  const cue = flexible ? cueFor(audioState?.cues, cueRefAfter(order, position)) : undefined;
  const prompted = pendingJump ? stops.find(s => s.id === pendingJump) : undefined;
  const arrivalStop = arrival ? stops.find(s => s.id === arrival.placeId) : undefined;
  const stopLabel = isIntroduction ? t.introduction : t.stop + ' ' + (currentIndex + 1) + ' ' + t.of + ' ' + stops.length;

  return <main className="tour-experience" lang={tour.language} data-view={isIntroduction ? 'story' : view} data-segment={selection.kind}>
    <header className="listening-header">
      {isIntroduction || view === 'photos' ? <Link href={`/tours/${tour.id}`} className="listening-back">← {mobile.overview}</Link> : <button className="listening-back" onClick={backToPhotos}>← {t.back}</button>}
      <button ref={triggerRef} className="stop-selector" onClick={openMenu} aria-expanded={menuOpen} aria-controls={menuId} aria-haspopup="dialog">{stopLabel} <ListIcon /></button>
      {!isIntroduction && view === 'photos' && <div className="listening-heading"><p>{tour.title || tour.city}</p><h1>{place.nameInTourLanguage || place.name}</h1></div>}
    </header>
    <div ref={menuRef} id={menuId} className="stop-popover" data-open={menuOpen}
      role="dialog" aria-modal="true" aria-label={t.stops}
      onKeyDown={event => {
        if (event.key === 'Tab') {
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')];
          if (!focusable.length) return;
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-stop]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[nextIndex]?.focus();
      }}>
      <button className="stop-popover-title" onClick={closeMenu}>{stopLabel} <ListIcon /></button>
      <div className="stop-popover-content"><h2>{t.stops}</h2>
        {tour.introduction?.trim() && <button data-stop="introduction" aria-current={isIntroduction ? 'step' : undefined} onClick={() => selectIntroduction()}>
          <span className="stop-number" aria-hidden="true">{introductionProgress.completed ? '✓' : '·'}</span><span className="stop-row-text">{t.introduction}</span>
        </button>}<ol>
        {stops.map((stop, index) => <li key={stop.id}><button data-stop={index} aria-current={!isIntroduction && index === currentIndex ? 'step' : undefined} onClick={() => requestStop(index)}>
          <span className="stop-number">{progress[stop.id]?.completed ? '✓' : index + 1}</span>
          <span className="stop-row-text"><span>{stop.nameInTourLanguage || stop.name}</span><small>{!isIntroduction && index === currentIndex ? t.current + (progress[stop.id]?.completed ? ' · ' + t.listened : '') : progress[stop.id]?.completed ? t.listened : progress[stop.id]?.position > 0 ? t.partial : t.pending}</small></span>
        </button></li>)}
      </ol></div>
    </div>

    <nav hidden={isIntroduction} className="listening-tabs" aria-label={tour.city}>
      {(['photos', 'story', 'map'] as View[]).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => openView(mode)}>{mode === 'photos' ? mobile.look : mode === 'story' ? mobile.read : t.map}</button>)}
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
        {images[photoIndex] ? <TourPhoto key={place.id + images[photoIndex].id} photo={images[photoIndex]} language={tour.language} hero /> : <div className="photo-empty"><FrameIcon width={42} height={42} /><p>{t.photoMissing}</p><small>{t.photoHint}</small></div>}
        {images.length > 1 && <div className="photo-navigation"><button aria-label={t.previousPhoto} onClick={() => setPhotoIndex(index => (index - 1 + images.length) % images.length)}><ChevronLeftIcon /></button><span aria-live="polite">{photoIndex + 1} / {images.length}</span><button aria-label={t.nextPhoto} onClick={() => setPhotoIndex(index => (index + 1) % images.length)}><ChevronRightIcon /></button></div>}
      </section>}
      {(isIntroduction || view === 'story') && <article ref={storyRef} className="listening-story" tabIndex={0} aria-label={t.story}>
        <p className="story-eyebrow">{isIntroduction ? t.introduction : t.story} · {tour.cityNames?.[tour.language] || tour.city}</p><h1>{isIntroduction ? t.welcome : place.nameInTourLanguage || place.name}</h1>
        {readingParagraphs(isIntroduction ? tour.introduction || '' : [place.id === canonicalIds[0] && !introductionAudio ? tour.introduction : '', place.description].filter(Boolean).join('\n\n'), tour.theme === 'thematic').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {!isIntroduction && <SourceCredits place={place} language={tour.language} />}
      </article>}
      {!isIntroduction && view === 'map' && <section className="listening-map" aria-label={t.map}>
        <TourMap tourId={tour.id} stops={stops} currentIndex={destinationIndex} onStopSelect={index => setDestinationId(stops[index].id)} onStopOpen={flexible ? requestStop : undefined}
          routeLegs={routeLegs} userLocation={userLocation} onLocate={!locationAttempt ? () => setLocationAttempt(1) : undefined} compact language={tour.language} />
        <div className="map-actions">
          <details className="map-options">
            <summary>{t.mapOptions} <ChevronDownIcon /></summary>
            <div className="map-destination"><label htmlFor="tour-destination">{t.destination}</label>
              <select id="tour-destination" aria-label={t.chooseDestination} value={destinationIndex} onChange={event => setDestinationId(stops[Number(event.target.value)].id)}>
                {stops.map((stop, index) => <option key={stop.id} value={index}>{index + 1}. {stop.nameInTourLanguage || stop.name}</option>)}
              </select>
              <p className="location-status">{t.externalMap}</p>
              <p className="location-status">{t.locationChoice}</p>
            </div>
          </details>
          {directions && <a className="directions-link" href={directions} target="_blank" rel="noopener noreferrer" title={t.externalMap}>{t.directions} ↗</a>}
        </div>
        {locationAttempt > 0 && <div className="location-actions map-location-status"><p role="status">{locationStatus === 'loading' ? t.locating : locationStatus === 'denied' ? t.locationDenied + ' ' + t.locationHelp : locationStatus === 'ready' ? t.yourLocation : t.locationMissing}</p><button onClick={() => { setLocationAttempt(0); setUserLocation(null); setLocationStatus('idle'); }}>{t.stopLocation}</button></div>}
      </section>}
    </div>

    {endOpen && <TourEnd tour={tour} stops={stops} listened={stops.filter(s => progress[s.id]?.completed).length} legs={legs} onClose={() => setEndOpen(false)} />}
    <footer className="listening-footer">
      {prompted && <div className="order-prompt" role="alertdialog" aria-label={f.continueHere}>
        <p>{f.continueHere}</p><p><strong>{prompted.nameInTourLanguage || prompted.name}</strong></p>
        <div><button onClick={() => reorderFrom(prompted.id)}>{f.reorder}</button><button onClick={() => selectPlace(prompted.id)}>{f.listenOnly}</button></div>
      </div>}
      {arrival && arrivalStop && <div className="arrival-notice" role="status">
        <p>{arrival.kind === 'arrived' ? f.arrived(arrivalStop.nameInTourLanguage || arrivalStop.name) : f.nextToStop(arrivalStop.nameInTourLanguage || arrivalStop.name)}</p>
        <div>
          <button onClick={() => { dismissed.current.add(arrivalStop.id); setArrival(null); if (arrival.kind === 'arrived') selectPlace(arrivalStop.id, { play: true }); else reorderFrom(arrivalStop.id, { play: true }); }}>{f.listenNow}</button>
          <button onClick={() => { dismissed.current.add(arrivalStop.id); setArrival(null); }}>{f.notNow}</button>
        </div>
      </div>}
      {!isIntroduction && ended && <div className="stop-finished" role="status">
        <p>{next ? '✓ ' + t.finished : allListened ? t.tourFinished : t.routeEnd}</p>
        {next ? <div><button onClick={() => selectStop(currentIndex + 1)}>{t.next}: {next.nameInTourLanguage || next.name} →</button><button onClick={() => { setDestinationId(next.id); openView('map'); }}>{t.map}</button></div> : <div><button onClick={() => setEndOpen(true)}>{t.seeSummary} →</button><Link href="/tours">{t.tours} →</Link></div>}
      </div>}
      {isIntroduction && <button className="introduction-continue" onClick={() => selectStop(0)}>{flexible && stops[0] ? f.goTo(stops[0].nameInTourLanguage || stops[0].name) : t.firstStop} →</button>}
      <TourAudioPanel introduction={isIntroduction} onIntroductionReady={setIntroductionAudio} onAudioState={setAudioState} tourId={tour.id}
        cueAfter={cue ? { text: cue.text, audioUrl: cue.audioUrl } : null}
        autoplay={autoplayFor === (isIntroduction ? 'introduction' : place.id)} onAutoplayConsumed={() => setAutoplayFor(null)}
        onNext={isIntroduction ? (stops.length ? () => goNext({ play: true }) : undefined) : next ? () => goNext({ play: true }) : undefined}
        onPrevious={isIntroduction ? undefined : currentIndex > 0 ? () => selectStop(currentIndex - 1, { play: true }) : tour.introduction?.trim() ? () => selectIntroduction({ play: true }) : undefined}
        media={{ artist: 'Nomuvia · ' + (tour.cityNames?.[tour.language] || tour.city), album: tour.title || tour.city, artwork: images[0]?.url }} language={tour.language} currentPlaceId={place.id} currentPlaceName={isIntroduction ? t.introduction : place.nameInTourLanguage || place.name} compact={isIntroduction || view !== 'photos'} onProgress={onProgress} />
      {!isIntroduction && !ended && next && <button className="listening-next" onClick={() => selectStop(currentIndex + 1)}><span><small>{mobile.next}</small><strong>{next.nameInTourLanguage || next.name}</strong>{toNextLabel && <em className="next-distance">{toNextLabel}</em>}</span><span aria-hidden="true">→</span></button>}
      {flexible && locationStatus !== 'ready' && !locationAttempt && view !== 'map' && <button type="button" className="location-chip" onClick={() => setLocationAttempt(1)}>{f.useLocation}</button>}
      {flexible && locationAttempt > 0 && locationStatus === 'loading' && <p className="location-on" role="status">{f.locating}</p>}
      <details className="tour-information"><summary>{t.more}</summary>
        <TourFeedback key={tour.id} tourId={tour.id} language={tour.language} />
        <h2 className="tour-information-title">{t.aboutTour}</h2>
        <p>{t.experimental}</p>
        {tour.introduction?.trim() && <button type="button" className="welcome-reopen" onClick={() => selectIntroduction()}>{t.introduction}</button>}
        {flexible && <p className="order-state">{savedOrder ? f.yourOrder : f.recommendedOrder}{savedOrder && <> · <button type="button" className="welcome-reopen" onClick={backToRecommended}>{f.backToRecommended}</button></>}</p>}
        {tour.pilot && <p>{tour.pilot.approvalMode === 'owner-authorized' ? t.published : t.humanReviewed} {tour.pilot.reviewedAt.slice(0, 10)} · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">{tour.pilot.scriptLicense}</a><br />{tour.pilot.changes}</p>}
        <p>{t.safety}</p><p>{t.locationChoice}</p>
        {!isIntroduction && <SourceCredits place={place} language={tour.language} />}<InfoLinks language={tour.language} />
        <Link href={'/about?lang=' + tour.language + '#contact'}>{t.reportIssue}</Link>
      </details>
    </footer>
  </main>;
}
