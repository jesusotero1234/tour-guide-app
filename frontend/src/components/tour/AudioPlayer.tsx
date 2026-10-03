'use client';

import { listeningCopy } from './listeningCopy';
import { mobileTourCopy } from '@/lib/mobileTourCopy';
import { supportedLanguage } from '@/lib/browseCopy';
import { nextRate, type TourAudioEngine } from '@/hooks/useTourAudioEngine';
import { SkipBackIcon, SkipForwardIcon } from './icons';

interface AudioPlayerProps {
  /** The persistent engine of the walk: it owns the <audio> element, the position, the link clips and the lock-screen controls. */
  engine: TourAudioEngine;
  title?: string;
  compact?: boolean;
  language?: string;
}

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Presentation only. During a link clip it shows what the clip says instead of the times. */
export function AudioPlayer({ engine, title, compact = false, language = 'en' }: AudioPlayerProps) {
  const t = listeningCopy(language);
  const mobile = mobileTourCopy(supportedLanguage(language) || 'en');
  const { state } = engine;
  const link = state.kind === 'cue';
  return (
    <div className={`listening-player${compact ? ' compact' : ''}`} data-testid="audio-player" data-segment-kind={state.kind}>
      <div className="player-title">{title}</div>
      <input className="player-progress" type="range" aria-label={t.seek} min={0} max={state.duration || 1} step="0.1" value={Math.min(state.currentTime, state.duration || 1)} disabled={!state.duration} onChange={event => engine.seek(Number(event.target.value))} />
      {link && state.cueText ? <p className="player-link" role="status">{state.cueText}</p> : !compact && <div className="player-times"><span>{time(state.currentTime)}</span><button type="button" className="rate-chip" aria-label={`${mobile.speed}: ${state.rate}×`} onClick={() => engine.setRate(nextRate(state.rate))}>{state.rate}×</button><span>{state.duration ? time(state.duration) : '—'}</span></div>}
      <div className="player-controls">
        {compact && <button type="button" className="rate-chip" aria-label={`${mobile.speed}: ${state.rate}×`} onClick={() => engine.setRate(nextRate(state.rate))}>{state.rate}×</button>}
        {!compact && <button className="player-skip" aria-label={t.rewind} disabled={!state.duration} onClick={() => engine.seek((engine.audioRef.current?.currentTime || 0) - 15)}><SkipBackIcon /></button>}
        <button type="button" className="player-play" aria-label={state.isPlaying ? t.pause : t.play} onClick={() => (engine.audioRef.current?.paused ? engine.play() : engine.pause())}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            {state.isPlaying ? <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></> : <path d="M8 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 8 4.5Z" />}
          </svg>
        </button>
        {!compact && <button className="player-skip" aria-label={t.forward} disabled={!state.duration} onClick={() => engine.seek((engine.audioRef.current?.currentTime || 0) + 15)}><SkipForwardIcon /></button>}
      </div>
      {state.error ? <div className="player-error" role="alert">{t.audioError} <button onClick={() => engine.retry()}>{t.retry}</button></div> : state.isLoading && !link && <p className="player-status" role="status">{t.loadingAudio}</p>}
    </div>
  );
}
