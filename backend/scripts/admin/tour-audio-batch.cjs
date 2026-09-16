// Closed, resumable inventory: introductions and every real stop, without editing tour text.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const { TourAudioService } = require('../../src/services/TourAudioService');
const { verifiedAudio, audioHash } = require('../../src/services/IntroductionAudio');
const { runLocalVoxCpm, readRenderProgress } = require('../../src/services/LocalVoxCpmRenderer');
const { inventoryFrench, finalizeFrench } = require('./french-audio-replacement.cjs');

const command = process.argv[2];
const directory = path.resolve(process.argv[3] || 'tmp/introduction-audio-20260912');
const manifestPath = path.join(directory, 'manifest.json'), statePath = path.join(directory, 'state.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
const storageDir = path.resolve(process.env.AUDIO_STORAGE_PATH || './data/audio');
delete process.env.VOXCPM_PRESET_PATH; // Each language uses its own pinned voice.
const db = new PrismaClient();
const audio = new TourAudioService(db);
const fingerprint = snapshot => audioHash(JSON.stringify({ language: snapshot.language, identity: snapshot.identity,
  stops: snapshot.stops, introductionText: snapshot.introductionText }));
const metadata = (entry, piece, jobId, digest) => ({ provider: 'VoxCPM2', voice: 'A',
  rendererKey: entry.rendererKey, sourceHash: piece.sourceHash, audioJobId: jobId,
  fileSha256: digest, identity: entry.identity, composition: 'independent-introduction-v1' });

async function inventory() {
  if (fs.existsSync(manifestPath)) throw Error('Manifest already exists; use dry-run or resume.');
  const settings = read(path.join(os.homedir(), '.cache/tour-guide-preview/settings.json'));
  const ids = settings.review_tour.split(',').filter(id => id !== 'b1fbcc6c-22ca-4795-9ee2-b1292fc3dfb0');
  if (ids.length !== 55 || new Set(ids).size !== 55 || !ids.includes('5b393fef-f58b-5e42-861e-b3baafbb3a8a')) throw Error('Unexpected selection');
  const entries = [];
  for (const id of ids) {
    const tour = await db.tour.findUniqueOrThrow({ where: { id } });
    const snapshot = await audio.snapshot(id, true);
    if (!snapshot.introductionText) throw Error('Missing introduction: ' + id);
    entries.push({ tourId: id, city: tour.city, language: tour.language, fingerprint: fingerprint(snapshot),
      rendererKey: snapshot.rendererKey, identity: snapshot.identity,
      previousIntroductionAudioId: tour.metadata?.introductionAudioId ?? null,
      previousFirstAudioVersion: (await audio.get(id, true)).audioVersions?.[snapshot.stops[0].id] ?? null,
      pieces: [{ id: randomUUID(), kind: 'introduction', text: snapshot.introductionText, sourceHash: snapshot.introductionHash },
        ...snapshot.stops.map(stop => ({ ...stop, kind: 'stop', sourceHash: snapshot.hashes[stop.id] }))] });
  }
  if (new Set(entries.map(e => e.city + ':' + e.language)).size !== 55) throw Error('Duplicate city/language');
  // First one tour per language, then the remaining cities grouped by language.
  entries.sort((a, b) => a.language.localeCompare(b.language) || a.city.localeCompare(b.city));
  const languages = new Set(), canaries = [], rest = [];
  for (const entry of entries) {
    if (languages.has(entry.language)) rest.push(entry);
    else { languages.add(entry.language); canaries.push(entry); }
  }
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, scope: 'all-audio', createdAt: new Date().toISOString(),
    entries: [...canaries, ...rest] }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ manifestPath, tours: entries.length, pieces: entries.reduce((n, e) => n + e.pieces.length, 0) }));
}

async function available(entry, piece) {
  const rows = piece.kind === 'introduction'
    ? await db.tourIntroductionAudio.findMany({ where: { tourId: entry.tourId, language: entry.language }, orderBy: { createdAt: 'desc' } })
    : await db.audioAsset.findMany({ where: { placeId: piece.id, language: entry.language }, orderBy: { createdAt: 'desc' } });
  for (const row of rows) if (await verifiedAudio(row, storageDir,
    { language: entry.language, rendererKey: entry.rendererKey, sourceHash: piece.sourceHash })) return row;
  return null;
}

function validateDecoded(file) {
  const python = process.env.VOXCPM_PYTHON || path.resolve(__dirname, '../../../pods/voxcpm-pod/.venv/bin/python');
  const code = 'import sys,soundfile as sf,numpy as np; a,r=sf.read(sys.argv[1],dtype="float32"); assert a.size and r>0 and np.isfinite(a).all() and np.max(np.abs(a))>1e-4; print(len(a)/r)';
  const seconds = Number(execFileSync(python, ['-c', code, file], { encoding: 'utf8', timeout: 60000 }));
  if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Invalid decoded audio duration');
  return seconds;
}

