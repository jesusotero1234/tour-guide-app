import type { MetadataRoute } from 'next';
import { absoluteUrl, cityAlternates, cityPath, routeAlternates, routePath, SEO_CITIES, type SeoLocale } from '@/lib/seoCatalog';
import { getSeoCatalog } from '@/lib/seoServer';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSeoCatalog();
  return [
    { url: absoluteUrl('/tours') },
    ...SEO_CITIES.flatMap(city => {
      const languages = cityAlternates(city.slug, entries);
      return Object.keys(languages).map(locale => ({ url: absoluteUrl(cityPath(locale as SeoLocale, city.slug)), alternates: { languages } }));
    }),
    ...entries.map(entry => ({ url: absoluteUrl(routePath(entry.route)), alternates: { languages: routeAlternates(entry, entries) } })),
  ];
}
