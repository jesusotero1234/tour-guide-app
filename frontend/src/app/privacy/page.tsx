import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { InfoLinks } from '@/components/legal/InfoLinks';
import { ClearProgressButton } from '@/components/legal/ClearProgressButton';
import { readPilotNotice } from '@/lib/pilotServer';
import { preferredLanguage, supportedLanguage } from '@/lib/browseCopy';
import { privacyCopy } from '@/lib/privacyCopy';

export default async function Privacy({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const [params, cookieStore, requestHeaders] = await Promise.all([
    searchParams, cookies(), headers(),
  ]);
  const language = supportedLanguage(params.lang)
    ?? preferredLanguage(cookieStore.get('tour-page-language')?.value, requestHeaders.get('accept-language') ?? '');
  const t = privacyCopy[language];
  const notice = await readPilotNotice(language);
  const fields = ['hosting', 'processors', 'transfers', 'retention', 'legalBases', 'rights'] as const;
  return <main lang={language} className="legal-page" style={{ overflowWrap: 'anywhere' }}>
    <Link href="/tours">{t.back}</Link>
    <h1>{t.title}</h1>
    <p>{t.progress}</p>
    <p>{t.welcome}</p>
    <ClearProgressButton language={language} />
    <h2>{t.storageTitle}</h2>
    <p>{t.storage}</p>
    <p>{t.consent}</p>
    <h2>{t.locationTitle}</h2>
    <p>{t.photos}</p>
    <p>{t.location}</p>
    <p>{t.maps}</p>
    {notice ? <><h2>{t.controller}</h2><p>{notice.operatorName} · <a href={'mailto:' + notice.contactEmail}>{notice.contactEmail}</a></p>{notice.contentLanguage !== language && <p>{t.translationPending}</p>}{fields.map(key => <section key={key}><h2>{t[key]}</h2><p lang={notice.contentLanguage}>{notice[key]}</p></section>)}</> : <p>{t.closed}</p>}
    <h2>{t.analyticsTitle}</h2>
    <p>{t.analytics}</p>
    <InfoLinks language={language} />
  </main>;
}
