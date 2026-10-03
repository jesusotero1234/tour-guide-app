/** A short clip that links one stop to the next (plan 03). It says where to go; it depends on the destination, not on where you come from. */
export interface Cue { text: string; audioUrl: string; version: string; durationSeconds?: number }
export interface TourCues { first: Record<string, Cue>; next: Record<string, Cue>; finish?: Cue }

export interface TourAudioState {
  tourId: string;
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'unavailable';
  phase: string;
  completedStops: number;
  totalStops: number;
  completedChunks?: number;
  totalChunks?: number;
  currentStopId?: string;
  audioUrls: Record<string, string>;
  audioVersions?: Record<string, string>;
  transcripts?: Record<string, string>;
  introduction?: { status: 'completed'; text: string; audioUrl: string; version: string; durationSeconds?: number };
  /** Only for tours that can be walked in any order. */
  cues?: TourCues;
  canGenerate?: boolean;
  error?: { code: string; message: string };
}

async function request(tourId: string, method: 'GET' | 'POST', signal?: AbortSignal): Promise<TourAudioState> {
  const response = await fetch('/api/backend/tours/' + encodeURIComponent(tourId) + '/audio', {
    method, cache: 'no-store', signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Audio is temporarily unavailable.');
  return data as TourAudioState;
}
export const getTourAudio = (id: string, signal?: AbortSignal) => request(id, 'GET', signal);
export const createTourAudio = (id: string) => request(id, 'POST');
