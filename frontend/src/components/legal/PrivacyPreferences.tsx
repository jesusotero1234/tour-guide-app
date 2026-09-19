'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePageLanguage } from '@/components/layout/PageLanguage';
import { UmamiAnalytics } from '@/components/layout/UmamiAnalytics';
import { CONSENT_EVENT, CONSENT_KEY, analyticsAllowed, readConsent, saveConsent } from '@/lib/consent';
import { consentCopy } from '@/lib/consentCopy';

export function PrivacyPreferences({ scriptUrl, websiteId }: { scriptUrl: string; websiteId: string }) {
  const { language } = usePageLanguage();
  const t = consentCopy[language];
  const [pending, setPending] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const configured = !!scriptUrl && !!websiteId;
  const canChooseAnalytics = configured && !blocked;
  useEffect(() => {
    const sync = () => {
      const consent = readConsent();
      setPending(!consent);
      setEnabled(consent?.analytics ?? false);
      try { setBlocked(navigator.doNotTrack === '1' || !!localStorage.getItem('umami.disabled') || (consent?.analytics === true && !analyticsAllowed())); }
      catch { setBlocked(true); }
    };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === CONSENT_KEY || event.key === 'umami.disabled') sync(); };
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', sync);
    return () => { window.removeEventListener(CONSENT_EVENT, sync); window.removeEventListener('storage', storage); window.removeEventListener('focus', sync); };
  }, []);
  const choose = (analytics: boolean) => {
    saveConsent(analytics);
    dialog.current?.close();
  };
  const open = () => {
    setEnabled(readConsent()?.analytics ?? false);
    dialog.current?.showModal();
  };
  return <>
    <button className="privacy-settings-link" onClick={open}>{t.settings}</button>
    {pending && <section className="privacy-banner" aria-labelledby="privacy-banner-title">
      <div><p className="privacy-eyebrow">{t.privacy}</p><h2 id="privacy-banner-title">{t.title}</h2><p>{canChooseAnalytics ? t.intro : t.noticeIntro}</p></div>
      <div className="privacy-actions">
        <>{canChooseAnalytics ? <>
          <button onClick={() => choose(true)}>{t.accept}</button>
          <button onClick={() => choose(false)}>{t.reject}</button>
        </> : <button onClick={() => choose(false)}>{t.understood}</button>}</>
        <button className="privacy-text-action" onClick={open}>{t.settings}</button>
      </div>
    </section>}
    <dialog ref={dialog} className="privacy-dialog" aria-labelledby="privacy-dialog-title">
      <div className="privacy-dialog-heading"><p className="privacy-eyebrow">{t.privacy}</p><button autoFocus onClick={() => dialog.current?.close()} aria-label={t.close}>×</button></div>
      <h2 id="privacy-dialog-title">{t.title}</h2>
      <section><h3>{t.essential}</h3><p>{t.essentialText}</p></section>
      <section><label className="privacy-toggle"><span>{t.analytics}</span><input type="checkbox" checked={enabled} disabled={!configured || blocked} onChange={event => setEnabled(event.target.checked)} /></label><p>{t.analyticsText}</p>
        {(!configured || blocked) && <p>{t.unavailable}</p>}
      </section>
      <Link href={'/privacy?lang=' + language} onClick={() => dialog.current?.close()}>{t.privacy} →</Link>
      <div className="privacy-actions"><button onClick={() => choose(enabled && configured && !blocked)}>{t.save}</button><button onClick={() => choose(false)}>{t.reject}</button></div>
    </dialog>
    {configured && <UmamiAnalytics scriptUrl={scriptUrl} websiteId={websiteId} />}
  </>;
}
