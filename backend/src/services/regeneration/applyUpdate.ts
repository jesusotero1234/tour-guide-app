import type { PackageTour } from './types';
import { UPDATE_METADATA_KEYS } from './types';

/** The part of Prisma that the importer uses, so the same code runs on the server, on the local copy and in tests. */
export interface UpdateTx {
  tour: { findUnique(args: any): Promise<any>; update(args: any): Promise<any> };
  place: { findMany(args: any): Promise<any[]>; update(args: any): Promise<any> };
  audioAsset: { createMany(args: any): Promise<unknown>; deleteMany(args: any): Promise<unknown> };
  tourIntroductionAudio: { createMany(args: any): Promise<unknown>; deleteMany(args: any): Promise<unknown> };
  tourCueAudio: { createMany(args: any): Promise<unknown>; deleteMany(args: any): Promise<unknown> };
  tourWalkingLegs: { upsert(args: any): Promise<unknown>; deleteMany(args: any): Promise<unknown> };
}
export interface UpdateClient extends UpdateTx { $transaction<T>(fn: (tx: UpdateTx) => Promise<T>, options?: { timeout?: number }): Promise<T> }

export type UpdateStatus = 'updated' | 'skipped' | 'failed' | 'compensated';
export interface UpdateOutcome { tourId: string; status: UpdateStatus; reason?: string }

/** Reads the tour again after COMMIT with the backend code and says whether it is admitted and what its fingerprint is. */
export type VerifyTour = (tourId: string) => Promise<{ admitted: boolean; fingerprint: string | undefined }>;

const currentFingerprint = (tour: any): string | undefined => tour?.metadata?.pilotRelease?.fingerprint;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Assigns only the listed top-level keys. Everything else in the tour metadata (sources, route, authorship...) is kept as is. */
export function mergeMetadata(current: unknown, assign: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(isRecord(current) ? current : {}) };
  for (const [key, value] of Object.entries(assign)) {
    if (value === undefined) continue;                     // not part of this update: keep what the tour has
    if (value === null) delete merged[key]; else merged[key] = value;   // null: the key did not exist before
  }
  return merged;
}

/** The writes of one update, inside a transaction the caller owns. Nothing already published is deleted. */
export async function writeTourUpdate(tx: UpdateTx, entry: PackageTour, currentMetadata: unknown): Promise<void> {
  const { tourId, update } = entry;
  const tour = { metadata: currentMetadata };
  await tx.tour.update({ where: { id: tourId }, data: { introduction: update.introduction, introductionSpokenText: update.introductionSpokenText,
    metadata: mergeMetadata(tour.metadata, update.metadata as unknown as Record<string, unknown>) } });
  const places = await tx.place.findMany({ where: { tourId }, select: { id: true, metadata: true } });
  for (const place of update.places) {
    const row = places.find(p => p.id === place.placeId);
    if (!row) throw new Error('PLACE_MISSING:' + place.placeId);
    await tx.place.update({ where: { id: place.placeId }, data: { description: place.description, spokenText: place.spokenText,
      metadata: mergeMetadata(row.metadata, place.tourImages ? { tourImages: place.tourImages } : {}) } });
  }
  await tx.audioAsset.createMany({ skipDuplicates: true, data: update.audioAssets.map(a => ({ id: a.id, placeId: a.placeId, language: a.language, format: 'mp3',
    storagePath: a.storagePath, durationSeconds: Math.round(a.durationSeconds), metadata: a.metadata })) });
  await tx.tourIntroductionAudio.createMany({ skipDuplicates: true, data: [{ id: update.introductionAudio.id, tourId, language: update.introductionAudio.language,
    format: 'mp3', storagePath: update.introductionAudio.storagePath, durationSeconds: Math.round(update.introductionAudio.durationSeconds), metadata: update.introductionAudio.metadata }] });
  await tx.tourCueAudio.createMany({ skipDuplicates: true, data: update.cues.map(c => ({ id: c.id, tourId, kind: c.kind, placeId: c.placeId ?? null, language: c.language,
    text: c.text, spokenText: c.spokenText, format: 'mp3', storagePath: c.storagePath, durationSeconds: c.durationSeconds, metadata: c.metadata })) });
  await tx.tourWalkingLegs.upsert({ where: { tourId }, create: { tourId, data: update.walkingLegs.data, sha256: update.walkingLegs.sha256 },
    update: { data: update.walkingLegs.data, sha256: update.walkingLegs.sha256 } });
}

