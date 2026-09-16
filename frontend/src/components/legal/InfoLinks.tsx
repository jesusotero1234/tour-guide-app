import Link from 'next/link';
import { browseCopy, supportedLanguage } from '@/lib/browseCopy';
export function InfoLinks({ language = 'es' }: { language?: string }) {
  const t = browseCopy(supportedLanguage(language) ?? 'es');
  const fr = language === 'fr', suffix = '?lang=' + (fr ? 'fr' : 'es');
  return <nav className="tour-info-links" aria-label={t.infoLabel}>
    <Link href={'/about' + suffix}>{t.about}</Link>
    <Link href={'/data-sources' + suffix}>{t.sources}</Link>
    <Link href={'/privacy' + suffix}>{t.privacy}</Link>
  </nav>;
}
