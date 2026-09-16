// French replacement policy for tour-audio-batch.cjs; rendering stays in that runner.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { audioHash, verifiedAudio } = require('../../src/services/IntroductionAudio');
const presetDirectory = path.resolve(__dirname, '../../../pods/voxcpm-pod/presets');
const approvedPath = path.join(presetDirectory, 'guide-fr-documentary-serene.json');
const defaultPath = path.join(presetDirectory, 'guide-fr-a.json');
const validStoragePath = /^voxcpm2\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/;

async function otherLanguagesHash(db) {
  const where = { language: { not: 'fr' } }, orderBy = { id: 'asc' };
  const [stops, introductions] = await Promise.all([
    db.audioAsset.findMany({ where, orderBy }), db.tourIntroductionAudio.findMany({ where, orderBy }),
  ]);
  return audioHash(JSON.stringify({ stops, introductions }));
}

async function inventoryFrench({ db, audio, directory, fingerprint }) {
  const manifestPath = path.join(directory, 'manifest.json');
  if (fs.existsSync(manifestPath)) throw Error('Manifest exists; resume the existing batch');
  if (await db.generationJob.count({ where: { status: { in: ['queued', 'running'] } } })) throw Error('Text generation is active');
  const presetBytes = fs.readFileSync(approvedPath), config = JSON.parse(presetBytes);
  if (config.language !== 'fr' || config.speed !== 1 || config.mp3CompressionLevel !== 0
    || config.generationMode !== 'controllable-cloning') throw Error('Unexpected approved French profile');
  const oldPreset = fs.readFileSync(defaultPath);
  const tours = await db.tour.findMany({ where: { language: 'fr' }, include: { places: { orderBy: { position: 'asc' } } }, orderBy: { city: 'asc' } });
  if (!tours.length || tours.some(t => t.status !== 'published' || !t.introduction?.trim()
    || !t.places.length || t.places.length > 39)) throw Error('French tour inventory is not ready');
  tours.sort((a, b) => Number(b.city === 'Sevilla') - Number(a.city === 'Sevilla') || a.city.localeCompare(b.city));
  process.env.VOXCPM_PRESET_PATH = approvedPath;
  const entries = [];
  for (const tour of tours) {
    const snapshot = await audio.snapshot(tour.id, true);
    entries.push({ tourId: tour.id, city: tour.city, language: 'fr', fingerprint: fingerprint(snapshot),
      rendererKey: snapshot.rendererKey, identity: snapshot.identity,
      previousIntroductionAudioId: tour.metadata?.introductionAudioId ?? null, previousFirstAudioVersion: null,
      pieces: [{ id: randomUUID(), kind: 'introduction', text: snapshot.introductionText, sourceHash: snapshot.introductionHash },
        ...snapshot.stops.map(stop => ({ ...stop, kind: 'stop', sourceHash: snapshot.hashes[stop.id] }))] });
  }
  const oldFrenchAssets = await db.audioAsset.findMany({ where: { language: 'fr', placeId: { in: tours.flatMap(t => t.places.map(p => p.id)) } }, orderBy: { id: 'asc' } });
  const oldFrenchIntroductions = await db.tourIntroductionAudio.findMany({ where: { language: 'fr', tourId: { in: tours.map(t => t.id) } }, orderBy: { id: 'asc' } });
  if ([...oldFrenchAssets, ...oldFrenchIntroductions].some(row => !validStoragePath.test(row.storagePath))) throw Error('Unexpected old French audio path');
  const manifest = { version: 1, scope: 'replace-french-audio', createdAt: new Date().toISOString(),
    presetPath: approvedPath, presetSha256: audioHash(presetBytes), previousPresetSha256: audioHash(oldPreset),
    entries, oldFrenchAssets, oldFrenchIntroductions, nonFrenchRowsHash: await otherLanguagesHash(db) };
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'previous-default-preset.json'), oldPreset, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return manifest;
}

