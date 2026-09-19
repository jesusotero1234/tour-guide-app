export const CONSENT_KEY = 'tour-privacy-v1';
export const CONSENT_EVENT = 'tour-privacy-change';
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
type Consent = { version: 1; analytics: boolean; savedAt: number };
let memory: Consent | null = null;
let memoryOnly = false;

export function readConsent(): Consent | null {
  if (typeof window === 'undefined') return null;
  let value: Consent | null = memory;
  if (!memoryOnly) {
    let stored: string | null;
    try { stored = localStorage.getItem(CONSENT_KEY); }
    catch { stored = null; }
    try { value = JSON.parse(stored || 'null'); }
    catch { return null; }
  }
  if (value?.version !== 1 || typeof value.analytics !== 'boolean' ||
      !Number.isFinite(value.savedAt) || value.savedAt > Date.now() ||
      Date.now() - value.savedAt >= CONSENT_MAX_AGE) return null;
  return value;
}

export function saveConsent(analytics: boolean): void {
  memory = { version: 1, analytics, savedAt: Date.now() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(memory)); memoryOnly = false; }
  catch { memoryOnly = true; }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function analyticsAllowed(): boolean {
  if (memoryOnly || !readConsent()?.analytics) return false;
  try { return navigator.doNotTrack !== '1' && !localStorage.getItem('umami.disabled'); }
  catch { return false; }
}
