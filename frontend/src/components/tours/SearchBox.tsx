'use client';

import { FormEvent, useState } from 'react';
import { Theme, Language } from '@/types/api';
import { useTourStore } from '@/lib/store';
import useDebounce from '@/hooks/useDebounce';
import { useEffect } from 'react';

export const SearchBox = () => {
  const { searchParams, setSearchCity, setSearchTheme, setSearchLanguage } = useTourStore();
  const [cityInput, setCityInput] = useState(searchParams.city || '');
  const debouncedCity = useDebounce(cityInput, 500);

  useEffect(() => {
    setSearchCity(debouncedCity || undefined);
  }, [debouncedCity, setSearchCity]);

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCityInput(e.target.value);
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Theme | '';
    setSearchTheme(value || undefined);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Language | '';
    setSearchLanguage(value || undefined);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // The search is triggered automatically by the store updates
  };

  return (
    <div className="mb-6 rounded-xl border border-darkBrown/15 bg-surface-elevated p-4 shadow-sm sm:p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="city" className="mb-1 block text-sm font-medium text-darkBrown">
              City
            </label>
            <input
              type="text"
              id="city"
              placeholder="Search by city"
              value={cityInput}
              onChange={handleCityChange}
              className="w-full rounded-lg border border-darkBrown/20 bg-surface px-4 py-3 text-darkBrown shadow-sm placeholder:text-darkBrown/45 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
          </div>

          <div>
            <label htmlFor="theme" className="mb-1 block text-sm font-medium text-darkBrown">
              Experience type
            </label>
            <select
              id="theme"
              value={searchParams.theme || ''}
              onChange={handleThemeChange}
              className="w-full rounded-lg border border-darkBrown/20 bg-surface px-4 py-3 text-darkBrown shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
            >
              <option value="">All experiences</option>
              <option value="architecture">Architecture & design</option>
              <option value="history">History & city memory</option>
              <option value="food">Markets & local life</option>
            </select>
          </div>

          <div>
            <label htmlFor="language" className="mb-1 block text-sm font-medium text-darkBrown">
              Language
            </label>
            <select
              id="language"
              value={searchParams.language || ''}
              onChange={handleLanguageChange}
              className="w-full rounded-lg border border-darkBrown/20 bg-surface px-4 py-3 text-darkBrown shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
            >
              <option value="">All Languages</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
            </select>
          </div>
        </div>
      </form>
    </div>
  );
};