async function finalizeFrench({ db, audio, directory, storageDir, manifest, state, activate, save, fingerprint }) {
  const presetBytes = fs.readFileSync(approvedPath);
  if (audioHash(presetBytes) !== manifest.presetSha256
    || ![manifest.previousPresetSha256, manifest.presetSha256].includes(audioHash(fs.readFileSync(defaultPath)))) throw Error('French preset changed during rendering');
  if (await otherLanguagesHash(db) !== manifest.nonFrenchRowsHash) throw Error('Other-language inventory changed; activation stopped');
  const keep = new Set();
  for (const entry of manifest.entries) {
    if (entry.language !== 'fr' || fingerprint(await audio.snapshot(entry.tourId, true)) !== entry.fingerprint) throw Error('French tour changed before activation');
    for (const piece of entry.pieces) {
      const result = state.entries[entry.tourId]?.pieces[piece.id];
      if (result?.status !== 'completed') throw Error('Incomplete replacement');
      const row = await (piece.kind === 'introduction' ? db.tourIntroductionAudio : db.audioAsset).findUnique({ where: { id: result.assetId } });
      if (!row || (piece.kind === 'introduction' ? row.tourId !== entry.tourId : row.placeId !== piece.id)
        || !await verifiedAudio(row, storageDir, { language: 'fr', rendererKey: entry.rendererKey, sourceHash: piece.sourceHash })) throw Error('Invalid replacement asset');
      keep.add(row.id);
    }
  }
  for (const entry of manifest.entries) {
    if (!await activate(entry, state.entries[entry.tourId].pieces)) throw Error('Introduction activation failed');
  }
  const temporary = defaultPath + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temporary, presetBytes, { flag: 'wx', mode: fs.statSync(defaultPath).mode & 0o777 });
  fs.renameSync(temporary, defaultPath);
  delete process.env.VOXCPM_PRESET_PATH;
  async function verifyServed() {
    for (const entry of manifest.entries) {
      const current = await audio.get(entry.tourId, true);
      if (current.status !== 'completed' || !current.introduction || current.completedStops !== entry.pieces.length - 1) throw Error('Replacement is not fully served');
    }
  }
  await verifyServed();
  const report = { status: 'activated', activatedAt: new Date().toISOString(), tours: manifest.entries.length,
    tourIds: manifest.entries.map(e => e.tourId), deletedRows: 0, deletedFiles: 0 };
  const reportPath = path.join(directory, 'deployment.json');
  save(reportPath, report);
  const tourIds = new Set(manifest.entries.map(e => e.tourId));
  const placeIds = new Set(manifest.entries.flatMap(e => e.pieces.filter(p => p.kind === 'stop').map(p => p.id)));
  for (const [model, rows, ownerKey, owners] of [
    [db.audioAsset, manifest.oldFrenchAssets, 'placeId', placeIds],
    [db.tourIntroductionAudio, manifest.oldFrenchIntroductions, 'tourId', tourIds],
  ]) {
    for (const old of rows) {
      if (keep.has(old.id)) continue;
      if (old.language !== 'fr' || !owners.has(old[ownerKey]) || !validStoragePath.test(old.storagePath)) throw Error('Invalid cleanup scope');
      const current = await model.findUnique({ where: { id: old.id } });
      if (current) {
        if (JSON.stringify(current) !== JSON.stringify(old)) throw Error('Old French row changed; cleanup stopped');
        await model.delete({ where: { id: old.id } });
        report.deletedRows++;
      }
      const where = { storagePath: old.storagePath };
      if (await db.audioAsset.count({ where }) || await db.tourIntroductionAudio.count({ where })) continue;
      const file = path.join(storageDir, old.storagePath);
      for (const candidate of [file, file.replace(/\.mp3$/, '.provenance.json'), file + '.provenance.json']) {
        try { fs.unlinkSync(candidate); report.deletedFiles++; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      save(reportPath, report);
    }
  }
  if (await otherLanguagesHash(db) !== manifest.nonFrenchRowsHash) throw Error('Other-language inventory changed');
  await verifyServed();
  Object.assign(report, { status: 'completed', finishedAt: new Date().toISOString() });
  save(reportPath, report);
}

module.exports = { inventoryFrench, finalizeFrench };
