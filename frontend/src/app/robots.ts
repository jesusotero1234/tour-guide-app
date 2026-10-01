import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seoCatalog';

export default function robots(): MetadataRoute.Robots {
  // Pages marked noindex remain crawlable so crawlers can read the directive.
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE_URL}/sitemap.xml` };
}
