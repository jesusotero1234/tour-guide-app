'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getFlexiblePassOptions, quoteFlexiblePass } from '@/lib/api';
import { FlexiblePassOptionsResponse, FlexiblePassQuoteResponse, FlexiblePassTourSummary, Language } from '@/types/api';

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountCents / 100);
}

export default function FlexiblePassCityPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const city = decodeURIComponent(params.city as string);
  const countryCode = (searchParams.get('countryCode') || '').toUpperCase();
  const language = (searchParams.get('language') || 'es') as Language;

  const [options, setOptions] = useState<FlexiblePassOptionsResponse | null>(null);
  const [selectedTourIds, setSelectedTourIds] = useState<string[]>([]);
  const [quote, setQuote] = useState<FlexiblePassQuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getFlexiblePassOptions(city, countryCode, language);
        setOptions(data);
      } catch (loadError) {
        console.error(loadError);
        setError('We could not load this flexible pass right now.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [city, countryCode, language]);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!options || selectedTourIds.length !== options.toursRequired) {
        setQuote(null);
        setQuoteError(null);
        return;
      }

      try {
        setIsQuoting(true);
        setQuoteError(null);
        const response = await quoteFlexiblePass({
          city: options.city,
          countryCode: options.countryCode,
          language: options.language,
          tourIds: selectedTourIds,
        });
        setQuote(response);
      } catch (quoteRequestError) {
        console.error(quoteRequestError);
        setQuote(null);
        setQuoteError('We could not calculate the quote for this selection.');
      } finally {
        setIsQuoting(false);
      }
    };

    fetchQuote();
  }, [options, selectedTourIds]);

  const selectedTours = useMemo(() => {
    if (!options) return [] as FlexiblePassTourSummary[];
    return options.tours.filter((tour) => selectedTourIds.includes(tour.id));
  }, [options, selectedTourIds]);

  const toggleTour = (tourId: string) => {
    setSelectedTourIds((current) => {
      if (current.includes(tourId)) {
        return current.filter((id) => id !== tourId);
      }
      if (options && current.length >= options.toursRequired) {
        return current;
      }
      return [...current, tourId];
    });
  };

  return (
    <div className="min-h-screen bg-beige">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <Link href="/passes" className="text-sm font-medium text-darkBrown/70 transition-colors hover:text-darkBrown">
              ← Back to passes
            </Link>
          </div>

          {isLoading && (
            <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated py-12 text-center shadow-sm">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-darkBrown border-r-transparent"></div>
              <p className="mt-2 font-serif text-darkBrown/70">Loading pass options...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-xl border border-danger/20 bg-danger-surface p-4 text-danger">{error}</div>
          )}

          {!isLoading && !error && options && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">Audio walk bundle</p>
                <h1 className="mt-2 text-3xl font-serif font-bold text-darkBrown">Build Your {options.city} Audio Pass</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-darkBrown/75">
                  Pick {options.toursRequired} walks in {options.city} and unlock the pass price. Checkout is not live yet, but this preview helps us learn which city bundles people want first.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-darkBrown/70">
                  <span className="rounded-full border border-darkBrown/12 bg-surface px-3 py-1">{options.language.toUpperCase()}</span>
                  <span className="rounded-full border border-darkBrown/12 bg-surface px-3 py-1">{options.tours.length} tours eligible</span>
                  <span className="rounded-full border border-darkBrown/12 bg-surface px-3 py-1">Bundle {formatCurrency(options.priceCents, options.currency)}</span>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {options.tours.map((tour) => {
                  const selected = selectedTourIds.includes(tour.id);
                  const limitReached = !selected && selectedTourIds.length >= options.toursRequired;
                  return (
                    <button
                      key={tour.id}
                      type="button"
                      disabled={limitReached}
                      onClick={() => toggleTour(tour.id)}
                      className={`rounded-2xl border p-5 text-left shadow-sm transition-colors ${selected ? 'border-darkBrown bg-darkBrown text-surface' : 'border-darkBrown/12 bg-surface-elevated hover:border-darkBrown/30'} ${limitReached ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-xs font-medium uppercase tracking-[0.18em] ${selected ? 'text-mutedGold/90' : 'text-mutedGold'}`}>
                            {tour.experienceLabel || tour.theme}
                          </p>
                          <h3 className={`mt-2 text-xl font-serif font-semibold ${selected ? 'text-surface' : 'text-darkBrown'}`}>{tour.title}</h3>
                          {tour.subtitle && (
                            <p className={`mt-2 text-sm leading-6 ${selected ? 'text-surface/80' : 'text-darkBrown/75'}`}>
                              {tour.subtitle}
                            </p>
                          )}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${selected ? 'border border-surface/15 bg-surface/10 text-surface' : 'border border-darkBrown/12 bg-surface text-darkBrown/70'}`}>
                          {selected ? 'Selected' : 'Choose'}
                        </span>
                      </div>
                      <div className={`mt-4 flex flex-wrap gap-2 text-xs ${selected ? 'text-surface/80' : 'text-darkBrown/70'}`}>
                        <span className={`rounded-full px-3 py-1 ${selected ? 'border border-surface/15 bg-surface/10' : 'border border-darkBrown/12 bg-surface'}`}>{tour.stopCount} stops</span>
                        <span className={`rounded-full px-3 py-1 ${selected ? 'border border-surface/15 bg-surface/10' : 'border border-darkBrown/12 bg-surface'}`}>{Math.round(tour.durationMinutes / 60)}h</span>
                      </div>
                    </button>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      </main>

      {!isLoading && !error && options && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-darkBrown/12 bg-surface/95 px-4 py-4 shadow-[0_-10px_30px_rgba(74,63,53,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-darkBrown">{selectedTourIds.length}/{options.toursRequired} tours selected</p>
              <p className="text-xs text-darkBrown/65">
                {selectedTours.length > 0 ? selectedTours.map((tour) => tour.title).join(' · ') : 'Select three tours to preview the bundle quote.'}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {quote ? (
                <>
                  <p className="text-sm text-darkBrown/65">Separate tours: {formatCurrency(quote.individualTotalCents, quote.currency)}</p>
                  <p className="text-lg font-semibold text-darkBrown">Bundle: {formatCurrency(quote.passPriceCents, quote.currency)}</p>
                  <p className="text-sm font-medium text-mutedGold">You save {formatCurrency(quote.savingsCents, quote.currency)}</p>
                </>
              ) : isQuoting ? (
                <p className="text-sm text-darkBrown/65">Calculating quote...</p>
              ) : (
                <p className="text-sm text-darkBrown/65">Pick {options.toursRequired} tours to unlock the quote.</p>
              )}
              {quoteError && <p className="text-sm text-danger">{quoteError}</p>}
              <button
                type="button"
                disabled={!quote}
                className="rounded-lg bg-darkBrown px-4 py-3 text-sm font-medium text-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                 Join the waitlist
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
