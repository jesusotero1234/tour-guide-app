const fs = require('node:fs');
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const db = new PrismaClient();
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dates = row => ({ ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) });

(async () => {
  try {
    await db.$transaction(async tx => {
      const before = {
        tours: await tx.tour.count(), places: await tx.place.count(),
        audioAssets: await tx.audioAsset.count(), introductions: await tx.tourIntroductionAudio.count(),
      };
      if (JSON.stringify(before) !== JSON.stringify({ tours: 66, places: 483, audioAssets: 483, introductions: 66 })) {
        throw Error('Unexpected production catalogue: ' + JSON.stringify(before));
      }
      if (await tx.tour.count({ where: { id: { in: data.tours.map(row => row.id) } } })) {
        throw Error('Europe tour IDs already exist');
      }
      await tx.tour.createMany({ data: data.tours.map(dates) });
      await tx.place.createMany({ data: data.places.map(dates) });
      await tx.audioAsset.createMany({ data: data.audioAssets.map(dates) });
      await tx.tourIntroductionAudio.createMany({ data: data.introductionAudios.map(dates) });
    }, { timeout: 120000 });
    console.log(JSON.stringify({ addedTours: data.tours.length, addedStops: data.places.length,
      addedAudio: data.audioAssets.length, addedIntroductions: data.introductionAudios.length }));
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
