'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ToursList } from '@/components/tours/ToursList';
import { PageLanguageSelect, usePageLanguage } from '@/components/layout/PageLanguage';
import { SEO_CITIES, SEO_ROUTE_DEFINITIONS } from '@/lib/seoInventory';
import { browseCopy } from '@/lib/browseCopy';
import { seoCopy } from '@/lib/seoCopy';
import '@/components/tours/MobileTours.css';

export default function ToursPage() {
  const { language } = usePageLanguage();
  const t = seoCopy(language);
  const b = browseCopy(language);
  // Grouped by country and folded: 41 cities in one list are several screens of scrolling on a phone. The links stay in the HTML for crawlers.
  const countryName = new Intl.DisplayNames([language], { type: 'region' });
  const countries = [...new Set(SEO_CITIES.map(city => city.countryCode))]
    .map(code => ({ code, name: countryName.of(code) ?? code, cities: SEO_CITIES.filter(city => city.countryCode === code)
      .sort((a, b) => a.names[language].localeCompare(b.names[language], language)) }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
  return (
    <div className="tour-entry bg-surface">
      <main className="mobile-tour-shell">
        <header className="mobile-tour-header">
          <Link href="/tours" className="nomuvia-wordmark"><Image src="/icon.png" unoptimized alt="" width={40} height={40} className="nomuvia-brand-icon" />nomuvia</Link>
          <PageLanguageSelect />
        </header>
        <ToursList />
        <nav className="discovery-closing" aria-label={t.allCities}>
          <h2>{t.allCities}</h2>
          {countries.map(country => <details key={country.code} className="discovery-country">
            <summary>{country.name} <span>({country.cities.length})</span><svg className="discovery-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
            <div className="discovery-city-links">{country.cities.map(city => {
              const walks = SEO_ROUTE_DEFINITIONS.filter(route => route.city === city.slug && route.locale === language).length;
              return <Link key={city.slug} className="tour-card-link" href={`/${language}/${city.slug}`} lang={language}>{city.names[language]}{walks > 0 && <small>{b.walksCount(walks)}</small>}</Link>;
            })}</div>
          </details>)}
        </nav>
      </main>
      <style jsx global>{`
        .discovery-closing h2 { margin-bottom: 8px; }
        .discovery-country { border-top: 1px solid var(--tour-line); text-align: left; }
        .discovery-country:last-of-type { border-bottom: 1px solid var(--tour-line); }
        .discovery-country summary { display: flex; align-items: center; gap: 6px; min-height: 48px; font-size: 14px; color: var(--tour-ink); list-style: none; }
        .discovery-country summary::-webkit-details-marker { display: none; }
        .discovery-chevron { margin-left: auto; flex-shrink: 0; color: var(--tour-muted); transition: transform .15s; }
        .discovery-country[open] .discovery-chevron { transform: rotate(180deg); }
        @media (prefers-reduced-motion: reduce) { .discovery-chevron { transition: none; } }
        .discovery-country summary span { color: var(--tour-muted); font-size: 12px; }
        .discovery-city-links { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; padding-bottom: 12px; }
        .discovery-city-links .tour-card-link { margin-left: 0; }
        body:has(.tour-entry) > div.min-h-screen { min-height: 0; }
        body:has(.tour-entry) > footer { background: var(--surface); }
        body:has(.tour-entry) > footer > div { max-width: 28rem; }
        body:has(.tour-entry) .tour-info-links { justify-content: center; gap: 0 1rem; font-size: 0.75rem; }
      `}</style>
    </div>
  );
}
