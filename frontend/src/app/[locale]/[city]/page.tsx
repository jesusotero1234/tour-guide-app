import { notFound } from 'next/navigation';
import { CityLanding } from '@/components/seo/SeoLanding';
import { cityAlternates, cityContent, cityPath, findSeoCity, isSeoLocale, SITE_URL } from '@/lib/seoCatalog';
import { getSeoCityCatalog } from '@/lib/seoServer';
import { breadcrumbData, JsonLd, seoMetadata } from '@/lib/seoMetadata';
import { seoCopy } from '@/lib/seoCopy';

type Props = { params: Promise<{ locale: string; city: string }> };

async function cityData(params: Props['params']) {
  const { locale, city: slug } = await params;
  const city = findSeoCity(slug);
  if (!isSeoLocale(locale) || !city) notFound();
  const catalog = await getSeoCityCatalog(city.slug);
  const entries = catalog.filter(entry => entry.route.locale === locale);
  if (!entries.length) notFound();
  return { locale, city, entries, alternates: cityAlternates(city.slug, catalog) };
}

export async function generateMetadata({ params }: Props) {
  const { locale, city, alternates } = await cityData(params);
  const content = cityContent(locale, city);
  return seoMetadata(content.title, content.description, cityPath(locale, city.slug), locale, alternates);
}

export default async function CityPage({ params }: Props) {
  const data = await cityData(params);
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Nomuvia', url: SITE_URL, logo: `${SITE_URL}/icon.png` },
    breadcrumbData([{ name: seoCopy(data.locale).cities, path: '/tours' }, { name: data.city.names[data.locale], path: cityPath(data.locale, data.city.slug) }]),
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JsonLd({ data: schema }) }} /><CityLanding {...data} /></>;
}
