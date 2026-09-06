import { Place } from '../domain/entities/Place';
import { TourImageCandidate } from '../domain/entities/TourImage';
import { CommonsImageCandidates } from './CommonsImageCandidates';
import { ContextualTourImages, withoutTourImages } from './ContextualTourImages';
import { createImageModel } from './TourImageModel';

export const TOUR_IMAGE_PLACE_LIMIT = 12;
export const TOUR_IMAGE_DEADLINE_MS = 180000;

export async function enrichTourImages<T extends { places: Place[]; language: string }>(tour: T, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  let model;
  try { model = createImageModel(); } catch {
    return { ...tour, places: tour.places.map(p => withoutTourImages(p, 'disabled', 'invalid-model-config')) };
  }
  if (!model) return { ...tour, places: tour.places.map(p => withoutTourImages(p, 'disabled', 'model-not-configured')) };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, TOUR_IMAGE_DEADLINE_MS);
  const provider = new CommonsImageCandidates();
  const cache = new Map<string, Promise<TourImageCandidate[]>>();
  const service = new ContextualTourImages(model, { find(qid, stopSignal) {
    if (!cache.has(qid)) cache.set(qid, provider.find(qid, stopSignal));
    return cache.get(qid)!;
  } });
  const places: Place[] = [];
  try {
    for (const place of tour.places) {
      signal?.throwIfAborted();
      if (controller.signal.aborted || places.length >= TOUR_IMAGE_PLACE_LIMIT) {
        places.push(withoutTourImages(place, 'unavailable', controller.signal.aborted ? 'deadline' : 'place-limit'));
        continue;
      }
      try { places.push(await service.enrich(place, tour.language, controller.signal)); }
      catch {
        signal?.throwIfAborted();
        places.push(withoutTourImages(place, 'unavailable', controller.signal.aborted ? 'deadline' : 'image-selection-failed'));
      }
    }
    signal?.throwIfAborted();
    return { ...tour, places };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
