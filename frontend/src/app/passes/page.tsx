'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { listFlexiblePassCities } from '@/lib/api';
import { FlexiblePassCitySummary, Language } from '@/types/api';

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
];

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100);
}

export default function PassesPage() {
  const [language, setLanguage] = useState<Language>('es');
  const [cities, setCities] = useState<FlexiblePassCitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await listFlexiblePassCities(language);
        setCities(data);
      } catch (loadError) {
        console.error(loadError);
        setError('We could not load flexible pass cities right now.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [language]);

  return (
    <div className="min-h-screen bg-beige">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">
                Build your own bundle
              </p>
              <h2 className="mt-2 text-3xl font-serif font-bold tracking-tight text-darkBrown sm:text-4xl">
                Pick Any 3 Audio Walks
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-darkBrown/75">
                Build your own city bundle from finished audio walks. Pick three in the same city and unlock the pass price.
              </p>
            </div>
            <label className="flex flex-col gap-2 text-sm text-darkBrown">
              <span className="font-medium">Language</span>
              <select
                className="rounded-lg border border-darkBrown/15 bg-surface px-3 py-2 text-darkBrown"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {isLoading && (
            <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated py-12 text-center shadow-sm">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-darkBrown border-r-transparent"></div>
              <p className="mt-2 font-serif text-darkBrown/70">Loading passes...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-xl border border-danger/20 bg-danger-surface p-4 text-danger">{error}</div>
          )}

          {!isLoading && !error && cities.length === 0 && (
            <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated py-12 text-center shadow-sm">
              <p className="text-darkBrown/70 italic">No flexible passes are ready for this language yet.</p>
            </div>
          )}

          {!isLoading && !error && cities.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {cities.map((city) => (
                <Link
                  key={`${city.city}-${city.countryCode}-${city.language}`}
                  href={`/passes/flexible/${encodeURIComponent(city.city)}?countryCode=${encodeURIComponent(city.countryCode)}&language=${encodeURIComponent(city.language)}`}
                  className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-mutedGold">Audio pass</p>
                  <h3 className="mt-3 text-2xl font-serif font-semibold text-darkBrown">{city.city}</h3>
                  <p className="mt-1 text-sm text-darkBrown/65">{city.country} · {city.language.toUpperCase()}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-darkBrown/70">
                    <span className="rounded-full border border-darkBrown/12 bg-surface px-3 py-1">{city.availableTourCount} tours ready</span>
                    <span className="rounded-full border border-darkBrown/12 bg-surface px-3 py-1">Pick {city.toursRequired}</span>
                  </div>
                  <div className="mt-5 flex items-end justify-between">
                    <div>
                      <p className="text-sm text-darkBrown/60">Pass price</p>
                      <p className="text-xl font-semibold text-darkBrown">{formatCurrency(city.priceCents, city.currency)}</p>
                    </div>
                    <span className="text-sm font-medium text-mutedGold">Build bundle →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
