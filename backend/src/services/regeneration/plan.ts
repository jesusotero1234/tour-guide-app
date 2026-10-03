import { createHash } from 'crypto';
import type { TourImageSet } from '../../domain/entities/TourImage';
import type { AudioIdentity } from '../AudioProvenance';
import { audioDisclosure, rendererKeyOf } from '../AudioProvenance';
import type { AudioRenderInput } from '../LocalVoxCpmRenderer';
import { cueText, type CueKind, type CueManifestEntry } from '../TourCues';
import { pieceAudioId, renderJobId, type PieceKind } from './ids';
import { stopsInOrder } from './legsPlan';
import type { RenderedFile } from './types';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const MAX_PIECES_PER_JOB = 40;                 // limit of AudioRenderInput (tour_audio_input.py and TourAudioService)
export const LINK_SECONDS = { min: 0.8, max: 10 };

/** What the snapshot keeps of a published tour: enough to rebuild it, to regenerate it and to put it back. */
export interface ManifestPlace {
  placeId: string; position: number; name: string; nameInTourLanguage?: string; description: string; spokenText?: string | null; latitude: number; longitude: number;
  metadata: Record<string, unknown>;
}
export interface ManifestTour {
  tourId: string; language: string; city: string; countryCode: string; theme: string; baseKey: string; fingerprint: string; rendererKey: string;
  introduction: string; introductionSpokenText?: string | null; introductionAudioId?: string; audioVersions: Record<string, string>; metadata: Record<string, unknown>; places: ManifestPlace[];
}
export interface Manifest { version: 1; runId: string; createdAt: string; source: 'production' | 'local'; tours: ManifestTour[] }

/**
 * The audio the backend selects is tied to rendererKey, computed from the voice files of the repository the backend runs. If the
 * voice used to render here differs from the one that produced the published audio, the new files would not validate in
 * production and the previous ones could not come back. So it is checked before anything is rendered or written.
 */
export function assertSameVoice(tour: { tourId: string; rendererKey: string }, identity: AudioIdentity): void {
  if (rendererKeyOf(identity) !== tour.rendererKey) throw new Error('The local voice differs from the published one for tour ' + tour.tourId + ' (rendererKey mismatch)');
}

export const placeName = (place: { name: string; nameInTourLanguage?: string }) => (place.nameInTourLanguage ?? place.name).trim();

/** The 2N+1 link clips of a tour in a fixed order: every `first`, every `next`, then `finish`. */
export function cueDefinitions(tour: { language: string; places: ManifestPlace[] }): Array<{ kind: CueKind; placeId?: string; text: string }> {
  const places = stopsInOrder(tour.places);
  return [
    ...places.map(p => ({ kind: 'first' as const, placeId: p.placeId, text: cueText('first', tour.language, placeName(p)) })),
    ...places.map(p => ({ kind: 'next' as const, placeId: p.placeId, text: cueText('next', tour.language, placeName(p)) })),
    { kind: 'finish' as const, text: cueText('finish', tour.language) },
  ];
}

export interface Piece {
  tourId: string; language: string; kind: PieceKind; pieceId: string; text: string; spokenText: string; audioId: string;
  cue?: { kind: CueKind; placeId?: string };
}

export interface SpokenTour {
  introductionSpokenText: string;
  places: Record<string, string>;                          // placeId -> spoken text of the new description
  cues: Record<string, string>;                            // "first:<placeId>" | "next:<placeId>" | "finish" -> spoken text
}
export const cueKey = (cue: { kind: CueKind; placeId?: string }) => (cue.kind === 'finish' ? 'finish' : cue.kind + ':' + cue.placeId);

/**
 * Every file to render for one tour: the body of each stop, the introduction (its spoken text begins with the AI-voice
 * disclosure, as the audio service hashes it) and the link clips.
 */
export function tourPieces(runId: string, tour: ManifestTour, bodies: { introduction: string; places: Record<string, string> }, spoken: SpokenTour): Piece[] {
  const lang = tour.language;
  const pieces: Piece[] = [];
  const intro = audioDisclosure(lang) + '\n\n' + spoken.introductionSpokenText;
  pieces.push({ tourId: tour.tourId, language: lang, kind: 'introduction', pieceId: 'introduction', text: audioDisclosure(lang) + '\n\n' + bodies.introduction.trim(), spokenText: intro,
    audioId: pieceAudioId(runId, tour.tourId, 'introduction', 'introduction', intro) });
  for (const place of stopsInOrder(tour.places)) {
    const text = bodies.places[place.placeId], speech = spoken.places[place.placeId];
    if (!text?.trim() || !speech?.trim()) throw new Error('Missing text for stop ' + place.placeId);
    pieces.push({ tourId: tour.tourId, language: lang, kind: 'stop', pieceId: place.placeId, text: text.trim(), spokenText: speech.trim(),
      audioId: pieceAudioId(runId, tour.tourId, 'stop', place.placeId, speech.trim()) });
  }
  for (const cue of cueDefinitions(tour)) {
    const speech = spoken.cues[cueKey(cue)];
    if (!speech?.trim()) throw new Error('Missing spoken text for link clip ' + cueKey(cue));
    const kind = ('cue:' + cue.kind) as PieceKind, pieceId = cue.placeId ?? 'finish';
    pieces.push({ tourId: tour.tourId, language: lang, kind, pieceId, text: cue.text, spokenText: speech.trim(), cue: { kind: cue.kind, placeId: cue.placeId },
      audioId: pieceAudioId(runId, tour.tourId, kind, pieceId, speech.trim()) });
  }
  return pieces;
}

