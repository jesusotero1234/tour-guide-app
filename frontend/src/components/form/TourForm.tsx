'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { Language, LocationData, Theme, TourRequest } from '@/types/api';
import { createGenerationJob, listTours } from '@/lib/api';
import { LocationPicker } from './LocationPicker';

const themeOptions = [
  { value: 'history', label: 'History' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'food', label: 'Food & Culture' },
];

const languageOptions = [
  { value: 'es', label: 'Spanish' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!location?.countryCode) {
      setError('Choose a city from the suggestions first.');
      return;
    }

    setIsLoading(true);
    setError(null);
    const request: TourRequest = {
      city: location.city,
      country: location.country,
      countryCode: location.countryCode.toUpperCase(),
      theme,
      language,
      durationMinutes: Number(duration),
    };

    try {
      const existing = await listTours({
        city: request.city,
        countryCode: request.countryCode,
        theme,
        language,
        readyOnly: true,
        limit: 1,
      });
      const exact = existing.find((tour) => tour.durationMinutes === request.durationMinutes);
      if (exact) {
        router.push(`/tours/${exact.id}`);
        return;
      }

      const job = await createGenerationJob(request);
      if (job.status === 'completed' && job.result?.tourId) {
        router.push(`/tours/${job.result.tourId}`);
        return;
      }
      router.push(`/generation/${job.id}`);
    } catch (requestError) {
      console.error('Failed to find or create tour:', requestError);
      setError('We could not start this tour right now. Please try again.');
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
          options={languageOptions}
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
        If a reviewed tour already exists, it opens immediately. Otherwise we build a new route and guide text in the background. You can leave the progress page and return later.
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
