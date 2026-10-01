import { analyticsAllowed, CONSENT_EVENT } from './consent';
import { measurementAttribution, recordMeasuredTourEvent } from './analyticsSession';

export type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): Promise<unknown> | unknown;
      getSession?(): { cache?: string; website?: string | null };
    };
  }
}

const TRACK_TIMEOUT_MS = 5000;
const LISTENING_INTERVAL_SECONDS = 15;

function isSSR(): boolean {
  return typeof window === 'undefined';
}

function isDNTEnabled(): boolean {
  if (isSSR()) return false;
  try {
    return navigator.doNotTrack === '1';
  } catch {
    return false;
  }
}

function isUmamiDisabled(): boolean {
  if (isSSR()) return false;
  try {
    const value = localStorage.getItem('umami.disabled');
    return value !== null && value !== '';
  } catch {
    return false;
  }
}

export async function trackEvent(name: string, data?: AnalyticsData): Promise<boolean> {
  return sendAnalytics(name, data);
}

export async function trackPageView(): Promise<boolean> {
  return sendAnalytics();
}

async function sendAnalytics(name?: string, data?: AnalyticsData): Promise<boolean> {
  if (isSSR()) return false;
  if (!analyticsAllowed()) return false;
  if (isDNTEnabled()) return false;
  if (isUmamiDisabled()) return false;

  const script = document.getElementById('umami-analytics') as HTMLScriptElement | null;
  if (!script) return false;

  const website = script.getAttribute('data-website-id');
  const src = script.getAttribute('src');
  if (!website || !src) return false;
  const attribution = measurementAttribution();

  let cache: string | undefined;
  try {
    const session = window.umami?.getSession?.();
    if (session && session.website === website && typeof session.cache === 'string' && session.cache) {
      cache = session.cache;
    }
  } catch {
    // ignore
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACK_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-umami-website-id': website,
      'x-umami-hostname': location.hostname,
    };
    if (cache) {
      headers['x-umami-cache'] = cache;
    }

    const response = await fetch(new URL('api/send', src), {
      method: 'POST',
      headers,
      credentials: 'omit',
      keepalive: true,
      signal: controller.signal,
      body: JSON.stringify({
        type: 'event',
        payload: {
          website,
          hostname: location.hostname,
          language: navigator.language,
          screen: screen.width + 'x' + screen.height,
          url: location.pathname,
          title: document.title,
          name,
          data: { ...data, ...attribution },
        },
      }),
    });
    if (!response.ok) return false;
    const parsed = await response.json();
    const delivered = typeof parsed?.cache === 'string' && parsed.cache.length > 0 && parsed.disabled !== true;
    if (delivered && recordMeasuredTourEvent(name, data)) {
      void sendAnalytics('tour_activated', { tour_id: data!.tour_id, language: data?.language ?? '' });
    }
    return delivered;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function attachAudioAnalytics(audio: HTMLAudioElement, data: AnalyticsData): () => void {
  let started = false;
  let disposed = false;
  let active = false;
  let seconds = 0;
  let lastPosition = 0;
  let lastNow = 0;
  let lastRate = 1;

  const baseline = () => {
    lastPosition = audio.currentTime;
    lastNow = performance.now();
    lastRate = Math.max(audio.playbackRate, 0) || 1;
  };

  const flush = () => {
    if (seconds >= 0.001) {
      const rounded = Math.round(seconds * 1000) / 1000;
      trackEvent('audio_listening', { ...data, seconds: rounded });
      seconds = 0;
    }
  };

  const sample = () => {
    if (disposed) return;

    const now = performance.now();
    const currentTime = audio.currentTime;

    if (!analyticsAllowed()) seconds = 0;
    if (analyticsAllowed() && active && !audio.seeking) {
      const delta = currentTime - lastPosition;
      if (delta > 0) {
        const elapsedWall = (now - lastNow) / 1000;
        const maxPossible = elapsedWall * lastRate;
        const capped = Math.min(delta, maxPossible);
        seconds += capped / lastRate;
      }
    }

    lastPosition = currentTime;
    lastNow = now;
  };

  const handlePlaying = () => {
    if (disposed) return;
    baseline();
    active = true;
    if (!started) {
      started = true;
      trackEvent('audio_started', data);
    }
  };

  const handlePause = () => {
    if (disposed) return;
    sample();
    active = false;
    flush();
  };

  const handleWaiting = () => {
    if (disposed) return;
    sample();
    active = false;
    flush();
  };

  const handleStalled = () => {
    if (disposed) return;
    sample();
    flush();
  };

  const handleSeeking = () => {
    if (disposed) return;
    active = false;
    baseline();
    flush();
  };

  const handleSeeked = () => {
    if (disposed) return;
    baseline();
    active = !audio.paused && !audio.ended && audio.readyState >= 3;
  };

  const handleRateChange = () => {
    if (disposed) return;
    sample();
    lastRate = Math.max(audio.playbackRate, 0) || 1;
    baseline();
  };

  const handleEnded = () => {
    if (disposed) return;
    sample();
    active = false;
    flush();
    trackEvent('audio_ended', data);
  };

  const handleError = () => {
    if (disposed) return;
    sample();
    active = false;
    flush();
    trackEvent('audio_error', data);
  };

  const handleTimeUpdate = () => {
    if (disposed) return;
    sample();
    if (seconds >= LISTENING_INTERVAL_SECONDS) {
      flush();
    }
  };

  const handlePageHide = () => {
    if (disposed) return;
    sample();
    flush();
  };

  const handleVisibilityChange = () => {
    if (disposed) return;
    if (document.visibilityState === 'hidden') {
      sample();
      flush();
    }
  };

  const resetConsent = () => { seconds = 0; baseline(); };

  const cleanup = () => {
    if (disposed) return;
    sample();
    flush();
    disposed = true;

    audio.removeEventListener('playing', handlePlaying);
    audio.removeEventListener('pause', handlePause);
    audio.removeEventListener('waiting', handleWaiting);
    audio.removeEventListener('stalled', handleStalled);
    audio.removeEventListener('seeking', handleSeeking);
    audio.removeEventListener('seeked', handleSeeked);
    audio.removeEventListener('ratechange', handleRateChange);
    audio.removeEventListener('ended', handleEnded);
    audio.removeEventListener('error', handleError);
    audio.removeEventListener('timeupdate', handleTimeUpdate);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener(CONSENT_EVENT, resetConsent);
    window.removeEventListener('storage', resetConsent);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };

  audio.addEventListener('playing', handlePlaying);
  audio.addEventListener('pause', handlePause);
  audio.addEventListener('waiting', handleWaiting);
  audio.addEventListener('stalled', handleStalled);
  audio.addEventListener('seeking', handleSeeking);
  audio.addEventListener('seeked', handleSeeked);
  audio.addEventListener('ratechange', handleRateChange);
  audio.addEventListener('ended', handleEnded);
  audio.addEventListener('error', handleError);
  audio.addEventListener('timeupdate', handleTimeUpdate);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener(CONSENT_EVENT, resetConsent);
  window.addEventListener('storage', resetConsent);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return cleanup;
}
