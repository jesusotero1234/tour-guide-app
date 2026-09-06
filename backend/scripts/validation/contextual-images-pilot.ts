/**
 * Prepare a 40-paragraph editorial sample without model calls by default.
 * --live enriches ONLY the supplied saved tour, never generates narration or writes the DB.
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Place } from '../../src/domain/entities/Place';
import { splitImageParagraphs } from '../../src/services/ContextualTourImages';
import { enrichTourImages } from '../../src/services/enrichTourImages';
import { createImageModel } from '../../src/services/TourImageModel';

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  if (!args.includes('--input') || !args.includes('--output')) throw new Error('Use --input saved-tour.json --output NEW-report.json [--live]');
  const input = JSON.parse(await readFile(value('--input'), 'utf8'));
  if (!input || typeof input.language !== 'string' || !Array.isArray(input.places)) throw new Error('Expected a saved tour with language and places');
  const places: Place[] = input.places.filter((p: Place) => typeof p?.description === 'string' && typeof p?.name === 'string').slice(0, 12);
  const live = args.includes('--live');
  if (live && !createImageModel()) throw new Error('Configure TOUR_IMAGES_MODEL and TOUR_IMAGES_API_KEY before --live');
  const started = Date.now();
  const tour = live ? await enrichTourImages({ ...input, places }) : { ...input, places };
  const sample = tour.places.flatMap((p: Place) => splitImageParagraphs(p.description).map((text, paragraphIndex) => ({
    place: p.name, entityId: p.metadata?.sourcePoi?.wikidata || null, paragraphIndex, text,
    sourceTextHash: createHash('sha256').update(p.description).digest('hex'),
    imageStatus: live ? p.metadata?.tourImages?.status : 'not-run',
    omissionReason: live ? p.metadata?.tourImages?.reason : 'sample-preparation-only',
    selectedImages: live ? p.metadata?.tourImages?.images.filter(i => i.paragraphIndex === paragraphIndex) || [] : [],
    editorialReview: { correctIdentity: null, usefulView: null, rightsDocumented: null, notes: '' },
  }))).slice(0, 40);
  const report = { createdAt: new Date().toISOString(), source: value('--input'), mode: live ? 'live-images-only' : 'sample-only',
    elapsedMs: Date.now() - started, paragraphCount: sample.length, editorialReviewCompleted: false,
    note: 'Model opinion does not constitute independent editorial/legal validation. Usage billed separately from narration.', sample };
  await writeFile(value('--output'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ mode: report.mode, paragraphCount: sample.length, elapsedMs: report.elapsedMs }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Pilot failed'); process.exitCode = 1; });
