'use client';

import { useEffect, useRef, useState } from 'react';
import { ListeningProgress, readListeningProgress, saveListeningProgress } from '@/lib/tourProgress';
import { listeningCopy } from './listeningCopy';
import { attachAudioAnalytics } from '@/lib/analytics';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  compact?: boolean;
  language?: string;
  progressKey?: string;
  tourId?: string;
  placeId?: string;
  onProgress?: (progress: ListeningProgress) => void;
  onError?: (error: string) => void;
  onPlaybackStateChange?: (state: { isPlaying: boolean; isLoading: boolean; currentTime: number; duration: number }) => void;
}

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function AudioPlayer({ audioUrl, title, compact = false, language = 'en', progressKey, tourId, placeId, onProgress, onError, onPlaybackStateChange }: AudioPlayerProps) {
  const t = listeningCopy(language);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callbacks = useRef({ onProgress, onError, onPlaybackStateChange });
  const [state, setState] = useState({ isPlaying: false, isLoading: true, currentTime: 0, duration: 0 });
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callbacks.current = { onProgress, onError, onPlaybackStateChange }; }, [onProgress, onError, onPlaybackStateChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !tourId || !placeId) return;
    const detach = attachAudioAnalytics(audio, { tour_id: tourId, place_id: placeId, language });
    return detach;
  }, [tourId, placeId, language, audioUrl, attempt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let disposed = false;
    let ready = false;
    let loading = true;
    let lastSave = 0;
    let progress = progressKey ? readListeningProgress(progressKey) : { position: 0, duration: 0, completed: false };
    const savedPosition = progress.position;
    setError(false);
    setState({ isPlaying: false, isLoading: true, currentTime: savedPosition, duration: progress.duration });

    const save = () => { if (progressKey) saveListeningProgress(progressKey, progress); };
    const sync = (persist = false) => {
      if (disposed) return;
      if (ready) progress = { ...progress, position: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 };
      const next = { isPlaying: !audio.paused && !audio.ended, isLoading: loading, currentTime: progress.position, duration: progress.duration };
      setState(next);
      callbacks.current.onPlaybackStateChange?.(next);
      callbacks.current.onProgress?.(progress);
      if (persist || Date.now() - lastSave > 1000) { save(); lastSave = Date.now(); }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = next.isPlaying ? 'playing' : 'paused';
        try {
          if (progress.duration > 0) navigator.mediaSession.setPositionState?.({ duration: progress.duration, position: Math.min(progress.position, progress.duration), playbackRate: audio.playbackRate });
        } catch { /* Some browsers expose Media Session without position support. */ }
      }
    };
    const metadata = () => {
      ready = true;
      audio.currentTime = Math.min(savedPosition, Number.isFinite(audio.duration) ? audio.duration : savedPosition);
      sync();
    };
    const updated = () => sync();
    const paused = () => sync(true);
    const waiting = () => { loading = true; sync(); };
    const available = () => { loading = false; sync(); };
    const ended = () => { progress.completed = true; loading = false; sync(true); };
    const failed = () => { loading = false; setError(true); callbacks.current.onError?.('Audio unavailable'); sync(true); };
    const background = () => { if (document.visibilityState === 'hidden') sync(true); };
    const events = { loadedmetadata: metadata, timeupdate: updated, play: updated, pause: paused, waiting, canplay: available, ended, error: failed, seeked: paused };
    Object.entries(events).forEach(([name, handler]) => audio.addEventListener(name, handler));
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', paused);
    audio.src = audioUrl;
    audio.load();
    return () => {
      sync(true);
      disposed = true;
      Object.entries(events).forEach(([name, handler]) => audio.removeEventListener(name, handler));
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', paused);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [audioUrl, progressKey, attempt]);

  const play = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(false);
    if (audio.ended) audio.currentTime = 0;
    void audio.play().catch(() => { if (audio.isConnected && audio.getAttribute('src')) setError(true); });
  };
  const seek = (position: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(position, audio.duration));
  };
  const controls = useRef({ play, seek });
  useEffect(() => { controls.current = { play, seek }; });
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (typeof MediaMetadata !== 'undefined') session.metadata = new MediaMetadata({ title: title || '' });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => controls.current.play(),
      pause: () => audioRef.current?.pause(),
      seekbackward: (event) => controls.current.seek((audioRef.current?.currentTime || 0) - (event.seekOffset || 15)),
      seekforward: (event) => controls.current.seek((audioRef.current?.currentTime || 0) + (event.seekOffset || 15)),
      seekto: (event) => { if (event.seekTime !== undefined) controls.current.seek(event.seekTime); },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { session.setActionHandler(action as MediaSessionAction, handler); } catch { /* Optional action. */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { session.setActionHandler(action as MediaSessionAction, null); } catch { /* Optional action. */ }
      }
      session.metadata = null;
      session.playbackState = 'none';
    };
  }, [title, audioUrl]);

  return (
    <div className={`listening-player${compact ? ' compact' : ''}`} data-testid="audio-player">
      <audio ref={audioRef} preload="metadata" data-testid="tour-audio" />
      <div className="player-title">{title}</div>
      <input className="player-progress" type="range" aria-label={t.seek} min={0} max={state.duration || 1} step="0.1" value={Math.min(state.currentTime, state.duration || 1)} disabled={!state.duration} onChange={(event) => seek(Number(event.target.value))} />
      {!compact && <div className="player-times"><span>{time(state.currentTime)}</span><span>{state.duration ? time(state.duration) : '—'}</span></div>}
      <div className="player-controls">
        {!compact && <button className="player-skip" aria-label={t.rewind} disabled={!state.duration} onClick={() => seek((audioRef.current?.currentTime || 0) - 15)}>↶ <span>15</span></button>}
        <button type="button" className="player-play" aria-label={state.isPlaying ? t.pause : t.play} onClick={() => audioRef.current?.paused ? play() : audioRef.current?.pause()}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            {state.isPlaying ? <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></> : <path d="M8 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 8 4.5Z" />}
          </svg>
        </button>
        {!compact && <button className="player-skip" aria-label={t.forward} disabled={!state.duration} onClick={() => seek((audioRef.current?.currentTime || 0) + 15)}><span>15</span> ↷</button>}
      </div>
      {error ? <div className="player-error" role="alert">{t.audioError} <button onClick={() => setAttempt(value => value + 1)}>{t.retry}</button></div> : state.isLoading && <p className="player-status" role="status">{t.loadingAudio}</p>}
    </div>
  );
}
