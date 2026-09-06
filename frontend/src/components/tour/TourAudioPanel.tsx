'use client';

import { useEffect, useRef, useState } from 'react';
import { createTourAudio, getTourAudio, TourAudioState } from '@/lib/tourAudio';
import { AudioPlayer } from './AudioPlayer';

interface Props {
  tourId: string;
  language: string;
  currentPlaceId: string;
  currentPlaceName: string;
}

export function TourAudioPanel({ tourId, language, currentPlaceId, currentPlaceName }: Props) {
  const [state, setState] = useState<TourAudioState | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(false);
  const mayBeRunning = useRef(false);
  const supported = language === 'es' || language === 'fr';

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
        setStatusError(null);
        if (next.status === 'queued' || next.status === 'running' || next.status === 'completed') {
          setActionError(null);
        }
        mayBeRunning.current = next.status === 'queued' || next.status === 'running';
        if (mayBeRunning.current) timer = setTimeout(poll, 15000);
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
    if (submitting || mayBeRunning.current) return;
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
  const completed = state?.status === 'completed';
  const audioUrl = state?.audioUrls[currentPlaceId];
  const message = state?.phase === 'restoring' || (state?.phase === 'failed' && busy)
    ? 'Finishing your audio'
    : state?.phase === 'generating'
      ? 'Recording stop ' + Math.min(state.completedStops + 1, state.totalStops) + ' of ' + state.totalStops
      : 'Preparing your audio';
  const displayError = statusError || actionError || state?.error?.message;
  const buttonClass = 'rounded-xl bg-darkBrown px-5 py-3 text-sm font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mutedGold disabled:cursor-wait disabled:opacity-60';

  return (
    <section aria-labelledby="tour-audio-heading" className="rounded-2xl border border-mutedGold/30 bg-surface-elevated p-5 shadow-sm sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-mutedGold">Audio guide</p>
      <h2 id="tour-audio-heading" className="mt-2 font-serif text-2xl font-semibold text-darkBrown">
        {completed ? 'Your audio guide is ready' : 'Listen to your tour'}
      </h2>
      {!supported ? (
        <p className="mt-3 text-sm text-darkBrown/70">Audio is available for Spanish and French tours.</p>
      ) : (
        <>
          {!busy && !completed && (
            <p className="mt-3 text-sm leading-relaxed text-darkBrown/70">
              Your route is ready. Add a calm, natural narration for every stop.
            </p>
          )}
          {busy && (
            <div role="status" aria-live="polite" className="mt-4 space-y-3">
              <p className="text-sm font-medium text-darkBrown">{message}</p>
              <progress aria-label="Stops recorded" className="h-2 w-full accent-mutedGold" value={state?.completedStops || 0} max={state?.totalStops || 1} />
              <p className="text-xs text-darkBrown/65">
                {state ? state.completedStops + ' of ' + state.totalStops + ' stops recorded. ' : ''}
                You can keep reading while your audio is prepared.
              </p>
            </div>
          )}
          {displayError && <p role="alert" className="mt-4 text-sm text-red-800">{displayError}</p>}
          {audioUrl && (
            <div className="mt-5">
              <AudioPlayer key={currentPlaceId + audioUrl} audioUrl={audioUrl} title={currentPlaceName} />
            </div>
          )}
          {!completed && state && (submitting || !busy) && (
            <button type="button" onClick={() => void create()} disabled={submitting} className={'mt-5 w-full sm:w-auto ' + buttonClass}>
              {submitting ? 'Starting audio…' : state.status === 'failed' ? 'Try audio again' : 'Create tour audio'}
            </button>
          )}
          {statusError && !submitting && (
            <button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-4 block text-sm font-medium text-darkBrown underline underline-offset-4 focus-visible:outline focus-visible:outline-2">
              Check audio status
            </button>
          )}
          {!state && !statusError && !actionError && !submitting && <p role="status" className="mt-4 text-sm text-darkBrown/65">Checking your audio…</p>}
        </>
      )}
    </section>
  );
}
