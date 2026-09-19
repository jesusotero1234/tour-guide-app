'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsAllowed, CONSENT_EVENT } from '@/lib/consent';
import { trackPageView } from '@/lib/analytics';

export function UmamiAnalytics({ scriptUrl, websiteId }: { scriptUrl: string; websiteId: string }) {
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const sync = () => setAllowed(analyticsAllowed());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
  useEffect(() => {
    if (allowed && ready) trackPageView();
  }, [allowed, ready, pathname]);
  if (!allowed) return null;
  return <Script
    id="umami-analytics"
    src={scriptUrl}
    strategy="afterInteractive"
    data-website-id={websiteId}
    data-auto-track="false"
    data-do-not-track="true"
    data-exclude-search="true"
    data-exclude-hash="true"
    onReady={() => {
      setReady(true);
      if (analyticsAllowed()) window.dispatchEvent(new CustomEvent('umami-ready'));
    }}
  />;
}
