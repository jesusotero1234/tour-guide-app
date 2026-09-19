'use client';

import { PrivacyPreferences } from '@/components/legal/PrivacyPreferences';
import { InfoLinks } from '@/components/legal/InfoLinks';
import { usePageLanguage } from './PageLanguage';
import { browseCopy } from '@/lib/browseCopy';

export const AttributionFooter = ({ scriptUrl, websiteId }: { scriptUrl: string; websiteId: string }) => {
  const { language } = usePageLanguage();
  const t = browseCopy(language);
  return (
    <footer className="border-t border-darkBrown/20 bg-beige mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <p className="text-xs text-darkBrown/60 text-center">
          {t.mapsCredit} &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-darkBrown">OpenStreetMap contributors</a>
          {' · '}
          {t.wikipediaCredit}{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-darkBrown">CC BY-SA</a>
        </p>
        <div className="mt-3 flex justify-center">
          <InfoLinks language={language} />
        </div>
        <PrivacyPreferences scriptUrl={scriptUrl} websiteId={websiteId} />
      </div>
    </footer>
  );
};
