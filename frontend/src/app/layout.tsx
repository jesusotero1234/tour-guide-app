import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AttributionFooter } from "@/components/layout/AttributionFooter";
import { pilotEnabled } from '@/lib/pilotMode';
import { cookies, headers } from 'next/headers';
import { preferredLanguage } from '@/lib/browseCopy';
import { PageLanguageProvider } from '@/components/layout/PageLanguage';
import { isSeoLocale, SITE_URL } from '@/lib/seoCatalog';

export const dynamic = 'force-dynamic';

// The player and the tour sheets use env(safe-area-inset-*): without viewport-fit=cover those values are 0 on phones with a notch.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f8f5ef' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Nomuvia",
  applicationName: "Nomuvia",
  description: "Discover cities at your own pace with multilingual audio walking tours.",
  robots: { index: false, follow: true },
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const urlLanguage = requestHeaders.get('x-nomuvia-page-language') ?? '';
  const language = isSeoLocale(urlLanguage) ? urlLanguage : preferredLanguage(cookieStore.get('tour-page-language')?.value, requestHeaders.get('accept-language') ?? '');
  const umamiScriptUrl = process.env.UMAMI_SCRIPT_URL ?? '';
  const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID ?? '';
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const isSafeUrl = (value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') return true;
      if (url.protocol === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      return false;
    } catch {
      return false;
    }
  };
  const showUmami = umamiScriptUrl.length > 0 && umamiWebsiteId.length > 0 && isSafeUrl(umamiScriptUrl) && isUuid(umamiWebsiteId);
  return (
    <html lang={language}>
      <body className="antialiased" data-pilot={pilotEnabled() ? 'true' : 'false'}>
        <PageLanguageProvider initialLanguage={language}>
          <div className="min-h-screen flex flex-col">{children}</div>
          <AttributionFooter scriptUrl={showUmami ? umamiScriptUrl : ""} websiteId={showUmami ? umamiWebsiteId : ""} />
        </PageLanguageProvider>
      </body>
    </html>
  );
}
