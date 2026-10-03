import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { PostgresTourRepository } from '../../../infrastructure/postgres/PostgresTourRepository';
import { admittedToPilot } from '../../PilotRelease';
import { TourAudioService } from '../../TourAudioService';
import type { WalkingLegs } from '../../WalkingLegs';
import { applyTourUpdate, type UpdateClient, type UpdateOutcome } from '../applyUpdate';
import { assembleTour } from '../assemble';
import { withFingerprint } from '../assemble';
import { computeUpdateFingerprint, createVerifier } from '../fingerprint';
import { assertDisposableDatabase } from '../guard';
import { regenUuid } from '../ids';
import { reassignImages, type ImageMove } from '../images';
import { manifestSha256 } from '../manifest';
import { tourPieces, type ManifestTour, type TourRendered } from '../plan';
import { sha256 } from '../stage';
import type { CatalogUpdatePackage, PackageTour } from '../types';
import { voiceIdentity } from '../voice';
import { manifestOf, renderedTours, selectTours, type Ctx } from './context';
import type { NeutralFile, SpeechFile } from './prepare';
import { httpChecks, type HttpReport } from './verify';

export const REHEARSAL_REFERENCE = 'LOCAL-REHEARSAL-NOT-FOR-PUBLICATION';

/* ------------------------------------------------------------------- images */

export interface ImagesFile { tourId: string; places: Record<string, { moves: ImageMove[] }> }

/** Re-binds every photo to the paragraphs of the new text (plan 04 section 8.1) and reports the ones that did not match exactly. */
export function imagesPhase(ctx: Ctx) {
  const { stage, deps } = ctx;
  stage.require('images');
  const total = { exact: 0, similar: 0, nearest: 0, first: 0 };
  const tours = selectTours(ctx).filter(t => stage.exists('neutral', t.tourId + '.json'));
  for (const tour of tours) {
    const neutral = stage.read<NeutralFile>('neutral', tour.tourId + '.json');
    const places: ImagesFile['places'] = {};
    for (const place of tour.places) {
      const { moves } = reassignImages(place.metadata.tourImages as never, neutral.bodies.places[place.placeId]);
      places[place.placeId] = { moves };
      for (const move of moves) total[move.method]++;
    }
    stage.write({ tourId: tour.tourId, places } satisfies ImagesFile, 'images', tour.tourId + '.json');
  }
  deps.log(`images: ${tours.length} tours, ${JSON.stringify(total)}`);
  if (stage.list('images').length) stage.writeReceipt('images', stage.list('images'), total);
  return total;
}

/* -------------------------------------------------------------- stage-local */

export interface StageLocalFile { tourId: string; entry: PackageTour; imageMoves: Record<string, ImageMove[]>; outcome: UpdateOutcome; materialError?: string; inputSha?: string }

/** What a tour's staged entry is built from. A saved result is reused only while none of these files has changed. */
export const stagedInputSha = (ctx: Pick<Ctx, 'stage'>, tourId: string) => sha256(['neutral', 'speech', 'render', 'images', 'legs', 'cues'].map(dir => ctx.stage.fileSha(dir, tourId + '.json')).join(':'));

/** Where the audio of the local copy lives and where its job state goes. */
export interface LocalPaths { storageDir: string; jobsDir: string }
export const localPaths = (ctx: Ctx, storageDir: string): LocalPaths => ({ storageDir, jobsDir: ctx.stage.path('audio-jobs') });

function renderedOf(ctx: Ctx, tourId: string): TourRendered { return ctx.stage.read<TourRendered>('render', tourId + '.json'); }

function copyAudio(ctx: Ctx, rendered: TourRendered, storageDir: string) {
  const all = [rendered.introduction, ...Object.values(rendered.places), ...Object.values(rendered.cues)];
  for (const file of all) {
    const source = ctx.stage.path('render', 'audio', file.storagePath), target = join(storageDir, file.storagePath);
    if (existsSync(target)) { if (sha256(readFileSync(target)) !== file.fileSha256) throw new Error('A different file already exists at ' + target); continue; }
    mkdirSync(dirname(target), { recursive: true });
    try { linkSync(source, target); } catch { copyFileSync(source, target); }
    const sidecar = source.replace(/\.mp3$/, '.provenance.json');
    if (existsSync(sidecar)) { try { linkSync(sidecar, target.replace(/\.mp3$/, '.provenance.json')); } catch { copyFileSync(sidecar, target.replace(/\.mp3$/, '.provenance.json')); } }
  }
}

