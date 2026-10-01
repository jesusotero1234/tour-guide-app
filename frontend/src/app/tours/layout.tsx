import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/seoCatalog';

export const metadata: Metadata = {
  title: 'Free audio walking tours | Nomuvia',
  description: 'Explore cities at your own pace with free audio walking tours. Choose a route and start listening, with no app or account needed.',
  robots: { index: true, follow: true },
  alternates: { canonical: absoluteUrl('/tours') },
};

export default function ToursLayout({ children }: { children: React.ReactNode }) { return children; }
