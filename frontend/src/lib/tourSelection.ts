export type TourSelection = { kind: 'introduction' } | { kind: 'stop'; placeId: string };

export function readTourSelection(tourId: string, placeIds: string[], hasIntroduction: boolean, legacyKey: string): TourSelection {
  const first: TourSelection = { kind: 'stop', placeId: placeIds[0] ?? '' };
  try {
    const saved = JSON.parse(localStorage.getItem('tour-selection:' + tourId) || 'null') as TourSelection | null;
    if (saved?.kind === 'introduction' && hasIntroduction) return saved;
    if (saved?.kind === 'stop' && placeIds.includes(saved.placeId)) return saved;
    // Migrate the latest saved index once; subsequent editions use the stable stop ID.
    const oldKey = localStorage.getItem(legacyKey) !== null ? legacyKey
      : Object.keys(localStorage).filter(key => key.startsWith('tour-progress:' + tourId + ':')).pop();
    if (oldKey) {
      const index = Number(localStorage.getItem(oldKey));
      if (Number.isInteger(index) && placeIds[index]) return { kind: 'stop', placeId: placeIds[index] };
    }
  } catch { /* Storage is optional. */ }
  return hasIntroduction ? { kind: 'introduction' } : first;
}

export function saveTourSelection(tourId: string, selection: TourSelection) {
  try { localStorage.setItem('tour-selection:' + tourId, JSON.stringify(selection)); } catch { /* Storage is optional. */ }
}