/** One transaction per tour. Skips (does not fail) a tour that changed since the snapshot, and one that is already updated. */
export async function applyTourUpdate(client: UpdateClient, entry: PackageTour, verify: VerifyTour): Promise<UpdateOutcome> {
  const { tourId, update } = entry;
  const target = update.metadata.pilotRelease.fingerprint;
  let outcome: UpdateOutcome | undefined;
  try {
    await client.$transaction(async tx => {
      const tour = await tx.tour.findUnique({ where: { id: tourId }, select: { id: true, metadata: true } });
      if (!tour) { outcome = { tourId, status: 'skipped', reason: 'NOT_FOUND' }; return; }
      const fingerprint = currentFingerprint(tour);
      if (fingerprint === target) { outcome = { tourId, status: 'skipped', reason: 'ALREADY_APPLIED' }; return; }
      if (fingerprint !== entry.expectedCurrentFingerprint) { outcome = { tourId, status: 'skipped', reason: 'CHANGED_SINCE_SNAPSHOT' }; return; }
      await writeTourUpdate(tx, entry, tour.metadata);
    }, { timeout: 120_000 });
  } catch (error) {
    return { tourId, status: 'failed', reason: (error as Error).message };
  }
  if (outcome) return outcome;
  // The verification runs after COMMIT and with its own connection, so it sees exactly what a visitor would.
  const check = await verify(tourId).catch(error => ({ admitted: false, fingerprint: 'verify failed: ' + (error as Error).message }));
  if (check.admitted && check.fingerprint === target) return { tourId, status: 'updated' };
  const undone = await rollbackTourUpdate(client, entry);
  return { tourId, status: 'compensated', reason: `not admitted after the update (${check.fingerprint ?? 'no fingerprint'}); rollback: ${undone.status}${undone.reason ? ' ' + undone.reason : ''}` };
}

/**
 * Puts back the `previous` block and removes the rows this update created. The files stay on disk.
 *
 * The rows must go: the backend serves, for each stop, the NEWEST audio row whose hash matches the text. When a stop's spoken text
 * did not change, the old and the new file share that hash, so with the new row left in place the restored tour would serve
 * the new file, its version would differ from the one in the restored fingerprint, and the tour would stop being admitted.
 * (Found by the rehearsal.) Only rows with the ids listed in this package are deleted; nothing that existed before is touched.
 */
export async function rollbackTourUpdate(client: UpdateClient, entry: PackageTour): Promise<UpdateOutcome> {
  const { tourId, previous } = entry;
  const ours = entry.update.metadata.pilotRelease.fingerprint, before = entry.expectedCurrentFingerprint;
  let outcome: UpdateOutcome | undefined;
  try {
    await client.$transaction(async tx => {
      const tour = await tx.tour.findUnique({ where: { id: tourId }, select: { id: true, metadata: true } });
      if (!tour) { outcome = { tourId, status: 'skipped', reason: 'NOT_FOUND' }; return; }
      const fingerprint = currentFingerprint(tour);
      if (fingerprint === before) { outcome = { tourId, status: 'skipped', reason: 'ALREADY_RESTORED' }; return; }
      if (fingerprint !== ours && fingerprint !== undefined) { outcome = { tourId, status: 'skipped', reason: 'CHANGED_AFTER_PUBLISH' }; return; }
      const assign: Record<string, unknown> = {};
      for (const key of UPDATE_METADATA_KEYS) if (key in previous.metadata) assign[key] = previous.metadata[key];
      await tx.tour.update({ where: { id: tourId }, data: { introduction: previous.introduction, introductionSpokenText: previous.introductionSpokenText,
        metadata: mergeMetadata(tour.metadata, assign) } });
      const places = await tx.place.findMany({ where: { tourId }, select: { id: true, metadata: true } });
      for (const old of previous.places) {
        const row = places.find(p => p.id === old.placeId);
        if (!row) continue;
        await tx.place.update({ where: { id: old.placeId }, data: { description: old.description, spokenText: old.spokenText,
          metadata: mergeMetadata(row.metadata, { tourImages: old.tourImages }) } });
      }
      const { update } = entry;
      await tx.audioAsset.deleteMany({ where: { id: { in: update.audioAssets.map(a => a.id) } } });
      await tx.tourIntroductionAudio.deleteMany({ where: { id: update.introductionAudio.id, tourId } });
      await tx.tourCueAudio.deleteMany({ where: { id: { in: update.cues.map(c => c.id) }, tourId } });
      if (previous.metadata.walkingLegsSha256 == null) await tx.tourWalkingLegs.deleteMany({ where: { tourId } });
    }, { timeout: 120_000 });
  } catch (error) {
    return { tourId, status: 'failed', reason: (error as Error).message };
  }
  return outcome ?? { tourId, status: 'updated', reason: 'restored' };
}
