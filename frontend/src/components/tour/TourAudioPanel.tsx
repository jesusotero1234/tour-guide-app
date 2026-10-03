'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTourAudio, getTourAudio, TourAudioState } from '@/lib/tourAudio';
import { AudioPlayer } from './AudioPlayer';
import { ListeningProgress, listeningKey } from '@/lib/tourProgress';
import { useTourAudioEngine, type EngineSegment } from '@/hooks/useTourAudioEngine';
import { listeningCopy } from './listeningCopy';
import Link from 'next/link';

interface Props {
  tourId: string;
  language: string;
  currentPlaceId: string;
  currentPlaceName: string;
  compact?: boolean;
  introduction?: boolean;
  onIntroductionReady?: (introduction: NonNullable<TourAudioState['introduction']>) => void;
  /** The whole audio state, so that the player knows whether link clips exist (a flexible tour). */
  onAudioState?: (state: TourAudioState) => void;
  onProgress?: (progress: ListeningProgress) => void;
  /** The link clip that follows this segment in the active order, if the tour has them. */
  cueAfter?: { text: string; audioUrl: string } | null;
  /** Start playing as soon as this segment is loaded (set by the lock-screen next and previous actions). */
  autoplay?: boolean;
  onAutoplayConsumed?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  media?: { artist?: string; album?: string; artwork?: string };
}

export function TourAudioPanel({ tourId, language, currentPlaceId, currentPlaceName, compact = false, introduction = false, onIntroductionReady, onAudioState, onProgress, cueAfter, autoplay = false, onAutoplayConsumed, onNext, onPrevious, media }: Props) {
  const t = listeningCopy(language);
  const [state, setState] = useState<TourAudioState | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(false);
  const mayBeRunning = useRef(false);
  const introductionCallback = useRef(onIntroductionReady);
  const stateCallback = useRef(onAudioState);
  useEffect(() => { introductionCallback.current = onIntroductionReady; stateCallback.current = onAudioState; }, [onIntroductionReady, onAudioState]);
  const supported = ['es', 'fr', 'en', 'de', 'it'].includes(language);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!supported) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const next = await getTourAudio(tourId, controller.signal);
        if (disposed) return;
        setState(next);
        stateCallback.current?.(next);
        if (next.introduction) introductionCallback.current?.(next.introduction);
        setStatusError(null);
        if (next.status === 'queued' || next.status === 'running' || next.status === 'completed') {
          setActionError(null);
        }
        mayBeRunning.current = next.status === 'queued' || next.status === 'running';
        if (mayBeRunning.current || next.status === 'idle') timer = setTimeout(poll, 15000);
      } catch (failure) {
        if (disposed) return;
        setStatusError(failure instanceof Error ? failure.message : 'Unable to check audio progress.');
        if (mayBeRunning.current) timer = setTimeout(poll, 15000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [tourId, supported, refresh]);

  const create = async () => {
    if (submitting || mayBeRunning.current || state?.canGenerate === false) return;
    setSubmitting(true);
    setActionError(null);
    mayBeRunning.current = true;
    try {
      const next = await createTourAudio(tourId);
      if (!mounted.current) return;
      setState(next);
      mayBeRunning.current = next.status === 'queued' || next.status === 'running';
    } catch (failure) {
      if (!mounted.current) return;
      setActionError(failure instanceof Error ? failure.message : 'Unable to start audio generation.');
    } finally {
      if (mounted.current) {
        setSubmitting(false);
        setRefresh(value => value + 1);
      }
    }
  };

  const busy = submitting || state?.status === 'queued' || state?.status === 'running';
  const audioUrl = introduction ? state?.introduction?.audioUrl : state?.audioUrls[currentPlaceId];
  const segmentId = introduction ? 'introduction' : currentPlaceId;
  const version = introduction ? state?.introduction?.version : state?.audioVersions?.[currentPlaceId];
  const displayError = statusError || actionError || state?.error?.message || state?.status === 'failed' || state?.status === 'unavailable';

  // The element is created once and lives as long as the walk; only the segment it plays changes.
  const engine = useTourAudioEngine({ tourId, language, onProgress,
    cueAfterBody: () => (cueAfter ? { kind: 'cue', url: cueAfter.audioUrl, title: cueAfter.text } : null),
    onNext, onPrevious, media: media ? { title: currentPlaceName, ...media } : { title: currentPlaceName } });
  const body = useMemo<EngineSegment | null>(() => {
    if (!audioUrl) return null;
    const analytics: Record<string, string> = introduction ? { segment: 'introduction' } : { place_id: currentPlaceId };
    return { kind: 'body', url: audioUrl, title: currentPlaceName, progressKey: listeningKey(tourId, segmentId, version ?? audioUrl), analytics };
  }, [audioUrl, currentPlaceName, tourId, segmentId, version, introduction, currentPlaceId]);
  const autoplayRef = useRef({ autoplay, consumed: onAutoplayConsumed });
  useLayoutEffect(() => { autoplayRef.current = { autoplay, consumed: onAutoplayConsumed }; });   // before the effect below reads it
  useLayoutEffect(() => {
    const play = autoplayRef.current.autoplay && !!body;
    engine.load(body, { autoplay: play });
    if (play) autoplayRef.current.consumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body?.url, body?.progressKey]);

  return <>
    <audio ref={engine.audioRef} preload="metadata" data-testid="tour-audio" />
    {audioUrl ? <>
      <p className="audio-disclosure">{t.aiVoice} · <Link href={'/about?lang=' + language + '#voice'}>{t.aboutVoice}</Link></p>
      <AudioPlayer engine={engine} title={currentPlaceName} compact={compact} language={language} />
    </> : <section className="audio-preparation" aria-label={currentPlaceName}>
      <h2>{currentPlaceName}</h2>
      <p className="audio-disclosure">{t.aiVoice}</p>
      {!supported ? <p>{t.unavailable}</p> : <>
        <p role={displayError ? 'alert' : 'status'}>{displayError ? t.audioError : !state ? t.checking : busy ? t.preparing : introduction ? t.introductionPending : t.audioPending}</p>
        {busy && <progress aria-label={t.preparing} value={state?.completedStops || 0} max={state?.totalStops || 1} />}
        {statusError ? <button onClick={() => setRefresh(value => value + 1)}>{t.retry}</button> : !introduction && state && state.canGenerate !== false && !busy && (state.status === 'idle' || state.status === 'failed') && <button onClick={() => void create()} disabled={submitting}>{state.status === 'failed' ? t.retry : t.prepare}</button>}
      </>}
    </section>}
  </>;
}
