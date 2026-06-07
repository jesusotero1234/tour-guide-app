'use client';

import { useEffect, useState } from 'react';
import { useTourStore } from '@/lib/store';
import { listTours } from '@/lib/api';
import { TourCard } from './TourCard';
import { SearchBox } from './SearchBox';

export const ToursList = () => {
  const { 
    availableTours, 
    setAvailableTours, 
    searchParams, 
    setLoading, 
    setError,
    isLoading,
    error 
  } = useTourStore();
  
  // Track mounted state to prevent state updates after unmount
  const [isMounted, setIsMounted] = useState(false);

  // Fetch tours based on search parameters
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    const fetchTours = async () => {
      if (!isMounted) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const tours = await listTours({ ...searchParams, readyOnly: true });
        setAvailableTours(tours);
      } catch (err) {
        console.error('Error fetching tours:', err);
        setError('Failed to load tours. Please try again.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTours();
  }, [
    searchParams, 
    setAvailableTours, 
    setLoading, 
    setError, 
    isMounted
  ]);

  return (
    <div>
      <SearchBox />
      
      {isLoading && (
        <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated py-12 text-center shadow-sm">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-darkBrown border-r-transparent"></div>
          <p className="mt-2 text-darkBrown/70 font-serif">Loading tours...</p>
        </div>
      )}
      
      {error && (
        <div className="mb-6 rounded-xl border border-danger/20 bg-danger-surface p-4 text-danger">
          <p>{error}</p>
        </div>
      )}
      
      {!isLoading && !error && availableTours.length === 0 && (
        <div className="rounded-2xl border border-darkBrown/12 bg-surface-elevated py-12 text-center shadow-sm">
          <p className="text-darkBrown/70 italic">
            No tours found. Try adjusting your search filters.
          </p>
        </div>
      )}
      
      {!isLoading && !error && availableTours.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableTours.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
      )}
    </div>
  );
};
