export interface ListeningProgress {
  position: number;
  duration: number;
  completed: boolean;
}

export function listeningKey(tourId: string, placeId: string, version = 'unversioned') {
  return `tour-listening:${tourId}:${placeId}:${version}`;
}

const LISTENING_PREFIX = 'tour-listening:';

/**
 * The keys carry the version of the audio, and regenerating a tour changes every version. A visitor who had already listened to a
 * stop must not lose that mark (plan 05 section 4.4): when the key of the current version does not exist, a `completed` mark saved
 * under another version of the same stop moves to the new key and the old ones are removed. The position does not move, because
 * the new audio is not the same length.
 */
function adoptCompletedFromOtherVersion(key: string): ListeningProgress | null {
  if (!key.startsWith(LISTENING_PREFIX)) return null;
  const [tourId, placeId, ...version] = key.slice(LISTENING_PREFIX.length).split(':');
  if (!tourId || !placeId || !version.length) return null;
  const stem = `${LISTENING_PREFIX}${tourId}:${placeId}:`;
  const older = Object.keys(localStorage).filter(other => other.startsWith(stem) && other !== key);
  if (!older.length) return null;
  const completed = older.some(other => {
    try { return JSON.parse(localStorage.getItem(other) || 'null')?.completed === true; } catch { return false; }
  });
  if (!completed) return null;
  const adopted = { position: 0, duration: 0, completed: true };
  localStorage.setItem(key, JSON.stringify(adopted));
  older.forEach(other => localStorage.removeItem(other));
  return adopted;
}

export function readListeningProgress(key: string): ListeningProgress {
  const empty = { position: 0, duration: 0, completed: false };
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return adoptCompletedFromOtherVersion(key) ?? empty;
    const value = JSON.parse(stored || 'null');
    if (!value || !Number.isFinite(value.position) || value.position < 0
      || !Number.isFinite(value.duration) || value.duration < 0) return empty;
    return { position: value.duration ? Math.min(value.position, value.duration) : value.position,
      duration: value.duration, completed: value.completed === true };
  } catch { return empty; }
}

export function saveListeningProgress(key: string, progress: ListeningProgress) {
  if (!Number.isFinite(progress.position) || !Number.isFinite(progress.duration)) return;
  try { localStorage.setItem(key, JSON.stringify(progress)); } catch { /* Playback still works when storage is blocked. */ }
}
