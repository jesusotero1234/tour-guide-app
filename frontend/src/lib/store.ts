import { create } from 'zustand';
import { Tour, Language, Theme } from '../types/api';
import { TourListParams } from './api';

interface TourStore {
  // Current tour being viewed
  currentTour: Tour | null;
  
  // Tour listing state
  availableTours: Tour[];
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  
  // Search/filter parameters
  searchParams: TourListParams;
  
  // Actions for current tour
  setTour: (tour: Tour) => void;
  clearTour: () => void;
  
  // Actions for tour listings
  setAvailableTours: (tours: Tour[]) => void;
  clearAvailableTours: () => void;
  
  // Actions for loading state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Actions for search parameters
  setSearchCity: (city: string | undefined) => void;
  setSearchTheme: (theme: Theme | undefined) => void;
  setSearchLanguage: (language: Language | undefined) => void;
  clearSearchParams: () => void;
  setSearchParams: (params: Partial<TourListParams>) => void;
}

export const useTourStore = create<TourStore>((set) => ({
  // Initial state
  currentTour: null,
  availableTours: [],
  isLoading: false,
  error: null,
  searchParams: {},
  
  // Current tour actions
  setTour: (tour: Tour) => set({ currentTour: tour, error: null }),
  clearTour: () => set({ currentTour: null, error: null }),
  
  // Tour listing actions
  setAvailableTours: (tours: Tour[]) => set({ availableTours: tours }),
  clearAvailableTours: () => set({ availableTours: [] }),
  
  // Loading state actions
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  // setError never touches isLoading — callers manage loading state explicitly.
  setError: (error: string | null) => set({ error }),
  
  // Search parameter actions
  setSearchCity: (city: string | undefined) => 
    set((state) => ({ 
      searchParams: { ...state.searchParams, city } 
    })),
  setSearchTheme: (theme: Theme | undefined) => 
    set((state) => ({ 
      searchParams: { ...state.searchParams, theme } 
    })),
  setSearchLanguage: (language: Language | undefined) => 
    set((state) => ({ 
      searchParams: { ...state.searchParams, language } 
    })),
  clearSearchParams: () => set({ searchParams: {} }),
  setSearchParams: (params: Partial<TourListParams>) => 
    set((state) => ({ 
      searchParams: { ...state.searchParams, ...params } 
    })),
}));
