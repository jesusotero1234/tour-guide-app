import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  onError?: (error: string) => void;
  onPlaybackStateChange?: (state: { isPlaying: boolean; isLoading: boolean; currentTime: number; duration: number }) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, title, onError, onPlaybackStateChange }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Stable ref for onError so the audio useEffect doesn't re-run every render
  // when the parent passes an inline function.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    onPlaybackStateChange?.({ isPlaying, isLoading, currentTime, duration });
  }, [isPlaying, isLoading, currentTime, duration, onPlaybackStateChange]);

  const getMediaErrorLabel = (code?: number) => {
    switch (code) {
      case 1:
        return 'MEDIA_ERR_ABORTED';
      case 2:
        return 'MEDIA_ERR_NETWORK';
      case 3:
        return 'MEDIA_ERR_DECODE';
      case 4:
        return 'MEDIA_ERR_SRC_NOT_SUPPORTED';
      default:
        return 'MEDIA_ERR_UNKNOWN';
    }
  };
  
  // Initialize audio element
  useEffect(() => {
    if (!audioUrl) {
      if (onErrorRef.current) onErrorRef.current('No audio URL provided');
      setIsLoading(false);
      return;
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Setup event listeners
    const setAudioData = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    
    const setAudioTime = () => {
      setCurrentTime(audio.currentTime);
    };
    
    const handleAudioEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    
    const handleAudioError = () => {
      const mediaError = audio.error;
      const errorLabel = getMediaErrorLabel(mediaError?.code);

      // Use console.warn — console.error is intercepted by Next.js dev overlay
      // and shown as a full-page crash even for recoverable media errors.
      console.warn('AudioPlayer load failed:', {
        audioUrl,
        currentSrc: audio.currentSrc,
        code: mediaError?.code,
        error: errorLabel,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });

      setIsLoading(false);
      if (onErrorRef.current) onErrorRef.current(`Failed to load audio: ${errorLabel}`);
    };
    
    // Add event listeners
    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleAudioEnd);
    audio.addEventListener('error', handleAudioError);
    
    // Cleanup function
    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleAudioEnd);
      audio.removeEventListener('error', handleAudioError);
      
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]); // onError intentionally excluded — stable via onErrorRef
  
  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(error => {
          console.warn('Error playing audio:', error);
          if (onErrorRef.current) onErrorRef.current(`Failed to play audio: ${error.message}`);
        });
    }
  }, [isPlaying]);
  
  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    
    const seekTime = Number(e.target.value);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };
  
  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    
    const newVolume = Number(e.target.value);
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
  };
  
  // Handle playback rate change
  const handlePlaybackRateChange = (rate: number) => {
    if (!audioRef.current) return;
    
    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const jumpBy = useCallback((seconds: number) => {
    if (!audioRef.current) return;

    const nextTime = Math.min(Math.max(audioRef.current.currentTime + seconds, 0), duration || 0);
    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration]);
  
  // Format time to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mt-4 w-full rounded-xl border border-darkBrown/15 bg-surface p-4 shadow-sm">
      {title && <div className="mb-2 text-sm font-medium text-darkBrown">{title}</div>}
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-darkBrown/10 bg-surface-elevated px-3 py-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-mutedGold">
            Tour mode
          </p>
          <p className="text-sm text-darkBrown/75">
            {isPlaying ? 'Narration is playing while you walk.' : 'Press play when you reach this stop.'}
          </p>
        </div>
        <div className="rounded-full border border-darkBrown/15 bg-surface px-2.5 py-1 text-xs font-medium text-darkBrown">
          Speed {playbackRate}x
        </div>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center">
          <span className="w-10 text-xs text-darkBrown">{formatTime(currentTime)}</span>
          <div className="mx-2 flex-grow">
            <div className="relative h-1.5 w-full rounded-full bg-darkBrown/15 focus-within:ring-2 focus-within:ring-accent/50 focus-within:ring-offset-2 focus-within:ring-offset-surface">
              <div
                className="absolute left-0 top-0 h-1.5 rounded-full bg-mutedGold"
                style={{ width: `${Math.min((currentTime / (duration || 1)) * 100, 100)}%` }}
              ></div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                disabled={isLoading}
                className="absolute left-0 top-0 h-1.5 w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
          <span className="w-10 text-xs text-darkBrown">{formatTime(duration)}</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => jumpBy(-10)}
              disabled={isLoading}
              className="rounded-full border border-darkBrown/15 bg-surface-elevated px-3 py-2 text-xs font-medium text-darkBrown transition-colors hover:bg-surface disabled:opacity-50"
              aria-label="Go back 10 seconds"
            >
              −10s
            </button>
          </div>

          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={`mx-auto inline-flex min-h-16 min-w-16 items-center justify-center rounded-full px-5 text-surface shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${isLoading ? 'bg-darkBrown/35' : 'bg-darkBrown hover:bg-darkBrown/90'}`}
            aria-label={isPlaying ? 'Pause audio narration' : 'Play audio narration'}
          >
            {isLoading ? (
              <svg className="h-7 w-7 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => jumpBy(10)}
              disabled={isLoading}
              className="rounded-full border border-darkBrown/15 bg-surface-elevated px-3 py-2 text-xs font-medium text-darkBrown transition-colors hover:bg-surface disabled:opacity-50"
              aria-label="Go forward 10 seconds"
            >
              +10s
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="hidden items-center space-x-1 sm:flex">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-darkBrown" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <div className="relative h-1 w-16 rounded-full bg-darkBrown/15 focus-within:ring-2 focus-within:ring-accent/50 focus-within:ring-offset-2 focus-within:ring-offset-surface">
              <div 
                className="absolute top-0 left-0 h-1 rounded-full bg-mutedGold" 
                style={{ width: `${volume * 100}%` }}
              ></div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                className="absolute top-0 left-0 h-1 w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-darkBrown/55 sm:hidden">
              Speed
            </span>
            <select
              value={playbackRate}
              onChange={(e) => handlePlaybackRateChange(Number(e.target.value))}
              className="rounded-full border border-darkBrown/20 bg-surface px-3 py-1.5 text-xs text-darkBrown focus:outline-none focus:ring-2 focus:ring-accent/60"
              aria-label="Playback speed"
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
