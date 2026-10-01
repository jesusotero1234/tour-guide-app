import { notFound } from 'next/navigation';
import { RouteLanding } from '@/components/seo/SeoLanding';
import { cityPath, isSeoLocale, routeAlternates, routePath, SEO_ROUTES } from '@/lib/seoCatalog';
import { getSeoCityCatalog, getSeoWalkingRoute } from '@/lib/seoServer';
import { breadcrumbData, JsonLd, seoMetadata } from '@/lib/seoMetadata';
import { seoCopy } from '@/lib/seoCopy';

type Props = { params: Promise<{ locale: string; city: string; slug: string }> };

async function routeData(params: Props['params']) {
  const { locale, city, slug } = await params;
  if (!isSeoLocale(locale) || !SEO_ROUTES.some(route => route.locale === locale && route.city === city && route.slug === slug)) notFound();
  const catalog = await getSeoCityCatalog(city);
  const entry = catalog.find(item => item.route.locale === locale && item.route.slug === slug);
  if (!entry) notFound();
  return { entry, alternates: routeAlternates(entry, catalog) };
}

export async function generateMetadata({ params }: Props) {
  const { entry: { route }, alternates } = await routeData(params);
  return seoMetadata(route.title, route.description, routePath(route), route.locale, alternates);
}

export default async function TourRoutePage({ params }: Props) {
  const data = await routeData(params);
  const { route } = data.entry;
  const walkingRoute = await getSeoWalkingRoute(route.id);
  const schema = breadcrumbData([{ name: seoCopy(route.locale).cities, path: '/tours' }, { name: data.entry.city.names[route.locale], path: cityPath(route.locale, route.city) }, { name: route.title, path: routePath(route) }]);
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JsonLd({ data: schema }) }} /><RouteLanding {...data} walkingRoute={walkingRoute} /></>;
}
