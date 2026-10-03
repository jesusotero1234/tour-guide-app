'use client';

import { useEffect, useRef, useState } from 'react';
import type { Language } from '@/types/api';
import { sampleUrlOf, type CardTour } from '@/lib/tourSummary';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { listeningCopy } from '@/components/tour/listeningCopy';

const PREVIEW_EVENT = 'nomuvia-preview-play';

/** A short, user-initiated preview. It never changes the walk's saved progress. */
export function TourSample({ tour, language, expanded = false }: { tour: CardTour; language: Language; expanded?: boolean }) {
  const t = mobileTourCopy(language);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [finished, setFinished] = useState(false);
  const url = sampleUrlOf(tour);

  useEffect(() => {
    const element = audio.current;
    if (element && url) element.setAttribute('src', url);
    const pause = () => element?.pause();
    document.addEventListener(PREVIEW_EVENT, pause);
    return () => {
      document.removeEventListener(PREVIEW_EVENT, pause);
      element?.pause();
      element?.removeAttribute('src');
      element?.load();
    };
  }, [url]);

  if (!url) return null;
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) { element.pause(); return; }
    document.dispatchEvent(new Event(PREVIEW_EVENT));
    if (failed) element.load();
    if (finished || element.ended || element.currentTime >= 45) element.currentTime = 0;
    setFailed(false);
    setFinished(false);
    void element.play().catch(error => {
      // Switching previews can cancel a pending play request without an audio failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (element.isConnected) setFailed(true);
    });
  };
  return <div className={`tour-sample${expanded ? ' expanded' : ''}`}>
    <audio ref={audio} src={url} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onError={() => { setFailed(true); setPlaying(false); }} onEnded={() => { setPlaying(false); setFinished(true); }}
      onTimeUpdate={event => {
        if (event.currentTarget.currentTime >= 45) { event.currentTarget.pause(); setFinished(true); }
      }} />
    <button type="button" className="tour-sample-button" onClick={toggle} aria-label={`${playing ? t.pauseSample : t.sample}: ${tour.title || tour.city}`}>
      <span className="tour-sample-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        {playing ? <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></> : <path d="m8 4 13 8-13 8Z" />}
      </svg></span>
      <span><strong>{playing ? t.pauseSample : t.sample}</strong>{expanded && <small>{t.sampleNotice} · {listeningCopy(language).aiVoice}</small>}</span>
      {expanded && <span className={`tour-sample-wave${playing ? ' playing' : ''}`} aria-hidden="true">▂▅▃▇▅▂▆▃</span>}
    </button>
    <p className={failed ? 'sample-error' : 'sr-only'} role={failed ? 'alert' : 'status'}>{failed ? t.sampleUnavailable : finished ? t.sampleEnd : ''}</p>
  </div>;
}
