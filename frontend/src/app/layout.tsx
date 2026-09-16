import type { Metadata } from "next";
import "./globals.css";
import { AttributionFooter } from "@/components/layout/AttributionFooter";
import { pilotEnabled } from '@/lib/pilotMode';
import { UmamiAnalytics } from "@/components/layout/UmamiAnalytics";
import { cookies, headers } from 'next/headers';
import { preferredLanguage } from '@/lib/browseCopy';
import { PageLanguageProvider } from '@/components/layout/PageLanguage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "AI Tour Guide",
  description: "Generate coherent, mobile-friendly walking tours for cities around the world.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const language = preferredLanguage(cookieStore.get('tour-page-language')?.value, requestHeaders.get('accept-language') ?? '');
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
          <AttributionFooter />
        </PageLanguageProvider>
        {showUmami && <UmamiAnalytics scriptUrl={umamiScriptUrl} websiteId={umamiWebsiteId} />}
      </body>
    </html>
  );
}
