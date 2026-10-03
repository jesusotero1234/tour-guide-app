import type { Cue, TourCues } from './tourAudio';

export type PlayPosition = { kind: 'introduction' } | { kind: 'stop'; placeId: string };
export type CueRef = { kind: 'first' | 'next' | 'finish'; placeId?: string };

/**
 * The link clip that follows what is playing, in the active order: after the introduction, the one that leads to the first stop;
 * after a stop, the one that leads to the next one; after the last stop, the closing one.
 */
export function cueRefAfter(order: string[], position: PlayPosition): CueRef | null {
  if (!order.length) return null;
  if (position.kind === 'introduction') return { kind: 'first', placeId: order[0] };
  const index = order.indexOf(position.placeId);
  if (index < 0) return null;
  return index === order.length - 1 ? { kind: 'finish' } : { kind: 'next', placeId: order[index + 1] };
}

export function cueFor(cues: TourCues | undefined, ref: CueRef | null): Cue | undefined {
  if (!cues || !ref) return undefined;
  if (ref.kind === 'finish') return cues.finish;
  return ref.placeId ? cues[ref.kind][ref.placeId] : undefined;
}
