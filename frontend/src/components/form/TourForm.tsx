'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTourStore } from '@/lib/store';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { CityConceptDiscoveryResult, Theme, TourConcept, TourRequest, Language, LocationData } from '@/types/api';
import { generateTour, generateTourFromConcept, getCityConcepts } from '@/lib/api';
import { LocationPicker } from './LocationPicker';
import { ConceptPicker } from './ConceptPicker';

const loadingStages = [
  'Finding landmarks',
  'Building a walkable route',
  'Writing narration',
  'Generating audio',
  'Preparing your tour',
];

const themeOptions = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'history', label: 'History' },
  { value: 'food', label: 'Food & Culture' }
];

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' }
];

const durationOptions = [
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours (Recommended)' }, 
  { value: '360', label: '6 hours' },
  { value: '480', label: '8 hours (Full day)' }
];

export const TourForm = () => {
  const router = useRouter();
  const [location, setLocation] = useState<LocationData>();
  const [theme, setTheme] = useState<Theme | ''>('');
  const [language, setLanguage] = useState<Language>('en');
  const [duration, setDuration] = useState<string>('240'); // Default to 4 hours (240 minutes)
  const [errors, setErrors] = useState<{ location?: string; theme?: string; concept?: string }>({});
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [conceptDiscovery, setConceptDiscovery] = useState<CityConceptDiscoveryResult | null>(null);
  const [isLoadingConcepts, setIsLoadingConcepts] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<TourConcept | null>(null);
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [useManualThemeMode, setUseManualThemeMode] = useState(false);
  
  const { isLoading, error, setLoading, setError } = useTourStore();

  useEffect(() => {
    if (!isLoading) {
      setLoadingStageIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingStageIndex((current) => Math.min(current + 1, loadingStages.length - 1));
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  useEffect(() => {
    // Reset concepts when city or country changes — user must explicitly request discovery
    if (location?.countryCode) {
      setConceptDiscovery(null);
      setSelectedConcept(null);
      setUseManualThemeMode(false);
    }
  }, [location?.city, location?.countryCode]);

  const validateForm = (): boolean => {
    const newErrors: { location?: string; theme?: string; concept?: string } = {};

    if (!location) {
      newErrors.location = 'Location is required';
    }

    if (!selectedConcept && !useManualThemeMode) {
      newErrors.concept = 'Choose one of the recommended experiences or switch to manual mode';
    }

    if (!selectedConcept && useManualThemeMode && !theme) {
      newErrors.theme = 'Theme is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDiscoverConcepts = async () => {
    if (!location?.countryCode) return;
    setIsLoadingConcepts(true);
    setConceptError(null);
    setConceptDiscovery(null);
    setSelectedConcept(null);

    try {
      const result = await getCityConcepts(location.city, location.countryCode, language);
      setConceptDiscovery(result);
      if (result.concepts.length > 0) {
        const preferred = result.concepts.find((concept) => concept.confidence === 'high') || result.concepts[0];
        setSelectedConcept(preferred);
        setUseManualThemeMode(false);
        setDuration(String(preferred.suggestedDurationMinutes));
      } else {
        setUseManualThemeMode(true);
      }
    } catch (error) {
      console.error('Failed to load concept recommendations:', error);
      setConceptError('We could not load city recommendations right now. You can still build a tour manually.');
      setUseManualThemeMode(true);
    } finally {
      setIsLoadingConcepts(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !location) {
      return;
    }

    try {
      // Single atomic update so isLoading:true and error:null land in the same
      // render — prevents setError's previous side-effect from resetting the flag.
      useTourStore.setState({ isLoading: true, error: null });

      const parsedDuration = parseInt(duration, 10);
      const tour = selectedConcept
        ? await generateTourFromConcept({
            conceptSlug: selectedConcept.slug,
            city: location.city,
            country: location.country,
            countryCode: location.countryCode ?? '',
            language,
            durationMinutes: parsedDuration,
          })
        : await generateTour({
            city: location.city,
            country: location.country,
            countryCode: location.countryCode ?? '',
            theme: theme as Theme,
            language,
            durationMinutes: parsedDuration,
            duration: parsedDuration,
          } as TourRequest);

      router.push(`/tours/${tour.id}`);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'CITY_NOT_AVAILABLE') {
        setError(
          `We don't have enough points of interest for "${location.city}" yet. Try a larger city or a different theme.`
        );
      } else {
        setError('Failed to generate tour. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-4">
        <LocationPicker
          value={location}
          onChange={setLocation}
        />
        {errors.location && (
          <p className="text-sm text-danger">{errors.location}</p>
        )}
      </div>

      {location && (
        <div className="space-y-4 rounded-2xl border border-darkBrown/10 bg-surface p-4">
          {isLoadingConcepts ? (
            <div className="space-y-2 text-sm text-darkBrown/70">
              <p className="font-medium text-darkBrown">Analyzing {location.city}...</p>
              <p>We are checking what tour concepts make the most sense for this city. The first time can take a little longer.</p>
            </div>
          ) : conceptDiscovery?.concepts.length ? (
            <ConceptPicker
              concepts={conceptDiscovery.concepts}
              selectedConceptSlug={selectedConcept?.slug ?? null}
              onSelect={(concept) => {
                setSelectedConcept(concept);
                setUseManualThemeMode(false);
                setErrors((current) => ({ ...current, concept: undefined }));
                setDuration(String(concept.suggestedDurationMinutes));
              }}
            />
          ) : !conceptDiscovery ? (
            <button
              type="button"
              onClick={handleDiscoverConcepts}
              disabled={isLoadingConcepts}
              className="w-full rounded-xl border-2 border-dashed border-darkBrown/20 px-4 py-6 text-sm text-darkBrown/60 hover:border-darkBrown/40 hover:text-darkBrown transition-colors"
            >
              <span className="font-medium">Discover tours for {location.city}</span>
              <span className="block mt-1 text-xs text-darkBrown/40">We will analyze the city and suggest curated walking tours</span>
            </button>
          ) : null}

          {conceptError && (
            <p className="text-sm text-darkBrown/70">{conceptError}</p>
          )}

          <button
            type="button"
            onClick={() => {
              setUseManualThemeMode((current) => !current);
              if (!useManualThemeMode) {
                setSelectedConcept(null);
              }
            }}
            className="text-sm font-medium text-darkBrown underline-offset-4 hover:underline"
          >
            {useManualThemeMode ? 'Hide manual theme mode' : 'Use manual theme mode instead'}
          </button>

          {errors.concept && (
            <p className="text-sm text-danger">{errors.concept}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Language"
          options={languageOptions}
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        />

        {useManualThemeMode ? (
          <Select
            label="Theme"
            options={themeOptions}
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            error={errors.theme}
            required
          />
        ) : (
        <div className="rounded-xl border border-darkBrown/10 bg-surface-elevated px-4 py-3 text-sm text-darkBrown/75">
            <p className="font-medium text-darkBrown">Selected audio walk</p>
            <p className="mt-1">{selectedConcept ? selectedConcept.title : 'Choose a recommended experience above.'}</p>
          </div>
        )}
      </div>

      <Select
        label="Tour Duration"
        options={durationOptions}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      />

      {isLoading && (
        <div className="rounded-xl border border-darkBrown/15 bg-surface-elevated p-4 text-sm text-darkBrown shadow-sm" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-mutedGold/35 border-t-darkBrown" />
            <div>
              <p className="font-medium">Creating your tour...</p>
              <p className="mt-1 text-darkBrown/75">
                Finding walkable stops, writing the guide, and generating audio. This can take a few minutes.
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-mutedGold">
                  {loadingStages[loadingStageIndex]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {loadingStages.map((stage, index) => {
                    const state = index < loadingStageIndex ? 'done' : index === loadingStageIndex ? 'active' : 'upcoming';

                    return (
                      <span
                        key={stage}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          state === 'done'
                            ? 'border-darkBrown/15 bg-mutedGold/18 text-darkBrown'
                            : state === 'active'
                              ? 'border-darkBrown/15 bg-surface text-darkBrown'
                              : 'border-darkBrown/10 bg-surface text-darkBrown/55'
                        }`}
                      >
                        {stage}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-xl border border-danger/20 bg-danger-surface p-4 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <Button
        type="submit"
        isLoading={isLoading}
        className="w-full"
      >
        {selectedConcept ? 'Create This Audio Walk' : 'Generate Tour'}
      </Button>
    </form>
  );
};
