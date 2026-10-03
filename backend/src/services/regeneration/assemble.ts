import type { TourImageSet } from '../../domain/entities/TourImage';
import { SOURCE_POLICY_VERSION } from '../poi/SourceUsePolicy';
import type { PilotRelease } from '../PilotRelease';
import { walkingLegsSha256, type WalkingLegs } from '../WalkingLegs';
import { reassignImages, type ImageMove } from './images';
import { stopsInOrder } from './legsPlan';
import { tourRows, type ManifestTour, type Piece, type TourRendered } from './plan';
import { UPDATE_METADATA_KEYS, type PackageTour, type TourPrevious, type TourUpdate } from './types';
import type { AudioIdentity } from '../AudioProvenance';

export const RELEASE_CHANGES = 'Regeneración 2026-10: texto hablado normalizado; paradas independientes del orden; enlaces por destino';

export interface ReleaseInput {
  /** Copied literally from the user's `publish` approval; assembling without it is refused. */
  authorizationReference: string;
  reviewedAt: string;
  reviewedBy?: string;
}

export interface AssembleInput {
  tour: ManifestTour;
  /** The texts shown on screen after the order references were removed. */
  bodies: { introduction: string; places: Record<string, string> };
  spokenIntroduction: string;
  spokenPlaces: Record<string, string>;
  pieces: Piece[];
  rendered: TourRendered;
  identity: AudioIdentity;
  speechVersion: string;
  legs: WalkingLegs;
  release: ReleaseInput;
  catalogTitle?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * The update and the `previous` block for one tour. The fingerprint is a placeholder here: it can only be computed with the
 * backend's code once the update is applied to a database (plan 04 section 8.2), and is then set with `withFingerprint`.
 */
export function assembleTour(input: AssembleInput): { entry: PackageTour; imageMoves: Record<string, ImageMove[]> } {
  const { tour, bodies, release } = input;
  if (!release.authorizationReference?.trim()) throw new Error('A literal authorizationReference from the user is required to assemble a package');
  const rows = tourRows(tour, input.pieces, input.rendered, input.identity, input.speechVersion);
  const stops = stopsInOrder(tour.places);
  const imageMoves: Record<string, ImageMove[]> = {};
  const places: TourUpdate['places'] = stops.map(place => {
    const description = bodies.places[place.placeId];
    const spokenText = input.spokenPlaces[place.placeId];
    const current = place.metadata.tourImages as TourImageSet | undefined;
    const moved = reassignImages(current, description);
    imageMoves[place.placeId] = moved.moves;
    return { placeId: place.placeId, description, spokenText, ...(moved.images ? { tourImages: moved.images } : {}) };
  });
  const legsHash = walkingLegsSha256(input.legs);
  const pilotRelease: PilotRelease = { version: 1, approvalMode: 'owner-authorized', authorizationReference: release.authorizationReference, status: 'approved',
    reviewedBy: release.reviewedBy ?? 'Owner authorization; automated technical checks', reviewedAt: release.reviewedAt, fingerprint: '', sourcePolicy: SOURCE_POLICY_VERSION,
    scriptLicense: 'CC BY-SA 4.0', changes: RELEASE_CHANGES, checks: { text: false, audio: false, route: false, rights: false } };
  const metadata: TourUpdate['metadata'] = { orderFlexible: true, introductionAudioId: rows.introductionAudio.id, cueManifest: rows.cueManifest, walkingLegsSha256: legsHash,
    ...(input.catalogTitle ? { catalogTitle: input.catalogTitle } : {}), pilotRelease };
  const update: TourUpdate = { introduction: bodies.introduction, introductionSpokenText: input.spokenIntroduction, metadata, walkingLegs: { data: input.legs, sha256: legsHash },
    places, audioAssets: rows.audioAssets, introductionAudio: rows.introductionAudio, cues: rows.cues };
  const previousMetadata: Record<string, unknown> = {};
  for (const key of UPDATE_METADATA_KEYS) if (key in metadata) previousMetadata[key] = key in tour.metadata ? clone(tour.metadata[key]) : null;
  const previous: TourPrevious = { introduction: tour.introduction, introductionSpokenText: tour.introductionSpokenText ?? null, metadata: previousMetadata,
    places: stops.map(place => ({ placeId: place.placeId, description: place.description, spokenText: place.spokenText ?? null,
      tourImages: (place.metadata.tourImages as TourImageSet | undefined) ? clone(place.metadata.tourImages as TourImageSet) : null })) };
  return { entry: { tourId: tour.tourId, expectedCurrentFingerprint: tour.fingerprint, update, previous }, imageMoves };
}

/** Sets the real fingerprint, computed by the backend's code, on the entry. */
export function withFingerprint(entry: PackageTour, fingerprint: string): PackageTour {
  return { ...entry, update: { ...entry.update, metadata: { ...entry.update.metadata, pilotRelease: { ...entry.update.metadata.pilotRelease, fingerprint } } } };
}
