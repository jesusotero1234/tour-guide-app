'use client';

import { useEffect, useState } from 'react';
import { listTours } from '@/lib/api';
import { Language, Tour } from '@/types/api';
import { TourCard } from './TourCard';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { browseCopy, languageNames } from '@/lib/browseCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';

const PAGE_SIZE = 200;
const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

export const ToursList = () => {
  const { language: pageLanguage } = usePageLanguage();
  const t = browseCopy(pageLanguage);
  const m = mobileTourCopy(pageLanguage);
  const [city, setCity] = useState('');
  const [selectedLanguage, setLanguage] = useState<Language | null>(null);
  const language = selectedLanguage ?? pageLanguage;
  const [result, setResult] = useState<{ language: Language; tours: Tour[]; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [visibleCount, setVisibleCount] = useState(6);
  const currentResult = result?.language === language ? result : null;
  const loading = !currentResult;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const tours: Tour[] = [];
        // One request normally returns the whole catalogue; the loop only continues if the backend reports more tours than it sent.
        for (let offset = 0; ; offset = tours.length) {
          const { tours: page, total } = await listTours({ language, readyOnly: true, limit: PAGE_SIZE, offset }, controller.signal);
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
  const filtered = tours.filter(tour => !query || [tour.city, ...Object.values(tour.cityNames ?? {})].some(name => normalized(name).includes(query)))
    .sort((a, b) => Number(b.theme === 'thematic') - Number(a.theme === 'thematic'));
  const cities = [...new Set(tours.map(tour => tour.cityNames?.[pageLanguage] || tour.city))].sort((a, b) => a.localeCompare(b, pageLanguage));
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
      </div>
      {cities.length > 0 && <div className="discovery-cities" role="group" aria-label={m.cities}>
        <button type="button" aria-pressed={!query} onClick={() => chooseCity('')}>{m.allCities}</button>
        {cities.map(name => <button key={name} type="button" aria-pressed={normalized(name) === query} onClick={() => chooseCity(name)}>{name}</button>)}
      </div>}
      <div className="discovery-language"><label htmlFor="tour-language">{t.tourLanguage}</label><select id="tour-language" value={language} onChange={event => { setLanguage(event.target.value as Language); setVisibleCount(6); }}>
        {Object.entries(languageNames).map(([value, label]) => <option key={value} value={value} lang={value}>{label}</option>)}
      </select></div>
    </form>
    <p role="status" className={loading ? 'discovery-status' : 'sr-only'}>{loading ? t.loading : currentResult && !currentResult.error ? t.resultsCount(filtered.length) : ''}</p>
    <div aria-busy={loading}>
      {currentResult && (currentResult.error ? <div className="discovery-empty"><p role="alert">{t.searchError}</p><button className="tour-primary" onClick={() => { setResult(null); setRetry(value => value + 1); }}>{t.retry}</button></div>
        : filtered.length ? <section aria-label={t.resultsLabel}>
          <div className="discovery-section-title"><h2>{m.featured}</h2><span>{filtered.length}</span></div>
          <div className="discovery-cards">{filtered.slice(0, visibleCount).map((tour, index) => <TourCard key={tour.id} tour={tour} priority={index === 0} />)}</div>
          {filtered.length > visibleCount && <button className="discovery-more" onClick={() => setVisibleCount(value => value + 6)}>{m.more} ↓</button>}
        </section> : <div className="discovery-empty"><h2>{query ? t.emptyTitle(city.trim(), t.languageNames[language]) : m.empty}</h2><p>{t.emptyHint}</p>{query && <button className="tour-primary" onClick={() => chooseCity('')}>{m.clear}</button>}</div>)}
    </div>
    <p className="discovery-closing">{t.closing}</p>
  </div>;
};
