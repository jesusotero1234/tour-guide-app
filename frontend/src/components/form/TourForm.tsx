'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { Language, LocationData, Theme, TourRequest } from '@/types/api';
import { createGenerationJob } from '@/lib/api';
import { LocationPicker } from './LocationPicker';

const themeOptions = [
  { value: 'history', label: 'History' },
];

const languageOptions = [
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
];

const durationOptions = [
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours (Recommended)' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
];

export const TourForm = () => {
  const router = useRouter();
  const [location, setLocation] = useState<LocationData>();
  const [theme, setTheme] = useState<Theme>('history');
  const [language, setLanguage] = useState<Language>('es');
  const [duration, setDuration] = useState('120');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['es']);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/backend/generation-capabilities', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data) => {
        if (!data?.languages) return;
        const supported = data.languages.filter((l: string) => l === 'es' || l === 'fr');
        if (!supported.includes('es')) return;
        setEnabledLanguages(supported);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    if (!location?.countryCode || !location.source) {
      setError('Choose a city from the suggestions first.');
      return;
    }
    if (!enabledLanguages.includes(language)) {
      setError('The selected language is not available.');
      return;
    }

    setIsLoading(true);
    setError(null);
    const request: TourRequest = {
      city: location.city,
      country: location.country,
      countryCode: location.countryCode.toUpperCase(),
      location: { source: location.source, coordinates: location.coordinates },
      theme,
      language,
      durationMinutes: Number(duration),
    };

    try {
      const job = await createGenerationJob(request);
      if (job.status === 'completed' && job.result?.tourId) {
        router.push(`/tours/${job.result.tourId}`);
        return;
      }
      router.push(`/generation/${job.id}`);
    } catch (requestError) {
      console.error('Failed to find or create tour:', requestError);
      const message = requestError instanceof Error ? requestError.message : 'We could not start this tour right now. Please try again.';
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <LocationPicker value={location} onChange={setLocation} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Select
          label="Theme"
          options={themeOptions}
          value={theme}
          onChange={(event) => setTheme(event.target.value as Theme)}
        />
        <Select
          label="Language"
          options={languageOptions.filter((o) => enabledLanguages.includes(o.value))}
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
        />
      </div>

      <Select
        label="Tour duration"
        options={durationOptions}
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
      />

      <div className="rounded-xl border border-darkBrown/10 bg-surface p-4 text-sm leading-6 text-darkBrown/70">
        If a current tour is available in your selected language, it opens. Otherwise, we reuse available route research and write and audit a new version in your language. New text remains a draft pending review, and you can return later.
      </div>

      {isLoading && (
        <div className="rounded-xl border border-darkBrown/15 bg-surface-elevated p-4 text-sm text-darkBrown" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-mutedGold/35 border-t-darkBrown" />
            <p>Checking the catalogue and preparing your tour…</p>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-xl border border-danger/20 bg-danger-surface p-4 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <Button type="submit" isLoading={isLoading} className="w-full">
        Find or create tour
      </Button>
    </form>
  );
};
