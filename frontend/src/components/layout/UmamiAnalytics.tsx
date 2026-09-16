'use client';

import Script from 'next/script';

export function UmamiAnalytics({
  scriptUrl,
  websiteId,
}: {
  scriptUrl: string;
  websiteId: string;
}) {
  return (
    <Script
      id="umami-analytics"
      src={scriptUrl}
      strategy="afterInteractive"
      data-website-id={websiteId}
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      onReady={() => {
        window.dispatchEvent(new CustomEvent('umami-ready'));
      }}
    />
  );
}
