"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LocationData } from "@/types/api";
import { Input } from "@/components/common/Input";
import { searchCities } from "@/services/geocoding";

interface LocationPickerProps {
  value?: LocationData;
  onChange: (location: LocationData | undefined) => void;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<LocationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestCounterRef = useRef(0);

  const performSearch = useCallback(async () => {
    if (isLoading) return;
    const trimmed = searchText.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const currentRequest = ++requestCounterRef.current;
    setIsLoading(true);
    setError(null);
    setShowSuggestions(true);

    try {
      const results = await searchCities(trimmed);
      if (requestCounterRef.current !== currentRequest) return;
      setSuggestions(results);
    } catch {
      if (requestCounterRef.current !== currentRequest) return;
      setError("Failed to search cities");
      setSuggestions([]);
    } finally {
      if (requestCounterRef.current === currentRequest) {
        setIsLoading(false);
      }
    }
  }, [searchText, isLoading]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLocationSelect = (location: LocationData) => {
    onChange(location);
    setSearchText(`${location.city}, ${location.country}`);
    setSuggestions([]);
    setShowSuggestions(false);
    setError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    ++requestCounterRef.current;
    setIsLoading(false);
    setSearchText(e.target.value);
    onChange(undefined);
    setSuggestions([]);
    setError(null);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <Input
          label="Location"
          placeholder="Search for a city..."
          value={searchText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          onClick={performSearch}
          disabled={isLoading}
          className="shrink-0 rounded-lg bg-darkBrown px-4 py-2 text-sm text-white transition-colors hover:bg-darkBrown/80 disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </div>

      {value && !showSuggestions && (
        <p className="mt-2 text-sm text-darkBrown/75">
          Selected: {value.city}, {value.country}
          <br />
          <span className="text-xs text-darkBrown/50">
            ({value.coordinates.lat.toFixed(6)}, {value.coordinates.lng.toFixed(6)})
          </span>
        </p>
      )}

      {showSuggestions && (searchText.trim().length >= 3 || isLoading) && (
        <div className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-darkBrown/10 bg-surface-elevated shadow-lg">
          {error ? (
            <div role="alert" className="px-4 py-3 text-sm text-red-600">{error}</div>
          ) : isLoading ? (
            <div className="px-4 py-3 text-sm text-darkBrown/60">Loading...</div>
          ) : suggestions.length > 0 ? (
            <ul>
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.city}-${index}`}>
                  <button
                    type="button"
                    className="w-full cursor-pointer px-4 py-3 text-left text-sm text-darkBrown transition-colors hover:bg-mutedGold/15 focus:outline-none focus:bg-mutedGold/15"
                    onClick={() => handleLocationSelect(suggestion)}
                  >
                    {suggestion.city}, {suggestion.country}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-darkBrown/60">
              No cities found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
