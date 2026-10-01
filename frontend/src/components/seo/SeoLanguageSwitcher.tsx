'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Language } from '@/types/api';
import { languageNames } from '@/lib/browseCopy';

export function SeoLanguageSwitcher({ locale, label, alternates }: {
  locale: Language;
  label: string;
  alternates: Record<string, string>;
}) {
  const picker = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (picker.current && !picker.current.contains(event.target as Node)) picker.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !picker.current?.open) return;
      picker.current.open = false;
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return <nav className="seo-language-nav" aria-label={label}>
    {Object.keys(alternates).length > 1 ? <details ref={picker} className="seo-language-picker"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
      }}>
      <summary ref={trigger} aria-label={`${label}: ${languageNames[locale]}`}>
        <span lang={locale}>{languageNames[locale]}</span>
        <svg className="seo-language-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="seo-language-options">
        {Object.entries(alternates).map(([lang, href]) => <Link key={lang} href={href} hrefLang={lang} lang={lang}
          aria-current={locale === lang ? 'page' : undefined} onClick={() => {
            if (picker.current) picker.current.open = false;
            trigger.current?.focus();
          }}>
          {languageNames[lang as Language]}
          {locale === lang && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </Link>)}
      </div>
    </details> : <span className="seo-language-current" lang={locale}>{languageNames[locale]}</span>}
  </nav>;
}