export function buildEntry(ctx: Ctx, tour: ManifestTour, reference: { authorizationReference: string; reviewedAt: string }): { entry: PackageTour; imageMoves: Record<string, ImageMove[]> } {
  const { stage } = ctx;
  const neutral = stage.read<NeutralFile>('neutral', tour.tourId + '.json');
  const speech = stage.read<SpeechFile>('speech', tour.tourId + '.json');
  const rendered = renderedOf(ctx, tour.tourId);
  const pieces = tourPieces(manifestOf(stage).runId, tour, neutral.bodies, { introductionSpokenText: speech.introductionSpokenText, places: speech.places, cues: speech.cues });
  const legs = stage.read<{ legs: WalkingLegs }>('legs', tour.tourId + '.json').legs;
  return assembleTour({ tour, bodies: neutral.bodies, spokenIntroduction: speech.introductionSpokenText, spokenPlaces: speech.places, pieces, rendered,
    identity: voiceIdentity(tour.language), speechVersion: speech.speechVersion, legs, release: reference });
}

/**
 * Applies the changes to a disposable copy of the database with the same importer production will use, and computes each
 * tour's fingerprint with the backend's code (plan 04 section 8.2). Before touching anything it checks that the copy still holds
 * what the snapshot says (so that the new backend serves the same tours with the same fingerprints).
 */
export async function stageLocalPhase(ctx: Ctx, options: { storageDir: string }) {
  const { stage, deps } = ctx;
  stage.require('stage-local');
  assertDisposableDatabase(process.env.DATABASE_URL);
  const db = deps.prisma!();
  const paths = localPaths(ctx, options.storageDir);
  const repository = new PostgresTourRepository(db), audio = new TourAudioService(db, undefined, paths), verifyTour = createVerifier(db, paths);
  const publish = stage.approved('publish');
  const reference = { authorizationReference: publish?.authorizationReference?.trim() || REHEARSAL_REFERENCE, reviewedAt: deps.now().toISOString() };
  const summary = { updated: 0, skipped: 0, failed: 0, excluded: 0 };
  const tours = renderedTours(ctx);
  // Baseline: untouched data must give the fingerprints of the snapshot.
  if (!stage.exists('stage-local', 'baseline.json')) stage.write(await httpChecks(ctx, db, paths, { phase: 'baseline', tourIds: tours.map(t => t.tourId), checkDetail: false }), 'stage-local', 'baseline.json');
  for (const tour of tours) {
    const file = ['stage-local', tour.tourId + '.json'];
    const before = stage.readOr<StageLocalFile | null>(null, ...file);
    const inputSha = stagedInputSha(ctx, tour.tourId);
    if (before && before.outcome.status === 'updated' && before.inputSha === inputSha) { summary.updated++; continue; }
    const current = await repository.findById(tour.tourId);
    const state = current ? await audio.get(tour.tourId, true) : undefined;
    const stored = current?.metadata?.pilotRelease?.fingerprint;
    if (!current || !state) { summary.failed++; stage.write({ tourId: tour.tourId, outcome: { tourId: tour.tourId, status: 'failed', reason: 'tour is not in the local copy' } }, ...file); continue; }
    const alreadyUpdated = current.metadata?.orderFlexible === true && stored !== tour.fingerprint;
    if (!alreadyUpdated && (stored !== tour.fingerprint || !admittedToPilot(current, state))) {
      summary.failed++;
      stage.write({ tourId: tour.tourId, outcome: { tourId: tour.tourId, status: 'failed', reason: 'the local copy does not match the snapshot (fingerprint or admission)' } }, ...file);
      continue;
    }
    copyAudio(ctx, renderedOf(ctx, tour.tourId), options.storageDir);
    const built = buildEntry(ctx, tour, reference);
    const { fingerprint, materialError } = await computeUpdateFingerprint(db, built.entry, paths);
    if (materialError) {
      stage.exclude(tour.tourId, 'stage-local', 'would not be admitted: ' + materialError);
      summary.excluded++;
      stage.write({ tourId: tour.tourId, entry: built.entry, imageMoves: built.imageMoves, outcome: { tourId: tour.tourId, status: 'failed', reason: materialError }, materialError } satisfies StageLocalFile, ...file);
      continue;
    }
    const entry = withFingerprint(built.entry, fingerprint);
    const outcome = await applyTourUpdate(db as unknown as UpdateClient, entry, verifyTour);
    if (outcome.status === 'updated') summary.updated++; else if (outcome.status === 'skipped') summary.skipped++; else summary.failed++;
    stage.write({ tourId: tour.tourId, entry, imageMoves: built.imageMoves, outcome, inputSha } satisfies StageLocalFile, ...file);
  }
  deps.log(`stage-local: ${JSON.stringify(summary)}`);
  if (stage.list('stage-local').length) stage.writeReceipt('stage-local', stage.list('stage-local'), { ...summary, rehearsal: reference.authorizationReference === REHEARSAL_REFERENCE });
  return summary;
}

