'use client';

import Link from 'next/link';
import { ToursList } from '@/components/tours/ToursList';
import { PageLanguageSelect } from '@/components/layout/PageLanguage';

export default function ToursPage() {
  return (
    <div className="tour-entry bg-surface">
      <main className="mx-auto max-w-md px-5 py-6">
        <header className="mb-7 flex items-center justify-between gap-3">
          <Link href="/tours" className="inline-flex min-h-11 items-center font-serif text-xl text-darkBrown">AI Tour Guide</Link>
          <PageLanguageSelect />
        </header>
        <ToursList />
      </main>
      <style jsx global>{`
        body:has(.tour-entry) > div.min-h-screen { min-height: 0; }
        body:has(.tour-entry) > footer { background: var(--surface); }
        body:has(.tour-entry) > footer > div { max-width: 28rem; }
        body:has(.tour-entry) .tour-info-links { justify-content: center; gap: 0 1rem; font-size: 0.75rem; }
      `}</style>
    </div>
  );
}
