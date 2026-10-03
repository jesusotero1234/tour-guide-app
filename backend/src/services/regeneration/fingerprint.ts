import type { PrismaClient } from '@prisma/client';
import { PostgresTourRepository } from '../../infrastructure/postgres/PostgresTourRepository';
import { admittedToPilot, pilotFingerprint, validatePilotMaterial } from '../PilotRelease';
import { TourAudioService } from '../TourAudioService';
import { writeTourUpdate, type UpdateTx, type VerifyTour } from './applyUpdate';
import type { PackageTour } from './types';

export interface AudioPaths { storageDir: string; jobsDir: string }

class RollBack extends Error {
  constructor(public readonly result: { fingerprint: string; materialError?: string }) { super('ROLLBACK'); }
}

/**
 * The fingerprint a tour will have once the update is applied, computed with the backend's own code and never reimplemented
 * (plan 04 section 8.2). The update is written inside a transaction, the repository and the audio service read through that
 * same transaction, and the transaction is then rolled back: nothing is committed, so it is safe on a copy and on production.
 * `materialError` says why the tour would not be admitted even with the right fingerprint (missing audio, images, sources...).
 */
export async function computeUpdateFingerprint(client: PrismaClient, entry: PackageTour, paths?: AudioPaths): Promise<{ fingerprint: string; materialError?: string }> {
  try {
    await client.$transaction(async tx => {
      const current = await tx.tour.findUnique({ where: { id: entry.tourId }, select: { metadata: true } });
      if (!current) throw new Error('TOUR_NOT_FOUND:' + entry.tourId);
      await writeTourUpdate(tx as unknown as UpdateTx, entry, current.metadata);
      const inside = tx as unknown as PrismaClient;
      const tour = await new PostgresTourRepository(inside).findById(entry.tourId);
      const state = await new TourAudioService(inside, undefined, paths).get(entry.tourId, true);
      if (!tour) throw new Error('TOUR_NOT_FOUND:' + entry.tourId);
      let materialError: string | undefined;
      try { validatePilotMaterial(tour, state); } catch (error) { materialError = (error as Error).message; }
      throw new RollBack({ fingerprint: pilotFingerprint(tour, state), ...(materialError ? { materialError } : {}) });
    }, { timeout: 120_000 });
  } catch (error) {
    if (error instanceof RollBack) return error.result;
    throw error;
  }
  throw new Error('unreachable');
}

/** Reads the tour again with its own connection (as a visitor would) and says whether it is admitted and what fingerprint it carries. */
export function createVerifier(client: PrismaClient, paths?: AudioPaths): VerifyTour {
  const repository = new PostgresTourRepository(client), audio = new TourAudioService(client, undefined, paths);
  return async tourId => {
    const tour = await repository.findById(tourId);
    if (!tour) return { admitted: false, fingerprint: undefined };
    const state = await audio.get(tourId, true);
    return { admitted: admittedToPilot(tour, state), fingerprint: tour.metadata?.pilotRelease?.fingerprint };
  };
}