export interface RenderJob { jobId: string; language: string; batch: number; pieces: Piece[] }

/** One language at a time (the voice stays loaded), at most 40 pieces per job. Identical files are rendered once. */
export function planRenderJobs(runId: string, language: string, pieces: Piece[]): RenderJob[] {
  const unique = [...new Map(pieces.filter(p => p.language === language).map(p => [p.audioId, p])).values()];
  const jobs: RenderJob[] = [];
  for (let i = 0; i < unique.length; i += MAX_PIECES_PER_JOB) {
    const batch = i / MAX_PIECES_PER_JOB + 1, pieces = unique.slice(i, i + MAX_PIECES_PER_JOB);
    jobs.push({ jobId: renderJobId(runId, language, batch, pieces.map(p => p.audioId)), language, batch, pieces });
  }
  return jobs;
}

export const renderInput = (job: RenderJob, identity: AudioIdentity, speechVersion: string): AudioRenderInput => ({
  language: job.language, identity, speechVersion, stops: job.pieces.map(p => ({ id: p.audioId, text: p.text, spokenText: p.spokenText })) });

/** Hash that ties a file to the exact text and voice it was made from; the same formula as TourAudioService.snapshot. */
export const sourceHashOf = (language: string, rendererKey: string, spokenText: string) => sha(language + rendererKey + spokenText);

export interface Rendered { audioId: string; jobId: string; storagePath: string; durationSeconds: number; fileSha256: string }

export function fileRow(piece: Piece, rendered: Rendered, rendererKey: string, identity: AudioIdentity, speechVersion: string): RenderedFile {
  return { id: rendered.audioId, storagePath: rendered.storagePath, durationSeconds: rendered.durationSeconds,
    metadata: { provider: 'VoxCPM2', voice: 'A', rendererKey, sourceHash: sourceHashOf(piece.language, rendererKey, piece.spokenText), audioJobId: rendered.jobId,
      fileSha256: rendered.fileSha256, identity: { ...identity }, speechVersion } };
}

export interface ChecksOnFile { ok: boolean; problems: string[] }
/** Per piece, after rendering (plan 04 section 7): decodable, long enough, link clips between 0.8 and 10 s, sidecar text equal. */
export function checkRendered(piece: Piece, rendered: { durationSeconds: number; sidecarSpokenText?: string; fileSha256: string; expectedSha256?: string }): ChecksOnFile {
  const problems: string[] = [];
  if (!(rendered.durationSeconds > 0)) problems.push('duration is not positive');
  if (piece.cue && (rendered.durationSeconds < LINK_SECONDS.min || rendered.durationSeconds > LINK_SECONDS.max)) problems.push(`link clip lasts ${rendered.durationSeconds}s, outside ${LINK_SECONDS.min}-${LINK_SECONDS.max}s`);
  if (rendered.expectedSha256 && rendered.expectedSha256 !== rendered.fileSha256) problems.push('file hash differs from the one the renderer reported');
  const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(' ');
  if (rendered.sidecarSpokenText === undefined) problems.push('provenance sidecar has no spokenText');
  else if (norm(rendered.sidecarSpokenText) !== norm(piece.spokenText)) problems.push('sidecar spoken text differs from the piece');
  return { ok: !problems.length, problems };
}

export interface TourRendered { introduction: Rendered; places: Record<string, Rendered>; cues: Record<string, Rendered> }

/** The rows and the manifest the importer writes for one tour (the pilot release and its fingerprint are added later). */
export function tourRows(tour: ManifestTour, pieces: Piece[], rendered: TourRendered, identity: AudioIdentity, speechVersion: string) {
  assertSameVoice(tour, identity);
  const byAudio = new Map(pieces.map(p => [p.audioId, p]));
  const row = (r: Rendered) => fileRow(byAudio.get(r.audioId)!, r, tour.rendererKey, identity, speechVersion);
  const introPiece = pieces.find(p => p.kind === 'introduction')!;
  const stops = stopsInOrder(tour.places);
  const audioAssets = stops.map(place => ({ ...row(rendered.places[place.placeId]), placeId: place.placeId, language: tour.language }));
  const introRow = row(rendered.introduction);
  introRow.metadata = { ...introRow.metadata, firstAudioAssetId: audioAssets[0].id };
  const cues = cueDefinitions(tour).map(def => {
    const r = rendered.cues[cueKey(def)];
    const file = row(r);
    return { ...file, kind: def.kind, placeId: def.placeId, language: tour.language, text: def.text, spokenText: byAudio.get(r.audioId)!.spokenText };
  });
  const cueManifest: CueManifestEntry[] = cues.map(c => ({ kind: c.kind, ...(c.placeId ? { placeId: c.placeId } : {}), text: c.text,
    version: `${c.metadata.sourceHash}.${c.metadata.fileSha256}` }))
    .sort((a, b) => (a.kind + (a.placeId ?? '')).localeCompare(b.kind + (b.placeId ?? '')));
  return { audioAssets, introductionAudio: { ...introRow, language: tour.language }, cues, cueManifest, introductionSourceHash: sourceHashOf(tour.language, tour.rendererKey, introPiece.spokenText) };
}

export type { TourImageSet };
