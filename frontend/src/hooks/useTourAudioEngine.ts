'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ListeningProgress, readListeningProgress, saveListeningProgress } from '@/lib/tourProgress';
import { attachAudioAnalytics } from '@/lib/analytics';

/**
 * One persistent <audio> for the whole walk (plan 05 section 5.3). Remounting a player per stop clears the Media Session and breaks
 * `nexttrack` from the lock screen; chaining a link clip after a body needs the SAME element (iOS only lets an element that a
 * user gesture started keep playing without a new gesture). A segment is either a `body` (a stop or the introduction: it restores
 * and saves the position, marks `completed`, counts as listening) or a `cue` (the short link clip: no position, no progress, no
 * listening analytics, and a failure is ignored).
 */
export interface EngineSegment {
  kind: 'body' | 'cue';
  url: string;
  title: string;
  /** Only bodies. */
  progressKey?: string;
  /** Analytics labels of a body: place_id, or segment: 'introduction'. */
  analytics?: Record<string, string>;
}

export interface EngineState {
  kind: 'none' | 'body' | 'cue';
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  /** The body failed to load. A failed link clip never sets this. */
  error: boolean;
  rate: number;
  /** What the link clip says, while it plays. */
  cueText?: string;
}

export interface EngineOptions {
  tourId: string;
  language: string;
  /** Called with the body's progress only. */
  onProgress?: (progress: ListeningProgress) => void;
  /** The link clip to play right after the current body ends, if any. */
  cueAfterBody?: () => EngineSegment | null;
  onNext?: () => void;
  onPrevious?: () => void;
  /** Lock-screen metadata. */
  media?: { title: string; artist?: string; album?: string; artwork?: string };
}

const RATES = [1, 1.25, 1.5, 2];
const INITIAL: EngineState = { kind: 'none', isPlaying: false, isLoading: false, currentTime: 0, duration: 0, error: false, rate: 1 };

export function nextRate(rate: number) { return RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1; }

/** The speed is a preference of the person, not of a stop: it is kept and applied to every file that loads (plan 06 A4). */
export const RATE_KEY = 'tour-playback-rate:v1';
export function readRate(): number {
  try { const value = Number(localStorage.getItem(RATE_KEY)); return RATES.includes(value) ? value : 1; } catch { return 1; }
}

