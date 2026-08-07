'use client';

import { Header } from '@/components/layout/Header';
import { ToursList } from '@/components/tours/ToursList';

export default function ToursPage() {
  return (
    <div className="min-h-screen bg-beige">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">
              Published city walks
            </p>
            <h2 className="text-3xl font-serif font-bold tracking-tight text-darkBrown sm:text-4xl">
              Guided Walks Ready To Explore
            </h2>
            <p className="mt-4 text-lg text-darkBrown/80">
              Browse finished walking tours with a coherent story, grounded stops, and route guidance.
            </p>
          </div>
          
          <ToursList />
        </div>
      </main>
    </div>
  );
}