async function activate(entry, states) {
  const intro = states[entry.pieces[0].id], first = states[entry.pieces[1].id];
  if (!intro?.assetId || !first?.assetId) return false;
  if (fingerprint(await audio.snapshot(entry.tourId, true)) !== entry.fingerprint) throw Error('SOURCE_CHANGED: activation refused');
  for (const piece of entry.pieces.slice(0, 2)) if (!await available(entry, piece)) return false;
  await db.$transaction(async tx => {
    // Serialize activation with tour edits and preserve all unrelated metadata.
    await tx.$queryRaw`SELECT id FROM tours WHERE id = ${entry.tourId}::uuid FOR UPDATE`;
    const tour = await tx.tour.findUniqueOrThrow({ where: { id: entry.tourId }, include: { places: { orderBy: { position: 'asc' } } } });
    if (tour.language !== entry.language || !tour.introduction?.trim()
      || entry.pieces[0].text.split('\n\n').slice(1).join('\n\n') !== tour.introduction.trim()
      || tour.places.length !== entry.pieces.length - 1
      || tour.places.some((p, i) => p.id !== entry.pieces[i + 1].id || p.description.trim() !== entry.pieces[i + 1].text)) throw Error('SOURCE_CHANGED: activation refused');
    const row = await tx.tourIntroductionAudio.findUniqueOrThrow({ where: { id: intro.assetId } });
    await tx.tourIntroductionAudio.update({ where: { id: row.id }, data: { metadata: { ...row.metadata,
      firstAudioAssetId: first.assetId, previousIntroductionAudioId: entry.previousIntroductionAudioId,
      previousFirstAudioVersion: entry.previousFirstAudioVersion } } });
    if (tour.metadata?.introductionAudioId !== row.id) await tx.tour.update({ where: { id: tour.id },
      data: { metadata: { ...tour.metadata, introductionAudioId: row.id } } });
  });
  return true;
}

async function run(manifest) {
  if (await db.generationJob.count({ where: { status: { in: ['queued', 'running'] } } })) throw Error('Text generation is still active');
  const digest = audioHash(fs.readFileSync(manifestPath));
  const state = fs.existsSync(statePath) ? read(statePath) : { manifestSha256: digest, entries: {} };
  if (state.manifestSha256 !== digest) throw Error('Manifest changed');
  Object.assign(state, { status: 'running', pid: process.pid, startedAt: state.startedAt || new Date().toISOString() });
  const persist = () => save(statePath, { ...state, updatedAt: new Date().toISOString() });
  persist();
  for (const entry of manifest.entries) {
    const current = state.entries[entry.tourId] ??= { city: entry.city, language: entry.language, pieces: {} };
    state.currentTourId = entry.tourId;
    try {
      if (fingerprint(await audio.snapshot(entry.tourId, true)) !== entry.fingerprint) throw Error('SOURCE_CHANGED: manifest no longer matches');
      // Recover files even if the previous renderer/parent stopped after a completed piece.
      async function ingest(job) {
        const progress = await readRenderProgress(path.join(directory, 'jobs', job.id));
        current.progress = progress && { phase: progress.phase, completedChunks: progress.completedChunks,
          totalChunks: progress.totalChunks, currentSegmentId: progress.currentStopId };
        for (const row of progress?.results || []) {
          const piece = entry.pieces.find(p => p.id === row.id);
          if (!piece || !job.ids.includes(row.id) || row.filename !== row.id + '.mp3'
            || row.modelRevision !== entry.identity.modelRevision) throw Error('Invalid render provenance');
          if (current.pieces[piece.id]?.status === 'completed') continue;
          const storagePath = 'voxcpm2/' + job.id + '/' + row.filename, file = path.join(storageDir, storagePath);
          const sha = audioHash(fs.readFileSync(file));
          if (sha !== row.sha256) throw Error('File hash mismatch');
          const seconds = validateDecoded(file);
          const prior = await available(entry, piece);
          const data = { language: entry.language, format: 'mp3', storagePath, durationSeconds: Math.round(seconds), metadata: metadata(entry, piece, job.id, sha) };
          const asset = prior || (piece.kind === 'introduction'
            ? await db.tourIntroductionAudio.create({ data: { ...data, tourId: entry.tourId } })
            : await db.audioAsset.create({ data: { ...data, placeId: piece.id } }));
          current.pieces[piece.id] = { status: 'completed', assetId: asset.id, seconds, storagePath: asset.storagePath };
          persist();
          console.log(JSON.stringify({ phase: 'piece_completed', city: entry.city, language: entry.language, kind: piece.kind, id: piece.id, seconds }));
        }
      }
      // Revalidate completed database records before trusting saved progress.
      for (const piece of entry.pieces) {
        const prior = await available(entry, piece);
        current.pieces[piece.id] = prior ? { status: 'completed', assetId: prior.id, storagePath: prior.storagePath,
          seconds: prior.durationSeconds, reused: true } : { status: 'pending' };
      }
      for (const job of current.jobs || []) await ingest(job);
      for (let attempt = 1; attempt <= 3; attempt++) {
        const missing = entry.pieces.filter(p => current.pieces[p.id]?.status !== 'completed');
        if (!missing.length) break;
        const job = { id: randomUUID(), ids: missing.map(p => p.id), attempt, startedAt: new Date().toISOString() };
        (current.jobs ??= []).push(job);
        for (const piece of missing) current.pieces[piece.id] = { status: 'running', jobId: job.id };
        persist();
        console.log(JSON.stringify({ phase: 'rendering', city: entry.city, language: entry.language, pieces: missing.length, attempt }));
        let finished = false, failure;
        const rendering = runLocalVoxCpm({ language: entry.language, identity: entry.identity, stops: missing.map(({ id, text }) => ({ id, text })) },
          path.join(directory, 'jobs', job.id), path.join(storageDir, 'voxcpm2', job.id))
          .catch(error => { failure = error; }).finally(() => { finished = true; });
        let ingestionError;
        while (!finished) {
          await delay(3000);
          try { await ingest(job); persist(); } catch (error) { ingestionError = error; }
        }
        await rendering;
        await ingest(job);
        if (ingestionError) throw ingestionError;
        if (failure) {
          job.error = failure.message;
          persist();
          if (attempt < 3) await delay(30000 * attempt);
        }
      }
      const deferActivation = manifest.scope === 'replace-french-audio';
      current.activated = deferActivation ? false : await activate(entry, current.pieces);
      current.status = entry.pieces.every(p => current.pieces[p.id]?.status === 'completed') && (deferActivation || current.activated) ? 'completed' : 'failed';
      for (const piece of entry.pieces) if (current.pieces[piece.id]?.status !== 'completed') current.pieces[piece.id].status = 'failed';
      delete current.error;
    } catch (error) { current.status = 'failed'; current.error = error.message; console.error(entry.tourId + ': ' + error.message); }
    persist();
  }
  state.status = Object.values(state.entries).every(e => e.status === 'completed') ? 'completed' : 'completed_with_errors';
  if (manifest.scope === 'replace-french-audio' && state.status === 'completed') {
    state.status = 'activating';
    persist();
    try {
      await finalizeFrench({ db, audio, directory, storageDir, manifest, state, activate, save, fingerprint });
      for (const entry of Object.values(state.entries)) entry.activated = true;
      state.status = 'completed';
    } catch (error) {
      state.status = 'activation_failed';
      state.error = error.message;
      process.exitCode = 1;
    }
  }
  state.finishedAt = new Date().toISOString();
  delete state.currentTourId;
  persist();
  status(manifest, state);
}

