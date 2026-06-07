import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOUR_ID = '11111111-1111-1111-1111-111111111111';
const PLACE_1_ID = '22222222-2222-2222-2222-222222222221';
const PLACE_2_ID = '22222222-2222-2222-2222-222222222222';
const AUDIO_ID = '33333333-3333-3333-3333-333333333333';
const JOB_ID = '44444444-4444-4444-4444-444444444444';

async function main() {
  // Deterministic cleanup for reruns
  await prisma.audioAsset.deleteMany({ where: { id: AUDIO_ID } });
  await prisma.generationJob.deleteMany({ where: { id: JOB_ID } });
  await prisma.place.deleteMany({ where: { id: { in: [PLACE_1_ID, PLACE_2_ID] } } });
  await prisma.tour.deleteMany({ where: { id: TOUR_ID } });

  await prisma.tour.create({
    data: {
      id: TOUR_ID,
      city: 'Valencia',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'architecture',
      language: 'en',
      durationMinutes: 120,
      status: 'created',
      metadata: {
        source: 'phase-2.1-seed',
      },
      places: {
        create: [
          {
            id: PLACE_1_ID,
            name: 'Valencia Cathedral',
            description: 'Historic cathedral in the heart of Valencia.',
            latitude: 39.4756,
            longitude: -0.3754,
            position: 0,
            importanceScore: 0.92,
            imageUrl: 'https://example.local/images/valencia-cathedral.jpg',
          },
          {
            id: PLACE_2_ID,
            name: 'La Lonja de la Seda',
            description: 'Late Gothic civil building and UNESCO site.',
            latitude: 39.4744,
            longitude: -0.3781,
            position: 1,
            importanceScore: 0.89,
            imageUrl: 'https://example.local/images/lonja-seda.jpg',
          },
        ],
      },
      generationJobs: {
        create: [
          {
            id: JOB_ID,
            status: 'completed',
            step: 'persist_tour',
            startedAt: new Date('2026-01-01T10:00:00.000Z'),
            finishedAt: new Date('2026-01-01T10:01:00.000Z'),
          },
        ],
      },
    },
  });

  await prisma.audioAsset.create({
    data: {
      id: AUDIO_ID,
      placeId: PLACE_1_ID,
      language: 'en',
      format: 'wav',
      storagePath: 'local-audio/valencia/cathedral-en.wav',
      durationSeconds: 68,
      metadata: {
        source: 'phase-2.1-seed',
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
