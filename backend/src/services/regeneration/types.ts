import type { PilotRelease } from '../PilotRelease';
import type { TourImageSet } from '../../domain/entities/TourImage';
import type { CueManifestEntry } from '../TourCues';
import type { WalkingLegs } from '../WalkingLegs';

/** Everything the importer writes for one tour, and what it needs to put back (plan 04 section 8.3). */
export interface RenderedFile { id: string; storagePath: string; durationSeconds: number; metadata: Record<string, unknown> }

export interface TourUpdate {
  introduction: string;
  introductionSpokenText: string;
  /** Only these top-level keys of Tour.metadata are assigned; everything else is left untouched. */
  metadata: { orderFlexible: true; introductionAudioId: string; cueManifest: CueManifestEntry[]; walkingLegsSha256: string; catalogTitle?: string; pilotRelease: PilotRelease };
  walkingLegs: { data: WalkingLegs; sha256: string };
  places: Array<{ placeId: string; description: string; spokenText: string; tourImages?: TourImageSet }>;
  audioAssets: Array<RenderedFile & { placeId: string; language: string }>;
  introductionAudio: RenderedFile & { language: string };
  cues: Array<RenderedFile & { kind: 'first' | 'next' | 'finish'; placeId?: string; language: string; text: string; spokenText: string }>;
}

/** The values to restore. A metadata value of null means the key did not exist and is removed. */
export interface TourPrevious {
  introduction: string | null;
  introductionSpokenText: string | null;
  metadata: Record<string, unknown>;
  places: Array<{ placeId: string; description: string; spokenText: string | null; tourImages: TourImageSet | null }>;
}

export interface PackageTour { tourId: string; expectedCurrentFingerprint: string; update: TourUpdate; previous: TourPrevious }

export interface CatalogUpdatePackage {
  version: 1;
  regenRunId: string;
  basedOnSnapshotSha256: string;
  tours: PackageTour[];
}

/** Keys of Tour.metadata that an update owns. */
export const UPDATE_METADATA_KEYS = ['orderFlexible', 'introductionAudioId', 'cueManifest', 'walkingLegsSha256', 'catalogTitle', 'pilotRelease'] as const;
