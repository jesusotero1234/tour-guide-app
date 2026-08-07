'use client';

import { Header } from '@/components/layout/Header';
import { TourForm } from '@/components/form/TourForm';

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1fr)] lg:items-start">
          <section className="rounded-[1.75rem] border border-darkBrown/10 bg-surface-elevated p-6 shadow-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-mutedGold">
              Guided city walks
            </p>
            <h2 className="mt-4 text-4xl font-serif font-bold leading-tight text-darkBrown sm:text-5xl">
              Explore a city with a guide in your pocket.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-darkBrown/75 sm:text-lg">
              Build a walking route with a coherent guide, memorable landmarks, and map guidance designed for exploring at your own pace.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-darkBrown/10 bg-surface px-4 py-4">
                <p className="text-sm font-medium text-darkBrown">Walkable route</p>
                <p className="mt-1 text-sm text-darkBrown/65">Stops arranged for moving through the city on foot.</p>
              </div>
              <div className="rounded-2xl border border-darkBrown/10 bg-surface px-4 py-4">
                <p className="text-sm font-medium text-darkBrown">A guide with a story</p>
                <p className="mt-1 text-sm text-darkBrown/65">Each stop advances the tour instead of repeating the same description.</p>
              </div>
              <div className="rounded-2xl border border-darkBrown/10 bg-surface px-4 py-4">
                <p className="text-sm font-medium text-darkBrown">Map support</p>
                <p className="mt-1 text-sm text-darkBrown/65">Use the map only when you need the next visual cue.</p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-darkBrown/12 bg-surface-elevated p-5 shadow-md sm:p-7">
            <div className="mb-5">
              <h3 className="text-2xl font-serif font-semibold text-darkBrown">
                Create your tour
              </h3>
              <p className="mt-2 text-sm leading-6 text-darkBrown/70">
                Pick any city, a basic theme, and a language. We reuse a reviewed tour when one exists or create a new text guide in the background.
              </p>
            </div>
            <TourForm />
          </section>
        </div>
      </main>
    </div>
  );
}
