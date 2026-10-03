import { createHash } from 'crypto';

const NAMESPACE = 'https://nomuvia.com/catalog-regeneration/';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** A deterministic UUID in the canonical 8-4-4-4-12 form (version nibble 5), as the audio store requires for ids and job folders. */
export function regenUuid(...parts: string[]): string {
  const hash = sha(NAMESPACE + parts.join('|'));
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export type PieceKind = 'stop' | 'introduction' | 'cue:first' | 'cue:next' | 'cue:finish';

/**
 * Id of one rendered file. It depends on the spoken text, so changing the normalisation of one piece gives that piece, and only
 * that piece, a new id and a new file; identical text in the same run is never rendered twice.
 */
export const pieceAudioId = (regenRunId: string, tourId: string, kind: PieceKind, pieceId: string, spokenText: string) =>
  regenUuid(regenRunId, tourId, kind, pieceId, sha(spokenText));

/**
 * Id of a render job. It includes the pieces it holds: a job is resumed only with exactly the same input, and when the pieces to
 * render change (a new link wording, a re-run after a failure) the job must be another one, not a stale one with the same number.
 */
export const renderJobId = (regenRunId: string, language: string, batch: number, pieceIds: string[] = []) =>
  regenUuid(regenRunId, 'job', language, String(batch), sha(pieceIds.join(',')));
