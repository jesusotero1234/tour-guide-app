import { analyticsAllowed, CONSENT_EVENT } from './consent';
import { isSeoPagePath } from './seoInventory';

const SESSION_KEY = 'nomuvia-measurement-session-v1';
const MAX_IDLE_MS = 30 * 60 * 1000;
type Attribution = { acquisition_source: string; acquisition_medium: string; acquisition_campaign?: string; entry_page: string };
type Progress = { started: boolean; seconds: number; activated: boolean };
type Session = { version: 1; lastSeen: number; attribution: Attribution; tours: Record<string, Progress> };
let memory: Session | null = null;

function clearSession() {
  memory = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be unavailable. */ }
}

if (typeof window !== 'undefined') {
  const consentChanged = () => { if (!analyticsAllowed()) clearSession(); };
  window.addEventListener(CONSENT_EVENT, consentChanged);
  window.addEventListener('storage', consentChanged);
}

function acquisition(): Attribution {
  const page = location.pathname;
  const entry_page = isSeoPagePath(page)
    || /^\/tours(?:\/[0-9a-f-]{36})?$/.test(page) ? page : 'other';
  let acquisition_source = 'direct', acquisition_medium = 'none';
  try {
    const host = new URL(document.referrer).hostname.toLowerCase();
    if (/^(?:www\.)?google\.(?:com|es|co\.uk|fr|de|it)$/.test(host)) acquisition_source = 'google';
    else if (host === 'www.bing.com' || host === 'bing.com') acquisition_source = 'bing';
    else if (host === 'duckduckgo.com' || host === 'www.duckduckgo.com') acquisition_source = 'duckduckgo';
    else if (host !== location.hostname) acquisition_source = 'referral';
    acquisition_medium = ['google', 'bing', 'duckduckgo'].includes(acquisition_source) ? 'organic' : acquisition_source === 'referral' ? 'referral' : 'none';
  } catch { /* Direct entry has no referrer. */ }
  // Only campaign codes used by Nomuvia are accepted. Never retain arbitrary query values.
  const params = new URLSearchParams(location.search);
  const source = params.get('utm_source') || '';
  const medium = params.get('utm_medium') || '';
  if (['hotel', 'hostel', 'community', 'social', 'newsletter'].includes(source)
    && ['qr', 'referral', 'social', 'email'].includes(medium)) {
    acquisition_source = source;
    acquisition_medium = medium;
  }
  return { acquisition_source, acquisition_medium, entry_page,
    ...(params.get('utm_campaign') === 'madrid-pilot' ? { acquisition_campaign: 'madrid-pilot' } : {}) };
}

function save(session: Session) {
  memory = session;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* In-memory measurement still works for this page. */ }
}

function session(): Session | null {
  if (typeof window === 'undefined') return null;
  if (!analyticsAllowed()) { clearSession(); return null; }
  if (!memory) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved?.version === 1 && Number.isFinite(saved.lastSeen) && saved.attribution && saved.tours) memory = saved;
    } catch { /* No usable session. */ }
  }
  const now = Date.now();
  if (!memory || now - memory.lastSeen >= MAX_IDLE_MS || memory.lastSeen > now) {
    memory = { version: 1, lastSeen: now, attribution: acquisition(), tours: {} };
  }
  memory.lastSeen = now;
  save(memory);
  return memory;
}

export function measurementAttribution(): Record<string, string> {
  return session()?.attribution ?? {};
}

/** Called only after a successful event delivery. A session can activate each tour once. */
export function recordMeasuredTourEvent(name?: string, data?: Record<string, string | number | boolean>): boolean {
  if (name !== 'tour_started' && name !== 'audio_listening') return false;
  const id = data?.tour_id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  const current = session();
  if (!current) return false;
  const progress = current.tours[id] ?? { started: false, seconds: 0, activated: false };
  if (name === 'tour_started') progress.started = true;
  if (name === 'audio_listening' && typeof data?.seconds === 'number' && Number.isFinite(data.seconds) && data.seconds > 0) progress.seconds += data.seconds;
  const activated = progress.started && progress.seconds >= 120 && !progress.activated;
  if (activated) progress.activated = true;
  current.tours[id] = progress;
  save(current);
  return activated;
}
