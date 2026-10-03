// Backfill existing batch tours without recreating places or rendering audio.
// Run from backend with node -r ts-node/register/transpile-only; optional city slug.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { prismaClient: db } = require('../../src/infrastructure/db/prismaClient');
const { PostgresTourRepository } = require('../../src/infrastructure/postgres/PostgresTourRepository');
const { enrichTourImages } = require('../../src/services/enrichTourImages');
const { createImageModel } = require('../../src/services/TourImageModel');
const batch = process.env.BATCH_STAGE || path.resolve(__dirname, '../../tmp/pilot-batch-spain-20260912');
const tours = new PostgresTourRepository(db);

async function main() {
  assert(createImageModel(), 'Configure TOUR_IMAGES_MODEL and TOUR_IMAGES_API_KEY before backfilling');
  const city = process.argv[2];
  const index = JSON.parse(fs.readFileSync(path.join(batch, 'tour-index.json'), 'utf8'));
  const selected = index.filter(row => !city || row.city === city);
  assert(selected.length, 'Unknown batch city slug');
  const reportFile = path.join(batch, `images-${city || 'all'}.json`);
  const report = { startedAt: new Date().toISOString(), entries: [] };
  const persist = () => {
    fs.writeFileSync(reportFile + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(reportFile + '.tmp', reportFile);
  };
  persist();
  for (const entry of selected) {
    console.log(JSON.stringify({ city: entry.city, language: entry.language, phase: 'images_start' }));
    try {
      const tour = await tours.findById(entry.tourId);
      assert(tour, 'Imported tour missing');
      assert.equal(tour.metadata.deepseekAuthor.runId, `pilot-spain-20260912-${entry.city}-${entry.language}`);
      const enriched = await enrichTourImages(tour);
      // Fetch current metadata after the external calls. An optimistic lock prevents
      // losing a simultaneous place edit. Audio assets and narration are untouched.
      await db.$transaction(async tx => {
        for (const place of enriched.places) {
          const current = await tx.place.findUniqueOrThrow({ where: { id: place.id } });
          assert.equal(current.tourId, tour.id);
          assert.equal(current.description, place.description, 'Narration changed during image selection');
          assert.equal(current.metadata.sourcePoi?.wikidata, place.metadata.sourcePoi?.wikidata);
          const images = place.metadata.tourImages;
          if (JSON.stringify(current.metadata.tourImages) === JSON.stringify(images)) continue;
          const updated = await tx.place.updateMany({
            where: { id: place.id, updatedAt: current.updatedAt },
            data: { metadata: { ...current.metadata, tourImages: images } },
          });
          assert.equal(updated.count, 1, 'Place changed during image update; rerun safely');
        }
      });
      const result = { city: entry.city, language: entry.language, tourId: tour.id,
        places: enriched.places.map(p => ({ id: p.id, name: p.name, status: p.metadata.tourImages.status,
          reason: p.metadata.tourImages.reason, images: p.metadata.tourImages.images.length })) };
      report.entries.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      report.entries.push({ ...entry, error: error.message });
      console.error(`${entry.city}:${entry.language}: ${error.message}`);
      process.exitCode = 1;
    }
    persist();
  }
  report.finishedAt = new Date().toISOString();
  persist();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
