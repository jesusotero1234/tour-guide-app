// Save accepted batch texts with DeepSeek provenance, enrich photos, and render audio.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { prismaClient: db } = require('../../src/infrastructure/db/prismaClient');
const { PostgresTourRepository } = require('../../src/infrastructure/postgres/PostgresTourRepository');
const { TourAudioService } = require('../../src/services/TourAudioService');
const { parseTourBlueprintSnapshot, tourBaseKey } = require('../../src/services/TourBlueprint');
const { buildSourceCredits } = require('../../src/services/SourceCredits');
const { WalkingRouteService } = require('../../src/services/WalkingRouteService');
const { enrichTourImages } = require('../../src/services/enrichTourImages');
const backend = path.resolve(__dirname, '../..');
const batch = path.join(backend, 'tmp/pilot-batch-spain-20260912');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
function uuid(value) {
  const hex = hash(value);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
const tours = new PostgresTourRepository(db), walking = new WalkingRouteService();
// Each language must use its own preset; never inherit a single-language CLI override.
delete process.env.VOXCPM_PRESET_PATH;
const audio = new TourAudioService(db);
async function importTour(city, language) {
  const dir = path.join(batch, city), artifact = read(path.join(dir, 'final', language + '.json'));
  const master = read(path.join(dir, 'final/es.json'));
  const snapshot = parseTourBlueprintSnapshot(read(path.join(dir, 'inputs.json')).snapshot);
  // This batch is for the existing private local review. Preserve source-use statuses;
  // public pilot admission separately requires permitted sources and a human release.
  assert.equal(master.masterSha256, hash(JSON.stringify(ordered(master.pieces))), 'Spanish master hash mismatch');
  assert.equal(artifact.masterSha256, master.masterSha256, 'Translation from a different master');
  assert.equal(artifact.language, language);
  for (const checked of [master, artifact]) {
    assert.equal(checked.review.status, 'SUFFICIENT_IN_REVIEW_SCOPE');
    const evidence = fs.readFileSync(checked.review.artifactPath);
    assert.equal(hash(evidence), checked.review.artifactSha256, 'Review artifact changed');
    const record = JSON.parse(evidence);
    if (checked.language === 'es') assert.equal(record.status, 'SUFFICIENT_IN_REVIEW_SCOPE');
    else {
      assert.equal(record.validation.status, 'OK');
      assert(record.parsed.checks.every(row => row.faithful && row.naturalForListening
        && row.issues.every(issue => issue.severity !== 'major')), 'Translation review failed');
    }
  }
  const stops = snapshot.checkpoint.route.stops;
  assert.deepEqual(artifact.pieces.map(piece => piece.pieceId), ['tour-welcome', ...stops.map(stop => stop.stopId)]);
  assert(artifact.pieces.every(piece => typeof piece.text === 'string' && piece.text.trim() && piece.name.trim()));
  const id = uuid('pilot-spain-20260912:' + city + ':' + language + ':' + artifact.masterSha256);
  const existing = await tours.findById(id);
  if (existing) {
    assert.equal(existing.metadata.deepseekAuthor.masterSha256, artifact.masterSha256);
    assert.deepEqual(existing.places.map(place => place.description), artifact.pieces.slice(1).map(piece => piece.text));
    if (existing.durationMinutes !== snapshot.geometry.guidedDurationMinutes) {
      await db.tour.update({ where: { id }, data: { durationMinutes: snapshot.geometry.guidedDurationMinutes } });
      existing.durationMinutes = snapshot.geometry.guidedDurationMinutes;
    }
    return existing;
  }
  const baseId = uuid('pilot-spain-blueprint:' + snapshot.fingerprint);
  const preparation = path.join(dir, 'preparation.json');
  const budget = fs.existsSync(preparation) ? read(preparation).budget
    : read(path.join(backend, 'tmp/narrative-v8/pilot-spain-20260912-' + city, 'budget.private.json'));
  await db.tourBlueprint.upsert({ where: { id: baseId }, update: {}, create: {
    id: baseId, baseKey: tourBaseKey(snapshot.destination, snapshot.checkpoint.route) + ':pilot-spain-20260912',
    revision: 1, status: 'ready', snapshot: JSON.stringify(snapshot),
    revalidateAfter: new Date(Date.now() + 30 * 86400000), attemptCount: 1,
    spendLimitUsd: 2, accountedSpendUsd: budget.spentUsd,
  } });
  const places = stops.map((stop, index) => ({
    id: uuid(id + ':' + stop.stopId), tourId: id, name: stop.name,
    nameInTourLanguage: artifact.pieces[index + 1].name, description: artifact.pieces[index + 1].text,
    latitude: stop.coordinates.lat, longitude: stop.coordinates.lng, position: index,
    metadata: { sourcePoi: { wikidata: stop.wikidataId }, sourceCredits: buildSourceCredits(snapshot, stop.stopId) },
  }));
  const routeFile = path.join(dir, 'walking-route.json');
  if (!fs.existsSync(routeFile)) save(routeFile, await walking.getRoute(places));
  const now = new Date().toISOString();
  return tours.save(await enrichTourImages({ id, blueprintId: baseId, city: snapshot.destination.city, country: 'España', countryCode: 'ES',
    theme: 'history', language, durationMinutes: snapshot.geometry.guidedDurationMinutes, status: 'published',
    introduction: artifact.pieces[0].text, places, createdAt: now, updatedAt: now,
    metadata: { generationPipeline: 'deepseek-max-low-master-translation-pilot-1',
      pilotWalkingRoute: read(routeFile), deepseekAuthor: { runId: 'pilot-spain-20260912-' + city + '-' + language,
        model: 'deepseek-v4-flash', sourceLanguage: 'es', masterSha256: artifact.masterSha256,
        reviewStatus: artifact.review.status, reviewArtifactSha256: artifact.review.artifactSha256,
        blueprintFingerprint: snapshot.fingerprint, durationFit: snapshot.geometry.durationFit,
        guidedDurationMinutes: snapshot.geometry.guidedDurationMinutes } } }));
}
async function render(tour, entry, persist) {
  let state = await audio.get(tour.id);
  if (state.status !== 'completed') state = await audio.create(tour.id);
  let lastProgress = '';
  while (state.status !== 'completed') {
    if (['failed', 'unavailable'].includes(state.status)) throw Error(state.error?.code + ': ' + state.error?.message);
    const progress = [state.phase, state.completedStops, state.completedChunks].join(':');
    if (progress !== lastProgress) {
      entry.audio = { status: state.status, phase: state.phase, completedStops: state.completedStops, totalStops: state.totalStops,
        completedChunks: state.completedChunks, totalChunks: state.totalChunks };
      persist();
      lastProgress = progress;
    }
    await delay(5000);
    state = await audio.get(tour.id);
  }
  const assets = await db.audioAsset.findMany({ where: { placeId: { in: tour.places.map(place => place.id) }, language: tour.language } });
  entry.audio = { status: state.status, completedStops: state.completedStops, totalStops: state.totalStops,
    audioUrls: state.audioUrls, audioVersions: state.audioVersions,
    renderedSeconds: assets.reduce((sum, asset) => sum + (asset.durationSeconds ?? 0), 0) };
  entry.completedAt = new Date().toISOString();
  persist();
}
async function main() {
  const manifest = read(path.join(batch, 'manifest.json'));
  if (process.argv.includes('--import-only')) {
    for (const city of manifest.cities) for (const language of manifest.languages) {
      if (!fs.existsSync(path.join(batch, city.slug, 'final', language + '.json'))) continue;
      const tour = await importTour(city.slug, language);
      console.log(JSON.stringify({ city: city.slug, language, tourId: tour.id, phase: 'imported' }));
    }
    return;
  }
  const stateFile = path.join(batch, 'delivery.json');
  const state = fs.existsSync(stateFile) ? read(stateFile) : { entries: {}, expectedVersions: 55 };
  const persist = () => save(stateFile, { ...state, updatedAt: new Date().toISOString() });
  const all = manifest.cities.flatMap(city => manifest.languages.map(language => ({ city: city.slug, language, key: city.slug + ':' + language })));
  const attempted = new Set();
  const watch = process.argv.includes('--watch');
  const start = Date.now();
  while (true) {
    let handled = false;
    for (const item of all) {
      if (attempted.has(item.key)) continue;
      if (!fs.existsSync(path.join(batch, item.city, 'final', item.language + '.json'))) continue;
      attempted.add(item.key);
      handled = true;
      const entry = state.entries[item.key] ??= { city: item.city, language: item.language };
      try {
        const tour = await importTour(item.city, item.language);
        Object.assign(entry, { tourId: tour.id, reviewUrl: 'http://localhost:3100/tours/' + tour.id,
          plannedMinutes: tour.metadata.deepseekAuthor.guidedDurationMinutes, stops: tour.places.length });
        persist();
        console.log(JSON.stringify({ city: item.city, language: item.language, tourId: tour.id, phase: 'audio_start' }));
        await render(tour, entry, persist);
        delete entry.error;
        console.log(JSON.stringify({ city: item.city, language: item.language, phase: 'complete', renderedSeconds: entry.audio.renderedSeconds }));
      } catch (error) { entry.error = error.message; console.error(item.key + ': ' + error.message); persist(); }
    }
    const textStateFile = path.join(batch, 'text-batch-state.json');
    const textState = fs.existsSync(textStateFile) ? read(textStateFile) : null;
    const madridSummary = path.join(batch, 'madrid/summary.json');
    const madridFinished = fs.existsSync(madridSummary) && read(madridSummary).invocationSeconds !== undefined;
    const textFinished = madridFinished && textState && !textState.pending.length && !textState.running.length;
    if (!watch || attempted.size === all.length || (textFinished && !handled)) break;
    if (Date.now() - start > 12 * 3600000) throw Error('Batch watch deadline reached; saved work retained');
    await delay(10000);
  }
  persist();
  if (Object.values(state.entries).some(entry => entry.error) || Object.keys(state.entries).length !== 55) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
