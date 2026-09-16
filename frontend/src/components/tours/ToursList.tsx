'use client';

import { useEffect, useState } from 'react';
import { listTours } from '@/lib/api';
import { Language, Tour } from '@/types/api';
import { TourCard } from './TourCard';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { browseCopy, languageNames } from '@/lib/browseCopy';

export const ToursList = () => {
  const { language: pageLanguage } = usePageLanguage();
  const t = browseCopy(pageLanguage);
  const [city, setCity] = useState('');
  const [selectedLanguage, setLanguage] = useState<Language | null>(null);
  const language = selectedLanguage ?? pageLanguage;
  const [result, setResult] = useState<{ city: string; language: Language; tours: Tour[]; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const query = city.trim();
  const currentResult = result?.city === query && result.language === language ? result : null;
  const loading = Boolean(query) && !currentResult;

  useEffect(() => {
    if (!query) { setResult(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const tours = await listTours({ city: query, language, readyOnly: true }, controller.signal);
        if (!controller.signal.aborted) setResult({ city: query, language, tours, error: false });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ city: query, language, tours: [], error: true });
        }
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, language, retry]);

  return (
    <div>
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-darkBrown/65">{t.eyebrow}</p>
      <h1 className="mb-3 font-serif text-4xl leading-tight text-darkBrown">{t.heading}</h1>
      <p className="mb-7 text-base leading-relaxed text-darkBrown/75">{t.intro}</p>
      <form role="search" onSubmit={event => event.preventDefault()} className="space-y-5">
        <div>
          <label htmlFor="tour-language" className="mb-2 block text-sm text-darkBrown">{t.tourLanguage}</label>
          <select id="tour-language" value={language} onChange={e => setLanguage(e.target.value as Language)} className="min-h-12 w-full rounded-xl border border-darkBrown/20 bg-surface-elevated px-3 py-3 text-base text-darkBrown">
            {Object.entries(languageNames).map(([value, label]) => <option key={value} value={value} lang={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tour-city" className="mb-2 block text-sm text-darkBrown">{t.cityLabel}</label>
          <input id="tour-city" type="search" value={city} onChange={e => setCity(e.target.value)} maxLength={200} autoComplete="off" enterKeyHint="search" placeholder={t.cityPlaceholder} className="min-h-12 w-full rounded-xl border border-darkBrown/20 bg-surface-elevated px-3 py-3 text-base text-darkBrown placeholder:text-darkBrown/50" />
        </div>
      </form>
      <p role="status" className={loading ? 'mt-5 text-sm text-darkBrown/75' : 'sr-only'}>
        {loading ? t.loading : currentResult && !currentResult.error ? t.resultsCount(currentResult.tours.length) : ''}
      </p>
      <div aria-busy={loading}>
        {currentResult && (currentResult.error ? <div className="mt-5">
          <p role="alert" className="text-sm text-danger">{t.searchError}</p>
          <button type="button" onClick={() => { setResult(null); setRetry(value => value + 1); }} className="mt-3 min-h-12 w-full rounded-xl border border-darkBrown/20 px-4 py-3 text-base text-darkBrown">{t.retry}</button>
        </div> : currentResult.tours.length ? <section className="mt-7" aria-label={t.resultsLabel}>
          <h2 className="mb-5 font-serif text-2xl text-darkBrown">{t.available}</h2>
          <div className="space-y-4">{currentResult.tours.map(tour => <TourCard key={tour.id} tour={tour} />)}</div>
        </section> : <div className="mt-7">
          <h2 className="mb-3 font-serif text-2xl leading-tight text-darkBrown">{t.emptyTitle(query, t.languageNames[language])}</h2>
          <p className="leading-relaxed text-darkBrown/75">{t.emptyHint}</p>
        </div>)}
      </div>
      <p className="mt-7 text-center text-xs text-darkBrown/65">{t.closing}</p>
    </div>
  );
};
