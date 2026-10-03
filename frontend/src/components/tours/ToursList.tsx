'use client';

import { useEffect, useState } from 'react';
import { listTours } from '@/lib/api';
import { Language, TourSummary } from '@/types/api';
import { startOf } from '@/lib/tourSummary';
import { TourCard } from './TourCard';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { browseCopy, languageNames } from '@/lib/browseCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { formatDistanceLabel, haversineDistanceMeters } from '@/lib/geo';
import { CloseIcon, LocateIcon } from '@/components/tour/icons';

const PAGE_SIZE = 200;
/** The first tours are the likeliest to be opened: their pages are fetched in the background so that opening one is immediate. */
const PREFETCHED_TOURS = 6;
/** "Near you" keeps only the walks that start this close; with none that close, the closest few are shown instead. */
const NEAR_KM = 50;
const NEAR_FALLBACK = 6;
const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

export const ToursList = () => {
  const { language: pageLanguage } = usePageLanguage();
  const t = browseCopy(pageLanguage);
  const m = mobileTourCopy(pageLanguage);
  const [city, setCity] = useState('');
  const [selectedLanguage, setLanguage] = useState<Language | null>(null);
  const [theme, setTheme] = useState<'all' | 'history' | 'thematic'>('all');
  // "Near you" sorts by distance once, with a one-off reading that is kept in memory only: no coordinate is stored or sent anywhere.
  const [near, setNear] = useState<{ status: 'idle' | 'locating' | 'ready' | 'denied'; point?: { latitude: number; longitude: number } }>({ status: 'idle' });
  const language = selectedLanguage ?? pageLanguage;
  const [result, setResult] = useState<{ language: Language; tours: TourSummary[]; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [visibleCount, setVisibleCount] = useState(6);
  const currentResult = result?.language === language ? result : null;
  const loading = !currentResult;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const tours: TourSummary[] = [];
        // One request normally returns the whole catalogue; the loop only continues if the backend reports more tours than it sent.
        for (let offset = 0; ; offset = tours.length) {
          const { tours: page, total } = await listTours({ language, readyOnly: true, limit: PAGE_SIZE, offset, view: 'summary' }, controller.signal);
          if (controller.signal.aborted) return;
          const known = new Set(tours.map(tour => tour.id));
          const added = page.filter(tour => !known.has(tour.id));
          tours.push(...added);
          if (!added.length || (total !== undefined && tours.length >= total)) break;
        }
        setResult({ language, tours, error: false });
      } catch {
        if (!controller.signal.aborted) setResult({ language, tours: [], error: true });
      }
    };
    void load();
    return () => controller.abort();
  }, [language, retry]);

  const tours = currentResult?.tours ?? [];
  const query = normalized(city);
  const distanceTo = (tour: TourSummary) => { const start = startOf(tour); return near.point && start ? haversineDistanceMeters(near.point, start) : Infinity; };
  const nearOn = near.status === 'ready';
  const matching = tours.filter(tour => (!query || [tour.city, ...Object.values(tour.cityNames ?? {})].some(name => normalized(name).includes(query)))
    && (theme === 'all' || (theme === 'thematic') === (tour.theme === 'thematic')))
    .sort((a, b) => (nearOn ? distanceTo(a) - distanceTo(b) : Number(b.theme === 'thematic') - Number(a.theme === 'thematic')));
  const nearby = nearOn ? matching.filter(tour => distanceTo(tour) <= NEAR_KM * 1000) : matching;
  const nothingNear = nearOn && !nearby.length && matching.length > 0;
  const filtered = nothingNear ? matching.slice(0, NEAR_FALLBACK) : nearby;
  const cityName = (tour: TourSummary) => tour.cityNames?.[pageLanguage] || tour.city;
  const cities = [...new Set((nearOn && !nothingNear ? tours.filter(tour => distanceTo(tour) <= NEAR_KM * 1000) : tours).map(cityName))].sort(nearOn
    ? (a, b) => Math.min(...tours.filter(x => cityName(x) === a).map(distanceTo)) - Math.min(...tours.filter(x => cityName(x) === b).map(distanceTo))
    : (a, b) => a.localeCompare(b, pageLanguage));
  const locate = () => {
    setVisibleCount(6);
    if (!navigator.geolocation) { setNear({ status: 'denied' }); return; }
    setNear({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(position => setNear({ status: 'ready', point: { latitude: position.coords.latitude, longitude: position.coords.longitude } }),
      () => setNear({ status: 'denied' }), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  };
  const chooseCity = (value: string) => { setCity(value); setVisibleCount(6); };

  return <div className="mobile-discovery">
    <section className="discovery-intro">
      <p className="tour-eyebrow">{t.closing}</p>
      <h1>{m.heading}</h1>
      <p>{m.intro}</p>
    </section>
    <form role="search" onSubmit={event => event.preventDefault()}>
      <label htmlFor="tour-city" className="sr-only">{t.cityLabel}</label>
      <div className="discovery-search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input id="tour-city" type="search" value={city} onChange={event => chooseCity(event.target.value)} maxLength={200} autoComplete="off" enterKeyHint="search" placeholder={m.search} />
        <button type="button" className="discovery-near" aria-pressed={nearOn} disabled={near.status === 'locating'} onClick={() => (nearOn ? setNear({ status: 'idle' }) : locate())}><LocateIcon width={18} height={18} />{t.nearYou}</button>
      </div>
      {near.status !== 'idle' && <p role="status" className="discovery-near-status">{near.status === 'locating' ? t.nearYouLocating : near.status === 'denied' ? t.nearYouDenied : nothingNear ? t.nearYouNone : t.nearYouOn}
        {nearOn && <button type="button" aria-label={t.nearYouClear} onClick={() => setNear({ status: 'idle' })}><CloseIcon width={16} height={16} /></button>}</p>}
      {cities.length > 0 && <div className="discovery-cities" role="group" aria-label={m.cities}>
        <button type="button" aria-pressed={!query} onClick={() => chooseCity('')}>{m.allCities}</button>
        {cities.map(name => <button key={name} type="button" aria-pressed={normalized(name) === query} onClick={() => chooseCity(name)}>{name}</button>)}
      </div>}
      <div role="group" aria-label={t.themeLabel} className="discovery-tabs">
        {(['all', 'history', 'thematic'] as const).map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => { setTheme(value); setVisibleCount(6); }}>{value === 'all' ? t.themeAll : value === 'history' ? t.themeHistory : t.themeThematic}</button>)}
      </div>
      <details className="discovery-language">
        <summary>{t.otherLanguages}:{" "}<span lang={language}>{languageNames[language]}</span></summary>
        <div role="group" aria-label={t.tourLanguage}>{Object.entries(languageNames).map(([value, label]) => <button key={value} type="button" lang={value} aria-pressed={language === value} onClick={() => { setLanguage(value as Language); setVisibleCount(6); }}>{label}</button>)}</div>
      </details>
    </form>
    <p role="status" className={loading ? 'discovery-status' : 'sr-only'}>{loading ? t.loading : currentResult && !currentResult.error ? t.resultsCount(filtered.length) : ''}</p>
    <div aria-busy={loading}>
      {currentResult && (currentResult.error ? <div className="discovery-empty"><p role="alert">{t.searchError}</p><button className="tour-primary" onClick={() => { setResult(null); setRetry(value => value + 1); }}>{t.retry}</button></div>
        : filtered.length ? <section aria-label={t.resultsLabel}>
          <div className="discovery-section-title"><h2>{m.featured}</h2><span>{filtered.length}</span></div>
          <div className="discovery-cards">{filtered.slice(0, visibleCount).map((tour, index) => <TourCard key={tour.id} tour={tour} priority={index === 0} prefetch={index < PREFETCHED_TOURS ? true : undefined}
            distance={nearOn && Number.isFinite(distanceTo(tour)) ? t.away(formatDistanceLabel(distanceTo(tour), pageLanguage)) : undefined} />)}</div>
          {filtered.length > visibleCount && <button className="discovery-more" onClick={() => setVisibleCount(value => value + 6)}>{m.more} ↓</button>}
        </section> : <div className="discovery-empty"><h2>{query ? t.emptyTitle(city.trim(), t.languageNames[language]) : m.empty}</h2><p>{t.emptyHint}</p>{query && <button className="tour-primary" onClick={() => chooseCity('')}>{m.clear}</button>}</div>)}
    </div>
  </div>;
};
