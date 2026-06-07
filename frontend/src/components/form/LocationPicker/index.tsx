"use client";

import { useState, useEffect, useRef } from "react";
import { LocationData } from "@/types/api";
import { Input } from "@/components/common/Input";
import { searchCities } from "@/services/geocoding";
import useDebounce from "@/hooks/useDebounce";

interface LocationPickerProps {
  value?: LocationData;
  onChange: (location: LocationData) => void;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<LocationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(searchText, 300);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!debouncedSearch) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const results = await searchCities(debouncedSearch);
        setSuggestions(results);
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedSearch]);

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
    setShowSuggestions(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        label="Location"
        placeholder="Search for a city..."
        value={searchText}
        onChange={(e) => {
          setSearchText(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
      />

      {value && !showSuggestions && (
        <p className="mt-2 text-sm text-darkBrown/75">
          Selected: {value.city}, {value.country}
          <br />
          <span className="text-xs text-darkBrown/50">
            ({value.coordinates.lat.toFixed(6)}, {value.coordinates.lng.toFixed(6)})
          </span>
        </p>
      )}

      {showSuggestions && (searchText || isLoading) && (
        <div className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-darkBrown/10 bg-surface-elevated shadow-lg">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-darkBrown/60">Loading...</div>
          ) : suggestions.length > 0 ? (
            <ul>
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.city}-${index}`}
                  className="cursor-pointer px-4 py-3 text-sm text-darkBrown transition-colors hover:bg-mutedGold/15"
                  onClick={() => handleLocationSelect(suggestion)}
                >
                  {suggestion.city}, {suggestion.country}
                </li>
              ))}
            </ul>
          ) : searchText ? (
            <div className="px-4 py-3 text-sm text-darkBrown/60">
              No cities found
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
