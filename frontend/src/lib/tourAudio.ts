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
