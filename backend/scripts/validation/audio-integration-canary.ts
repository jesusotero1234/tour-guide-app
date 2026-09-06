/** Create a marked, one-stop fixture from the approved Sevilla narration. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';

async function main() {
  const client = new PrismaClient();
  try {
    const text = (await readFile(resolve('../backend/tmp/tts-voxcpm2/sevilla-voice-a-20260906/source.txt'), 'utf8')).trim();
    const tour = await client.tour.create({ data: {
      city: 'Sevilla', country: 'España', countryCode: 'ES', theme: 'history', language: 'es',
      durationMinutes: 15, status: 'review',
      introduction: 'Prueba de integración de audio: Reales Alcázares.',
      metadata: { audioIntegrationCanary: true, codexAuthor: { findingCount: 0, languageFindingCount: 0, narrationMinutes: 5 } },
      places: { create: [{
        name: 'Reales Alcázares de Sevilla', description: text, latitude: 37.383, longitude: -5.991,
        position: 0, metadata: {},
      }] },
    }, include: { places: true } });
    const info = { tourId: tour.id, placeId: tour.places[0].id, words: text.split(/\s+/).length,
      url: 'http://127.0.0.1:8186/tours/' + tour.id };
    await mkdir(resolve('tmp/tts-voxcpm2/ui-integration'), { recursive: true });
    await writeFile(resolve('tmp/tts-voxcpm2/ui-integration/canary.json'), JSON.stringify(info, null, 2));
    console.log(JSON.stringify(info));
  } finally { await client.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
