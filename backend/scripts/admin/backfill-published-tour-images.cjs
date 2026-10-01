#!/usr/bin/env node
// Add verified Wikimedia images to already-published tours without changing narration or audio.
require('dotenv/config');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prismaClient: db } = require('../../src/infrastructure/db/prismaClient');
const { PostgresTourRepository } = require('../../src/infrastructure/postgres/PostgresTourRepository');
const { enrichTourImages } = require('../../src/services/enrichTourImages');
const { createImageModel } = require('../../src/services/TourImageModel');
const { audioDisclosure } = require('../../src/services/AudioProvenance');
const { admittedToPilot, ownerAuthorized, pilotFingerprint, validatePilotMaterial } = require('../../src/services/PilotRelease');

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const has = name => args.includes(name);
const catalogArgument = value('--catalog');
assert(catalogArgument, 'Use --catalog with an existing publication catalog');
const catalogFile = path.resolve(catalogArgument);
const reportFile = path.resolve(value('--report') || path.join(path.dirname(catalogFile), 'images-backfill.json'));
const city = value('--city');
const language = value('--language');
const concurrency = Number(value('--concurrency') || 2);
const retry = has('--retry');

assert(fs.statSync(catalogFile).isFile(), 'Publication catalog must be a file');
assert(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 6, '--concurrency must be between 1 and 6');
assert(createImageModel(), 'Configure TOUR_IMAGES_MODEL and TOUR_IMAGES_API_KEY before backfilling');

const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
assert(Array.isArray(catalog.tours), 'Invalid catalog');
const selected = catalog.tours.filter(tour => (!city || tour.city === city) && (!language || tour.language === language));
assert(selected.length, 'No tours match the requested filters');

const report = fs.existsSync(reportFile)
  ? JSON.parse(fs.readFileSync(reportFile, 'utf8'))
  : { version: 1, catalog: catalogFile, startedAt: new Date().toISOString(), entries: [] };
assert.equal(report.version, 1, 'Unsupported report version');
assert.equal(report.catalog, catalogFile, 'Report belongs to a different catalog');
const completed = new Set(retry ? [] : report.entries.filter(entry => entry.phase === 'completed').map(entry => entry.tourId));
const queue = selected.filter(tour => !completed.has(tour.id));
const tours = new PostgresTourRepository(db);

async function catalogAudioState(tour) {
  const placeIds = new Set(tour.places.map(place => place.id));
  const assets = catalog.audioAssets.filter(asset => placeIds.has(asset.placeId));
  const intro = catalog.introductionAudios.find(item => item.tourId === tour.id);
  assert.equal(assets.length, tour.places.length, 'Publication catalog audio does not match current stops');
  assert(intro, 'Publication catalog introduction audio missing');

  const persisted = await db.audioAsset.findMany({ where: { placeId: { in: [...placeIds] }, language: tour.language } });
  for (const asset of assets) {
    assert(persisted.some(row => row.placeId === asset.placeId
      && row.metadata?.sourceHash === asset.metadata.sourceHash
      && row.metadata?.fileSha256 === asset.metadata.fileSha256),
    `Published audio provenance changed: ${asset.placeId}`);
  }
  const persistedIntro = await db.tourIntroductionAudio.findMany({ where: { tourId: tour.id, language: tour.language } });
  assert(persistedIntro.some(row => row.metadata?.sourceHash === intro.metadata.sourceHash
    && row.metadata?.fileSha256 === intro.metadata.fileSha256), 'Published introduction audio provenance changed');

  return {
    tourId: tour.id,
    status: 'completed',
    phase: 'completed',
    completedStops: assets.length,
    totalStops: assets.length,
    audioUrls: Object.fromEntries(assets.map(asset => [asset.placeId, '/audio/' + asset.id])),
    audioVersions: Object.fromEntries(assets.map(asset =>
      [asset.placeId, asset.metadata.sourceHash + '.' + asset.metadata.fileSha256])),
    transcripts: Object.fromEntries(tour.places.map(place => [place.id, place.description])),
    introduction: {
      status: 'completed',
      text: [audioDisclosure(tour.language), tour.introduction].join('\n\n'),
      audioUrl: '/audio/' + intro.id,
      version: intro.metadata.sourceHash + '.' + intro.metadata.fileSha256,
      durationSeconds: intro.durationSeconds,
    },
  };
}

