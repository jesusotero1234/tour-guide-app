import { cookies, headers } from 'next/headers';
import { preferredLanguage } from '@/lib/browseCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import '@/components/tours/MobileTours.css';

/** Shown while the tour page loads: the same paper and the same shapes as the page that follows, in the visitor's language. */
export default async function TourDetailLoading() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const language = preferredLanguage(cookieStore.get('tour-page-language')?.value, requestHeaders.get('accept-language') ?? '');
  const t = mobileTourCopy(language);
  return (
    <main className="tour-entry tour-loading" lang={language} aria-busy="true">
      <p role="status" className="sr-only">{t.loading}</p>
      <div className="loading-bar loading-bar-short" />
      <div className="loading-cover" />
      <div className="loading-bar loading-bar-title" />
      <div className="loading-bar" />
      <div className="loading-bar loading-bar-medium" />
    </main>
  );
}