export function useTourAudioEngine(options: EngineOptions) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const rateRef = useRef(1);
  useEffect(() => { const saved = readRate(); rateRef.current = saved; setState(previous => ({ ...previous, rate: saved })); }, []);
  const [request, setRequest] = useState<{ segment: EngineSegment | null; autoplay: boolean; nonce: number }>({ segment: null, autoplay: false, nonce: 0 });
  const [state, setState] = useState<EngineState>(INITIAL);
  const bodyRef = useRef<EngineSegment | null>(null);

  const load = useCallback((segment: EngineSegment | null, loadOptions: { autoplay?: boolean } = {}) => {
    if (segment?.kind === 'body') bodyRef.current = segment;
    setRequest(previous => ({ segment, autoplay: !!loadOptions.autoplay, nonce: previous.nonce + 1 }));
  }, []);
  const retry = useCallback(() => setRequest(previous => ({ ...previous, nonce: previous.nonce + 1 })), []);

  // The segment currently loaded. The effect re-runs only when the file or its progress key changes (or on retry), not on every render.
  // A layout effect, so that the previous file is gone (and its duration with it) before the browser paints or a test polls.
  const url = request.segment?.url, progressKey = request.segment?.progressKey;
  useLayoutEffect(() => {
    const audio = audioRef.current;
    const segment = request.segment;
    if (!audio) return;
    if (!segment) {
      audio.pause(); audio.removeAttribute('src'); audio.load();
      setState(previous => ({ ...INITIAL, rate: previous.rate }));
      return;
    }
    const isBody = segment.kind === 'body';
    let disposed = false, ready = false, loading = true, lastSave = 0;
    let progress: ListeningProgress = isBody && segment.progressKey ? readListeningProgress(segment.progressKey) : { position: 0, duration: 0, completed: false };
    const savedPosition = progress.position;
    setState(previous => ({ kind: segment.kind, isPlaying: false, isLoading: true, currentTime: isBody ? savedPosition : 0, duration: isBody ? progress.duration : 0, error: false, rate: previous.rate, cueText: isBody ? undefined : segment.title }));
    const detachAnalytics = isBody && options.tourId && segment.analytics ? attachAudioAnalytics(audio, { tour_id: options.tourId, language: options.language, ...segment.analytics }) : undefined;

    const save = () => { if (isBody && segment.progressKey) saveListeningProgress(segment.progressKey, progress); };
    const sync = (persist = false) => {
      if (disposed) return;
      if (ready) progress = { ...progress, position: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 };
      const playing = !audio.paused && !audio.ended;
      setState(previous => ({ ...previous, isPlaying: playing, isLoading: loading, currentTime: progress.position, duration: progress.duration }));
      if (isBody) {
        latest.current.onProgress?.(progress);
        if (persist || Date.now() - lastSave > 1000) { save(); lastSave = Date.now(); }
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        try {
          if (isBody && progress.duration > 0) navigator.mediaSession.setPositionState?.({ duration: progress.duration, position: Math.min(progress.position, progress.duration), playbackRate: audio.playbackRate });
        } catch { /* Some browsers expose Media Session without position support. */ }
      }
    };
    const applyRate = () => { audio.defaultPlaybackRate = rateRef.current; audio.playbackRate = rateRef.current; };
    const metadata = () => {
      ready = true;
      applyRate();
      if (isBody) audio.currentTime = Math.min(savedPosition, Number.isFinite(audio.duration) ? audio.duration : savedPosition);
      sync();
    };
    const updated = () => sync();
    const paused = () => sync(true);
    const waiting = () => { loading = true; sync(); };
    const available = () => { loading = false; sync(); };
    const ended = () => {
      loading = false;
      if (isBody) {
        progress.completed = true;
        sync(true);
        // The link clip goes on the same element, so playback carries on without a new gesture.
        const cue = latest.current.cueAfterBody?.();
        if (cue) load(cue, { autoplay: true });
      } else sync(true);
    };
    const failed = () => {
      loading = false;
      if (isBody) { setState(previous => ({ ...previous, error: true })); sync(true); }
      else setState(previous => ({ ...previous, kind: 'none', isPlaying: false, isLoading: false, cueText: undefined }));   // a link clip that fails is skipped without a word
    };
    const background = () => { if (document.visibilityState === 'hidden') sync(true); };
    const events: Record<string, () => void> = { loadedmetadata: metadata, timeupdate: updated, play: updated, pause: paused, waiting, canplay: available, ended, error: failed, seeked: paused, ratechange: updated };
    Object.entries(events).forEach(([name, handler]) => audio.addEventListener(name, handler));
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', paused);
    audio.src = segment.url;
    applyRate();               // Loading another file resets the rate to the default, so both are set (plan 06 A4)
    audio.load();
    if (request.autoplay) void audio.play().catch(() => { /* The browser refused to start without a gesture: the play button is there. */ });
    return () => {
      sync(true);
      disposed = true;
      Object.entries(events).forEach(([name, handler]) => audio.removeEventListener(name, handler));
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', paused);
      detachAnalytics?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, progressKey, request.nonce, request.segment?.kind]);

  // On leaving the walk the element stops; moving between segments never does this.
  useEffect(() => {
    const audio = audioRef.current;
    return () => { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } };
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setState(previous => ({ ...previous, error: false }));
    // After the link clip ended, play restarts the stop it followed instead of repeating the clip.
    if (audio.ended && bodyRef.current && state.kind === 'cue') {
      const key = bodyRef.current.progressKey;
      if (key) saveListeningProgress(key, { ...readListeningProgress(key), position: 0 });   // a finished stop plays again from its start
      load(bodyRef.current, { autoplay: true });
      return;
    }
    if (audio.ended) audio.currentTime = 0;
    void audio.play().catch(() => { if (audio.isConnected && audio.getAttribute('src')) setState(previous => ({ ...previous, error: previous.kind !== 'cue' })); });
  }, [load, state.kind]);
  const pause = useCallback(() => { audioRef.current?.pause(); }, []);
  const seek = useCallback((position: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(position, audio.duration));
  }, []);
  const setRate = useCallback((rate: number) => {
    rateRef.current = rate;
    try { localStorage.setItem(RATE_KEY, String(rate)); } catch { /* The speed is a convenience. */ }
    const audio = audioRef.current;
    if (audio) { audio.defaultPlaybackRate = rate; audio.playbackRate = rate; }
    setState(previous => ({ ...previous, rate }));
  }, []);

  // Media Session: registered once for the walk and cleared when it ends, not per stop.
  const controls = useRef({ play, pause, seek });
  useEffect(() => { controls.current = { play, pause, seek }; });
  const hasNext = !!options.onNext, hasPrevious = !!options.onPrevious;
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const current = () => audioRef.current?.currentTime || 0;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {
      play: () => controls.current.play(),
      pause: () => controls.current.pause(),
      seekbackward: event => controls.current.seek(current() - (event.seekOffset || 15)),
      seekforward: event => controls.current.seek(current() + (event.seekOffset || 15)),
      seekto: event => { if (event.seekTime !== undefined) controls.current.seek(event.seekTime); },
      nexttrack: hasNext ? () => latest.current.onNext?.() : null,
      // Under five seconds go to the previous stop; later, back to the start of this one (what a player does).
      previoustrack: hasPrevious ? () => { if (current() < 5 || !bodyRef.current) latest.current.onPrevious?.(); else controls.current.seek(0); } : null,
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { session.setActionHandler(action as MediaSessionAction, handler ?? null); } catch { /* Optional action. */ }
    }
  }, [hasNext, hasPrevious]);
  useEffect(() => () => {
    if (!('mediaSession' in navigator)) return;
    for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'nexttrack', 'previoustrack'] as MediaSessionAction[]) {
      try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Optional action. */ }
    }
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  }, []);
  const media = options.media;
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = media ? new MediaMetadata({ title: media.title, artist: media.artist ?? '', album: media.album ?? '',
      ...(media.artwork ? { artwork: [{ src: media.artwork, sizes: '512x512', type: 'image/jpeg' }] } : {}) }) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.title, media?.artist, media?.album, media?.artwork]);

  return { audioRef, state, load, play, pause, seek, setRate, retry };
}

export type TourAudioEngine = ReturnType<typeof useTourAudioEngine>;