function save() {
  const temporary = `${reportFile}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, reportFile);
}

async function enrich(row) {
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ city: row.city, language: row.language, tourId: row.id, phase: 'started' }));
  try {
    const tour = await tours.findById(row.id);
    assert(tour, 'Published tour missing');
    assert.equal(tour.status, 'published');
    assert.equal(tour.city, row.city);
    assert.equal(tour.language, row.language);
    assert(ownerAuthorized(tour), 'Automatic image backfill is limited to owner-authorized releases');
    const descriptions = new Map(tour.places.map(place => [place.id, place.description]));
    const originalPlaces = new Map(tour.places.map(place => [place.id, place]));
    const enriched = await enrichTourImages(tour);
    assert.deepEqual(enriched.places.map(place => place.id), tour.places.map(place => place.id));
    assert(enriched.places.every(place => descriptions.get(place.id) === place.description), 'Narration changed during image selection');
    const state = await catalogAudioState(enriched);
    validatePilotMaterial(enriched, state);
    const release = enriched.metadata?.pilotRelease;
    assert(release, 'Published tour is missing pilot release metadata');
    const fingerprint = pilotFingerprint(enriched, state);
    enriched.metadata = { ...enriched.metadata, pilotRelease: { ...release, fingerprint } };
    assert(admittedToPilot(enriched, state), 'Enriched tour does not satisfy public admission rules');
    await db.$transaction(async tx => {
      const currentTour = await tx.tour.findUniqueOrThrow({ where: { id: tour.id } });
      assert.equal(currentTour.updatedAt.toISOString(), tour.updatedAt, 'Tour changed during image selection; rerun safely');
      for (const place of enriched.places) {
        const current = await tx.place.findUniqueOrThrow({ where: { id: place.id } });
        const original = originalPlaces.get(place.id);
        assert(original, 'Original place missing');
        assert.equal(current.tourId, tour.id);
        assert.equal(current.description, place.description, 'Narration changed before image persistence');
        assert.equal(current.updatedAt.toISOString(), original.updatedAt, 'Place changed during image selection; rerun safely');
        const images = place.metadata.tourImages;
        const metadata = current.metadata || {};
        if (JSON.stringify(metadata.tourImages) === JSON.stringify(images)) continue;
        const updated = await tx.place.updateMany({
          where: { id: place.id, updatedAt: current.updatedAt },
          data: { metadata: { ...metadata, tourImages: images } },
        });
        assert.equal(updated.count, 1, 'Place changed during image update; rerun safely');
      }
      const updatedTour = await tx.tour.updateMany({
        where: { id: tour.id, updatedAt: currentTour.updatedAt },
        data: { metadata: enriched.metadata },
      });
      assert.equal(updatedTour.count, 1, 'Tour changed during fingerprint update; rerun safely');
    });
    const places = enriched.places.map(place => ({
      id: place.id,
      status: place.metadata.tourImages.status,
      reason: place.metadata.tourImages.reason,
      images: place.metadata.tourImages.images.length,
    }));
    const entry = { city: row.city, language: row.language, tourId: row.id, phase: 'completed', startedAt,
      finishedAt: new Date().toISOString(), readyPlaces: places.filter(place => place.status === 'ready').length,
      images: places.reduce((sum, place) => sum + place.images, 0), fingerprintUpdated: true, places };
    report.entries = report.entries.filter(item => item.tourId !== row.id);
    report.entries.push(entry);
    save();
    console.log(JSON.stringify(entry));
  } catch (error) {
    const entry = { city: row.city, language: row.language, tourId: row.id, phase: 'error', startedAt,
      finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    report.entries = report.entries.filter(item => item.tourId !== row.id);
    report.entries.push(entry);
    save();
    console.error(JSON.stringify(entry));
    process.exitCode = 1;
  }
}

async function worker() {
  while (queue.length) await enrich(queue.shift());
}

save();
Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker))
  .then(() => {
    report.finishedAt = new Date().toISOString();
    save();
    const entries = report.entries.filter(entry => selected.some(tour => tour.id === entry.tourId));
    console.log(JSON.stringify({ phase: 'finished', selected: selected.length,
      completed: entries.filter(entry => entry.phase === 'completed').length,
      errors: entries.filter(entry => entry.phase === 'error').length,
      images: entries.reduce((sum, entry) => sum + (entry.images || 0), 0), report: reportFile }));
  })
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
