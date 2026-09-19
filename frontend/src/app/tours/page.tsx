'use client';

import Link from 'next/link';
import { ToursList } from '@/components/tours/ToursList';
import { PageLanguageSelect } from '@/components/layout/PageLanguage';
import '@/components/tours/MobileTours.css';

export default function ToursPage() {
  return (
    <div className="tour-entry bg-surface">
      <main className="mobile-tour-shell">
        <header className="mobile-tour-header">
          <Link href="/tours" className="nomuvia-wordmark">nomuvia<span aria-hidden="true">↗</span></Link>
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
