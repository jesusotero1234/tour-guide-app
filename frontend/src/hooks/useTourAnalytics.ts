'use client';

import { useEffect } from 'react';
import { analyticsAllowed, CONSENT_EVENT } from '@/lib/consent';
import { trackEvent } from '@/lib/analytics';

/**
 * The analytics of a walk, moved out of the listening component (plan 06 D10). The events, their names and their data are exactly the ones
 * the component sent before: tour_started, stop_viewed and reading_active. test-analytics*.cjs validates them.
 */
export interface TourAnalyticsState {
  started: boolean | null;
  tourId: string;
  language: string;
  placeId: string | undefined;
  view: string;
  isIntroduction: boolean;
}

/** `tour_started`: once per visit, as soon as analytics are allowed and the tour has been started. */
export function useTourStartedEvent({ started, tourId, language }: Pick<TourAnalyticsState, 'started' | 'tourId' | 'language'>) {
  useEffect(() => {
    if (started !== true) return;
    let sent = false;
    let sending = false;
    const send = () => {
      if (sent || sending || !analyticsAllowed()) return;
      sending = true;
      void trackEvent('tour_started', { tour_id: tourId, language: language }).then(delivered => {
        sent = delivered;
        sending = false;
      });
    };
    const consentChanged = () => { if (!analyticsAllowed()) sent = false; else send(); };
    if (document.getElementById('umami-analytics')) send();
    window.addEventListener('umami-ready', send);
    window.addEventListener(CONSENT_EVENT, consentChanged);
    return () => {
      window.removeEventListener('umami-ready', send);
      window.removeEventListener(CONSENT_EVENT, consentChanged);
    };
  }, [started, tourId, language]);
}

/** `stop_viewed`: once for each stop the visitor opens. */
export function useStopViewedEvent({ started, tourId, language, placeId, view, isIntroduction }: TourAnalyticsState) {
  useEffect(() => {
    if (!started || !placeId || isIntroduction) return;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      trackEvent('stop_viewed', { tour_id: tourId, place_id: placeId, language: language, view });
    };
    const script = document.getElementById('umami-analytics');
    if (script) {
      send();
    } else {
      const handler = () => send();
      window.addEventListener('umami-ready', handler);
      return () => window.removeEventListener('umami-ready', handler);
    }
  }, [started, tourId, language, placeId, view, isIntroduction]);
}

/** `reading_active`: seconds of active reading of a stop, counted only while the page is visible and the visitor is doing something. */
export function useReadingAnalytics({ started, tourId, language, placeId, view, isIntroduction }: TourAnalyticsState) {
  useEffect(() => {
    if (!started || !placeId || isIntroduction || view !== 'story') return;
    let lastActivity = performance.now();
    let baseline = performance.now();
    let accumulated = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const isActive = () => analyticsAllowed() && document.visibilityState === 'visible' && performance.now() - lastActivity <= 60000;
    const flush = () => {
      if (accumulated >= 0.001) {
        const seconds = Math.round(accumulated * 1000) / 1000;
        trackEvent('reading_active', { tour_id: tourId, place_id: placeId, language: language, seconds });
        accumulated = 0;
      }
    };
    const sample = () => {
      const now = performance.now();
      if (isActive()) {
        const elapsed = (now - baseline) / 1000;
        if (elapsed > 0) {
          accumulated += Math.min(elapsed, 1);
          if (accumulated >= 15) {
            flush();
          }
        }
      }
      baseline = now;
    };
    const onActivity = () => {
      sample();
      lastActivity = performance.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        baseline = performance.now();
      }
    };
    const onPageHide = () => {
      sample();
      flush();
    };
    const resetConsent = () => { accumulated = 0; baseline = performance.now(); };
    window.addEventListener(CONSENT_EVENT, resetConsent);
    window.addEventListener('storage', resetConsent);
    timer = setInterval(sample, 1000);
    document.addEventListener('pointerdown', onActivity, { capture: true });
    document.addEventListener('keydown', onActivity, { capture: true });
    document.addEventListener('scroll', onActivity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener(CONSENT_EVENT, resetConsent);
      window.removeEventListener('storage', resetConsent);
      if (timer) clearInterval(timer);
      sample();
      flush();
      document.removeEventListener('pointerdown', onActivity, { capture: true });
      document.removeEventListener('keydown', onActivity, { capture: true });
      document.removeEventListener('scroll', onActivity, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [started, placeId, view, tourId, language, isIntroduction]);
}
