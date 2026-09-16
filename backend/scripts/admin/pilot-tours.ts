import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { prismaClient as db } from '../../src/infrastructure/db/prismaClient';
import { PostgresTourRepository } from '../../src/infrastructure/postgres/PostgresTourRepository';
import { PostgresTourBlueprintRepository } from '../../src/infrastructure/postgres/PostgresTourBlueprintRepository';
import { tourAudioService as audio } from '../../src/services/tourAudioServiceInstance';
import { WalkingRouteService } from '../../src/services/WalkingRouteService';
import { assertBlueprintSources, buildSourceCredits } from '../../src/services/SourceCredits';
import { SOURCE_POLICY_VERSION, sourceUse } from '../../src/services/poi/SourceUsePolicy';
import { admittedToPilot, pilotFingerprint, validatePilotMaterial, PilotRelease } from '../../src/services/PilotRelease';
import { sha256 } from '../../src/services/AudioProvenance';

// Staff-only local CLI. No action approves material without an explicit human review file.
const tours = new PostgresTourRepository(db), bases = new PostgresTourBlueprintRepository(db);
const include = { places: { orderBy: { position: 'asc' as const }, include: { audioAssets: true } }, blueprint: true };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function main() {
  const [command = 'audit', id, file] = process.argv.slice(2);
  if (!['audit','prepare','review','approve','withdraw'].includes(command)) throw Error('Use audit | prepare TOUR_ID | review TOUR_ID | approve TOUR_ID REVIEW.json | withdraw TOUR_ID');
  if (command === 'audit') {
    const rows = await db.tour.findMany({ include, orderBy: { createdAt: 'asc' } });
    for (const row of rows) {
      const issues: string[] = [];
      if (!row.blueprint) issues.push('BLUEPRINT_MISSING');
      try {
        const raw = row.blueprint?.snapshot;
        const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const handoff of snapshot?.checkpoint?.research ?? []) {
          for (const capture of handoff.result?.captures ?? []) {
            for (const url of [capture.requestedUrl, capture.finalUrl]) {
              if (sourceUse(url).status !== 'permitted') issues.push('SOURCE_PENDING:' + capture.sourceId);
            }
          }
        }
        const tour = await tours.findById(row.id);
        if (!tour) throw Error('TOUR_MISSING');
        if (!row.blueprint || !await bases.isCurrent(row.blueprint.id)) issues.push('BLUEPRINT_NOT_CURRENT');
        const base = row.blueprint ? await bases.findById(row.blueprint.id) : null;
        if (base?.snapshot) assertBlueprintSources(base.snapshot);
        validatePilotMaterial(tour, await audio.get(row.id, true));
        if (!admittedToPilot(tour, await audio.get(row.id, true))) issues.push('HUMAN_REVIEW_REQUIRED');
      } catch (error) {
        issues.push(error instanceof Error ? error.message.split('\n')[0].slice(0,160) : 'REVIEW_REQUIRED');
      }
      console.log(JSON.stringify({ tourId: row.id, city: row.city, language: row.language, issues: [...new Set(issues)] }));
    }
    return;
  }
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw Error('Valid TOUR_ID required');
  const before = await db.tour.findUnique({ where: { id }, include });
  const tour = await tours.findById(id);
  if (!before || !tour) throw Error('TOUR_MISSING');
  const metadata = { ...tour.metadata };
  if (command === 'withdraw') {
    if (!metadata.pilotRelease) throw Error('NO_RELEASE_TO_WITHDRAW');
    metadata.pilotRelease = { ...metadata.pilotRelease, status: 'withdrawn' };
  } else {
    if (!tour.blueprintId || !await bases.isCurrent(tour.blueprintId)) throw Error('BLUEPRINT_NOT_CURRENT');
    const base = await bases.findById(tour.blueprintId);
    if (!base?.snapshot || tour.metadata?.codexAuthor?.blueprintFingerprint !== base.snapshot.fingerprint) throw Error('BLUEPRINT_MISMATCH');
    assertBlueprintSources(base.snapshot);
    for (const place of tour.places) {
      const credits = buildSourceCredits(base.snapshot, place.metadata?.sourcePoi?.wikidata ?? '');
      if (command === 'prepare') place.metadata = { ...place.metadata, sourceCredits: credits };
      else {
        const saved = place.metadata?.sourceCredits;
        if (!saved || saved.version !== credits.version || saved.items.length !== credits.items.length
          || credits.items.some(c => !saved.items.some(s => Object.entries(c).every(([k,v]) => s[k as keyof typeof s] === v)))) throw Error('RUN_PREPARE_FOR_CURRENT_CREDITS');
      }
    }
    if (command === 'prepare') {
      metadata.pilotWalkingRoute = await new WalkingRouteService().getRoute(tour.places);
      if (metadata.pilotRelease) metadata.pilotRelease = { ...metadata.pilotRelease, status: 'withdrawn' };
    } else {
      const state = await audio.get(id, true);
      validatePilotMaterial(tour, state);
      const fingerprint = pilotFingerprint(tour, state);
      if (command === 'review') {
        console.log(JSON.stringify({ tourId: id, fingerprint, introduction: tour.introduction,
          route: metadata.pilotWalkingRoute, places: tour.places.map(p => ({ id: p.id, name: p.name,
            text: p.description, sources: p.metadata?.sourceCredits, images: p.metadata?.tourImages,
            audioUrl: state.audioUrls[p.id], audioVersion: state.audioVersions?.[p.id], transcript: state.transcripts?.[p.id] })),
          review: { reviewedBy: '', reviewedAt: '', fingerprint, changes: '', checks: { text: false, audio: false, route: false, rights: false } }
        }, null, 2));
        return;
      }
      if (!file) throw Error('Explicit human review JSON file required');
      const input = await readFile(file, 'utf8');
      if (input.length > 32768) throw Error('REVIEW_TOO_LARGE');
      const review = JSON.parse(input);
      const release: PilotRelease = { version: 1, status: 'approved', sourcePolicy: SOURCE_POLICY_VERSION,
        scriptLicense: 'CC BY-SA 4.0', reviewedBy: review.reviewedBy, reviewedAt: review.reviewedAt,
        changes: review.changes, checks: review.checks, fingerprint: review.fingerprint };
      tour.metadata = { ...metadata, pilotRelease: release };
      if (!admittedToPilot(tour, state) || release.fingerprint !== fingerprint) throw Error('REVIEW_INCOMPLETE_OR_CHANGED');
      metadata.pilotRelease = release;
    }
  }
  // Compare all persisted material inside a serializable transaction; concurrent edits abort approval.
  await db.$transaction(async tx => {
    const current = await tx.tour.findUnique({ where: { id }, include });
    if (sha256(JSON.stringify(current)) !== sha256(JSON.stringify(before))) throw Error('MATERIAL_CHANGED_RETRY_REVIEW');
    if (command === 'prepare') {
      for (const place of tour.places) await tx.place.update({ where: { id: place.id }, data: { metadata: json(place.metadata) } });
    }
    await tx.tour.update({ where: { id }, data: { metadata: json(metadata) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.log(JSON.stringify({ tourId: id, action: command, status: metadata.pilotRelease?.status ?? 'pending-review' }));
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Pilot administration failed');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
