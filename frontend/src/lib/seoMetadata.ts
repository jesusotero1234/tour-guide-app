import type { Metadata } from 'next';
import { SITE_URL, absoluteUrl, type SeoLocale } from './seoCatalog';

export function seoMetadata(title: string, description: string, path: string, locale: SeoLocale, languages: Record<string, string>): Metadata {
  return {
    title: `${title} | Nomuvia`, description,
    robots: { index: true, follow: true },
    alternates: { canonical: absoluteUrl(path), languages },
    openGraph: { title, description, url: absoluteUrl(path), siteName: 'Nomuvia', type: 'website', locale: { es: 'es_ES', en: 'en_US', fr: 'fr_FR', de: 'de_DE', it: 'it_IT' }[locale], images: [{ url: `${SITE_URL}/icon.png`, alt: 'Nomuvia' }] },
    twitter: { card: 'summary', title, description, images: [`${SITE_URL}/icon.png`] },
  };
}

export function breadcrumbData(items: { name: string; path: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path) })) };
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Used by server components; escape '<' to prevent closing the script from a title.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
