export interface ListeningProgress {
  position: number;
  duration: number;
  completed: boolean;
}

export function listeningKey(tourId: string, placeId: string, version = 'unversioned') {
  return `tour-listening:${tourId}:${placeId}:${version}`;
}

export function readListeningProgress(key: string): ListeningProgress {
  const empty = { position: 0, duration: 0, completed: false };
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
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