/* ------------------------------------------------------------------ package */

export interface PackageSummary { tours: number; excluded: number; audioFiles: number; bytes: number }

/** Plan 04 section 8.3. It refuses to run without the user's `publish` approval, whose reference is copied literally. */
export function packagePhase(ctx: Ctx): PackageSummary {
  const { stage, deps } = ctx;
  stage.require('package');
  const approval = stage.approved('publish');
  if (!approval?.authorizationReference?.trim()) throw new Error('package needs the user\'s "publish" approval with its authorizationReference in approvals.json');
  const manifest = manifestOf(stage);
  const reviewedAt = deps.now().toISOString();
  const entries: PackageTour[] = [];
  for (const tour of renderedTours(ctx)) {
    const staged = stage.read<StageLocalFile>('stage-local', tour.tourId + '.json');
    if (!staged.entry || staged.outcome.status !== 'updated') throw new Error(`Tour ${tour.tourId} was not applied in stage-local (${staged.outcome.reason ?? staged.outcome.status})`);
    const entry = staged.entry;
    entries.push({ ...entry, update: { ...entry.update, metadata: { ...entry.update.metadata, pilotRelease: { ...entry.update.metadata.pilotRelease,
      authorizationReference: approval.authorizationReference!.trim(), reviewedAt } } } });
  }
  // A second package of the same run (--part 2: the tours that were left out of the first one) needs an id of its own: the installers name the
  // upload folder and the database backup after it, and refuse a name that was used.
  const part = ctx.flags.part ? String(ctx.flags.part) : '';
  const pkg: CatalogUpdatePackage = { version: 1, regenRunId: part ? regenUuid(manifest.runId, 'package-part', part) : manifest.runId, basedOnSnapshotSha256: manifestSha256(manifest), tours: entries };
  const target = stage.write(pkg, 'package', 'catalog-update.json');
  const lines: string[] = [];
  let bytes = 0;
  for (const entry of entries) {
    for (const file of [entry.update.introductionAudio, ...entry.update.audioAssets, ...entry.update.cues]) {
      const source = stage.path('render', 'audio', file.storagePath), destination = stage.path('package', 'audio', file.storagePath);
      mkdirSync(dirname(destination), { recursive: true });
      if (!existsSync(destination)) { try { linkSync(source, destination); } catch { copyFileSync(source, destination); } }
      const data = readFileSync(destination);
      bytes += data.length;
      lines.push(`${sha256(data)}  ${file.storagePath}`);
      const sidecar = source.replace(/\.mp3$/, '.provenance.json');
      if (existsSync(sidecar)) { const to = destination.replace(/\.mp3$/, '.provenance.json'); if (!existsSync(to)) { try { linkSync(sidecar, to); } catch { copyFileSync(sidecar, to); } } }
    }
  }
  writeFileSync(stage.path('package', 'audio.sha256'), [...new Set(lines)].sort().join('\n') + '\n', { mode: 0o600 });
  const excluded = Object.keys(stage.state().excluded).length;
  stage.write({ excluded: stage.state().excluded }, 'package', 'excluded.json');
  deps.log(`package: ${entries.length} tours, ${new Set(lines).size} audio files, ${Math.round(bytes / 1e6)} MB, ${excluded} excluded`);
  stage.writeReceipt('package', [target, stage.path('package', 'audio.sha256')], { tours: entries.length, authorizationReference: approval.authorizationReference });
  return { tours: entries.length, excluded, audioFiles: new Set(lines).size, bytes };
}

export type { HttpReport };