function status(manifest, state) {
  const pieces = Object.values(state?.entries || {}).flatMap(e => Object.values(e.pieces || {}));
  console.log(JSON.stringify({ status: state?.status || 'not_started', pid: state?.pid, directory,
    tours: manifest.entries.length, completedTours: Object.values(state?.entries || {}).filter(e => e.status === 'completed').length,
    totalPieces: manifest.entries.reduce((n, e) => n + e.pieces.length, 0), completedPieces: pieces.filter(p => p.status === 'completed').length,
    failedTours: Object.values(state?.entries || {}).filter(e => e.status === 'failed').length, currentTourId: state?.currentTourId }, null, 2));
}

async function main() {
  if (command === 'inventory') return inventory();
  if (command === 'inventory-fr') {
    const manifest = await inventoryFrench({ db, audio, directory, save, fingerprint });
    return console.log(JSON.stringify({ manifestPath, tours: manifest.entries.length,
      pieces: manifest.entries.reduce((n, entry) => n + entry.pieces.length, 0) }));
  }
  const manifest = read(manifestPath);
  if (manifest.scope === 'replace-french-audio') {
    const expectedPreset = path.resolve(__dirname, '../../../pods/voxcpm-pod/presets/guide-fr-documentary-serene.json');
    if (manifest.presetPath !== expectedPreset || audioHash(fs.readFileSync(expectedPreset)) !== manifest.presetSha256
      || !manifest.entries.length || manifest.entries.some(entry => entry.language !== 'fr')) throw Error('Invalid French replacement manifest');
    process.env.VOXCPM_PRESET_PATH = expectedPreset;
  }
  if (command === 'status') return status(manifest, fs.existsSync(statePath) ? read(statePath) : null);
  if (command === 'dry-run') {
    let reusable = 0;
    for (const entry of manifest.entries) {
      if (fingerprint(await audio.snapshot(entry.tourId, true)) !== entry.fingerprint) throw Error('SOURCE_CHANGED: ' + entry.tourId);
      for (const piece of entry.pieces) if (await available(entry, piece)) reusable++;
    }
    return console.log(JSON.stringify({ tours: manifest.entries.length, totalPieces: manifest.entries.reduce((n, e) => n + e.pieces.length, 0), reusable }));
  }
  if (!['run', 'resume'].includes(command)) throw Error('Use inventory | dry-run | run | resume | status [directory]');
  if (!process.env.TOUR_AUDIO_BATCH_LOCKED) {
    const child = spawnSync('flock', ['-n', path.join(directory, 'run.lock'), process.execPath, '-r', 'ts-node/register/transpile-only', __filename, command, directory],
      { stdio: 'inherit', env: { ...process.env, TOUR_AUDIO_BATCH_LOCKED: '1' } });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
    return;
  }
  await run(manifest);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
