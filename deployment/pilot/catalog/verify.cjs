const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const { PostgresTourRepository } = require('./backend/dist/infrastructure/postgres/PostgresTourRepository');
const { TourAudioService } = require('./backend/dist/services/TourAudioService');
const { admittedToPilot } = require('./backend/dist/services/PilotRelease');
const db = new PrismaClient();
const repo = new PostgresTourRepository(db);
const audio = new TourAudioService(db);
const expected = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

(async () => {
  try {
    assert.deepEqual({
      tours: await db.tour.count(), places: await db.place.count(),
      audioAssets: await db.audioAsset.count(), introductions: await db.tourIntroductionAudio.count(),
    }, { tours: 216, places: 1653, audioAssets: 1653, introductions: 216 });
    const groups = await db.tour.groupBy({ by: ['language'], _count: { _all: true } });
    assert.deepEqual(Object.fromEntries(groups.map(row => [row.language, row._count._all])),
      { es: 52, en: 41, fr: 41, de: 41, it: 41 });
    const exact = new Map(expected.tours.map(row => [row.id, row]));
    let admitted = 0, stops = 0;
    for (const row of await db.tour.findMany({ select: { id: true } })) {
      const tour = await repo.findById(row.id);
      const state = await audio.get(row.id, true);
      assert(admittedToPilot(tour, state), 'Rejected ' + row.id);
      admitted += 1;
      stops += state.completedStops;
      const wanted = exact.get(row.id);
      if (!wanted) continue;
      assert.equal(tour.city, wanted.city);
      assert.equal(tour.countryCode, wanted.countryCode);
      assert.equal(tour.language, wanted.language);
      assert.equal(tour.introduction, wanted.introduction);
      assert.equal(tour.metadata.catalogTitle, wanted.metadata.catalogTitle);
      assert.deepEqual(tour.metadata.pilotWalkingRoute, wanted.metadata.pilotWalkingRoute);
      const wantedPlaces = expected.places.filter(place => place.tourId === row.id).sort((a, b) => a.position - b.position);
      assert.equal(tour.places.length, wantedPlaces.length);
      tour.places.forEach((place, index) => {
        assert.equal(place.id, wantedPlaces[index].id);
        assert.equal(place.description, wantedPlaces[index].description);
        assert.equal(place.latitude, wantedPlaces[index].latitude);
        assert.equal(place.longitude, wantedPlaces[index].longitude);
        assert.equal(place.nameInTourLanguage, wantedPlaces[index].metadata.nameInTourLanguage);
      });
      assert.equal(state.status, 'completed');
      assert(state.introduction);
    }
    assert.equal(admitted, 216);
    assert.equal(stops, 1653);
    console.log(JSON.stringify({ admittedTours: admitted, completedStops: stops, exactNewTours: exact.size }));
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
