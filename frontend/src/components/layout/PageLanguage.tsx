'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Language } from '@/types/api';
import { browseCopy, languageNames, supportedLanguage } from '@/lib/browseCopy';
import { usePathname } from 'next/navigation';

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({
  language: 'en', setLanguage: () => {},
});

export function PageLanguageProvider({ initialLanguage, children }: { initialLanguage: Language; children: React.ReactNode }) {
  const [selectedLanguage, updateLanguage] = useState(initialLanguage);
  const pathname = usePathname();
  const explicitLocale = /^\/(es|en|fr|de|it)\//.exec(pathname)?.[1];
  const language = (explicitLocale || selectedLanguage) as Language;
  useEffect(() => { if (explicitLocale) updateLanguage(explicitLocale as Language); }, [explicitLocale]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = (value: Language) => {
    if (!supportedLanguage(value)) return;
    updateLanguage(value);
    document.cookie = `tour-page-language=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function usePageLanguage() { return useContext(LanguageContext); }

export function PageLanguageSelect() {
  const { language, setLanguage } = usePageLanguage();
  return <div className="min-w-0 max-w-[55%] text-darkBrown">
    <label htmlFor="page-language" className="mb-1 block text-xs">{browseCopy(language).pageLanguage}</label>
    <select id="page-language" value={language} onChange={event => setLanguage(event.target.value as Language)}
      className="min-h-11 w-full rounded-xl border border-darkBrown/20 bg-surface-elevated px-2 text-sm">
      {Object.entries(languageNames).map(([value, label]) => <option key={value} value={value} lang={value}>{label}</option>)}
    </select>
  </div>;
}
