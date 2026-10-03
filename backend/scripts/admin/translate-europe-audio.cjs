#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { runLocalVoxCpm } = require('../../src/services/LocalVoxCpmRenderer');
const { audioDisclosure, audioIdentity } = require('../../src/services/AudioProvenance');
const { loadSpeech, spokenText } = require('./speech_stage.cjs');

const backend = path.resolve(__dirname, '../..');
const root = path.dirname(backend);
const batch = process.env.BATCH_STAGE || path.join(backend, 'tmp/pilot-batch-europe-20260920');
const output = path.join(batch, 'translation-audio');
const languages = ['en', 'fr', 'de', 'it'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => digest(fs.readFileSync(file));
const ordered = value => Array.isArray(value) ? value.map(ordered)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const stableUuid = value => { const hash = digest(value); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`; };
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function freeze(file, value) {
  if (fs.existsSync(file)) assert.deepEqual(read(file), value, `Frozen artifact changed: ${file}`);
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
}
function title(city, language) {
  return ({ en: `${city}: historical walking tour`, fr: `${city} : parcours historique`,
    de: `${city}: historischer Rundgang`, it: `${city}: percorso storico` })[language];
}
function prepare() {
  assert(!fs.existsSync(path.join(output, 'manifest.json')), 'Translation audio is already prepared');
  const translation = read(path.join(batch, 'translation-status.json'));
  assert.equal(translation.phase, 'completed');
  assert.deepEqual(translation.counts, { en: 30, fr: 30, de: 30, it: 30 });
  const source = read(path.join(batch, 'manifest.json'));
  const variants = [], frozen = { languages: {}, tours: {} };
  const languageTours = Object.fromEntries(languages.map(language => [language, []]));
  const identities = {}, speechVersions = {};
  for (const language of languages) {
    const presetPath = path.join(root, `pods/voxcpm-pod/presets/guide-${language}-a.json`);
    const preset = read(presetPath);
    identities[language] = audioIdentity(fs.readFileSync(presetPath), fs.readFileSync(path.resolve(path.dirname(presetPath), preset.reference)));
  }
  for (const city of source.cities) {
    const cityDir = path.join(batch, city.slug);
    const spanish = read(path.join(cityDir, 'master.json'));
    const spanishFinal = read(path.join(cityDir, 'final/es.json'));
    for (const language of languages) {
      const sourcePath = path.join(cityDir, `final/${language}.json`);
      const translated = read(sourcePath);
      assert.equal(translated.language, language);
      assert.equal(translated.sourceLanguage, 'es');
      assert.equal(translated.masterSha256, spanishFinal.masterSha256);
      assert.equal(translated.review.status, 'SUFFICIENT_IN_REVIEW_SCOPE');
      assert.equal(hashFile(translated.review.artifactPath), translated.review.artifactSha256);
      assert.deepEqual(translated.pieces.map(piece => piece.pieceId), spanish.pieces.map(piece => piece.id));
      const speech = loadSpeech(cityDir, language);
      const pieces = translated.pieces.map((piece, index) => {
        const base = spanish.pieces[index];
        const text = index === 0 ? `${audioDisclosure(language)}\n\n${piece.text}` : piece.text;
        const spoken = spokenText(speech, piece.pieceId, index, audioDisclosure(language));
        return { ...base, name: piece.name, text, ...(spoken ? { spokenText: spoken } : {}),
          audioId: stableUuid(`${source.runId}|${city.slug}|${language}|${piece.pieceId}|${spoken ?? text}`), review: translated.review };
      });
      speechVersions[language] = speech ? speech.version : speechVersions[language];
      const master = { ...spanish, title: title(city.city, language), language,
        editorialStatus: 'translated_reviewed_user_review_pending', sourceMasterSha256: translated.masterSha256,
        translationArtifactSha256: hashFile(sourcePath), pieces };
      const directory = path.join(output, 'tours', city.slug, language);
      const masterPath = path.join(directory, 'master.json');
      const scriptPath = path.join(directory, 'script.txt');
      freeze(masterPath, master);
      const script = `${master.title}\n\n${pieces.map(piece => `${piece.name}\n\n${piece.text}`).join('\n\n')}\n`;
      fs.writeFileSync(scriptPath, script, { flag: 'wx', mode: 0o600 });
      const stops = pieces.map(piece => ({ id: piece.audioId, text: piece.text, ...(piece.spokenText ? { spokenText: piece.spokenText } : {}) }));
      languageTours[language].push({ citySlug: city.slug, stops });
      const slug = `${city.slug}-${language}`;
      frozen.tours[slug] = { masterSha256: hashFile(masterPath), scriptSha256: hashFile(scriptPath) };
      variants.push({ slug, citySlug: city.slug, city: city.city, country: city.country, language,
        sourcePath, sourceSha256: hashFile(sourcePath) });
    }
  }
  for (const language of languages) {
    const groups = [];
    for (const tour of languageTours[language]) {
      let group = groups.at(-1);
      if (!group || group.stops.length + tour.stops.length > 40) groups.push(group = { citySlugs: [], stops: [] });
      group.citySlugs.push(tour.citySlug); group.stops.push(...tour.stops);
    }
    frozen.languages[language] = { chapters: 0, batches: [] };
    groups.forEach((group, index) => {
      const id = `batch-${String(index + 1).padStart(2, '0')}`;
      const inputPath = path.join(output, 'languages', language, id, 'audio-input.json');
      freeze(inputPath, { language, identity: identities[language], ...(speechVersions[language] ? { speechVersion: speechVersions[language] } : {}), stops: group.stops });
      frozen.languages[language].chapters += group.stops.length;
      frozen.languages[language].batches.push({ id, inputSha256: hashFile(inputPath), chapters: group.stops.length,
        citySlugs: group.citySlugs });
      for (const variant of variants.filter(row => row.language === language && group.citySlugs.includes(row.citySlug))) variant.batch = id;
    });
  }
  freeze(path.join(output, 'frozen.json'), frozen);
  freeze(path.join(output, 'manifest.json'), { version: 1, sourceRunId: source.runId,
    createdAt: new Date().toISOString(), languages, variants });
  save(path.join(output, 'status.json'), { phase: 'prepared', languages: Object.fromEntries(languages.map(language =>
    [language, { phase: 'queued', completedTours: 0, totalTours: 30, completedChapters: 0,
      totalChapters: frozen.languages[language].chapters }])) });
  console.log(JSON.stringify({ phase: 'prepared', tours: variants.length,
    chapters: Object.values(frozen.languages).reduce((sum, row) => sum + row.chapters, 0) }));
}
function validate() {
  const manifest = read(path.join(output, 'manifest.json')), frozen = read(path.join(output, 'frozen.json'));
  assert.deepEqual(manifest.languages, languages);
  assert.equal(manifest.variants.length, 120);
  for (const variant of manifest.variants) {
    assert.equal(hashFile(variant.sourcePath), variant.sourceSha256, `Translation changed: ${variant.slug}`);
    const directory = path.join(output, 'tours', variant.citySlug, variant.language);
    assert.equal(hashFile(path.join(directory, 'master.json')), frozen.tours[variant.slug].masterSha256);
    assert.equal(hashFile(path.join(directory, 'script.txt')), frozen.tours[variant.slug].scriptSha256);
  }
  for (const language of languages) for (const group of frozen.languages[language].batches)
    assert.equal(hashFile(path.join(output, 'languages', language, group.id, 'audio-input.json')), group.inputSha256);
  return { manifest, frozen };
}
function assemble(language) {
  const python = path.join(root, 'pods/voxcpm-pod/.venv/bin/python');
  const script = path.join(__dirname, 'assemble-europe-translations.py');
  const result = spawnSync(python, [script, language], { cwd: backend, encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}
async function execute() {
  const { manifest, frozen } = validate();
  let status = fs.existsSync(path.join(output, 'status.json')) ? read(path.join(output, 'status.json')) : { languages: {} };
  status = { ...status, phase: 'running', pid: process.pid, startedAt: status.startedAt || new Date().toISOString() };
  const persist = () => save(path.join(output, 'status.json'), { ...status, updatedAt: new Date().toISOString() });
  persist();
  for (const language of languages) {
    try {
      status.currentLanguage = language;
      status.languages[language] = { ...status.languages[language], phase: 'rendering', startedAt: new Date().toISOString(),
        completedChapters: 0, totalChapters: frozen.languages[language].chapters };
      delete status.languages[language].error;
      persist();
      for (const group of frozen.languages[language].batches) {
        const directory = path.join(output, 'languages', language, group.id);
        const progressPath = path.join(directory, 'tts-job/progress.json');
        const progress = fs.existsSync(progressPath) ? read(progressPath) : null;
        status.languages[language].currentBatch = group.id;
        status.languages[language].completedChapters = frozen.languages[language].batches
          .slice(0, frozen.languages[language].batches.indexOf(group)).reduce((sum, row) => sum + row.chapters, 0)
          + (progress?.results?.length || 0);
        persist();
        if (progress?.phase !== 'rendered') await runLocalVoxCpm(read(path.join(directory, 'audio-input.json')),
          path.join(directory, 'tts-job'), path.join(directory, 'audio'), { resume: Boolean(progress) });
      }
      status.languages[language].phase = 'assembling'; persist();
      assemble(language);
      const completedTours = manifest.variants.filter(variant => variant.language === language &&
        fs.existsSync(path.join(output, 'tours', variant.citySlug, language, 'listening-result.json'))).length;
      status.languages[language] = { ...status.languages[language], phase: 'completed', completedTours,
        completedChapters: frozen.languages[language].chapters, finishedAt: new Date().toISOString() };
      delete status.languages[language].currentBatch;
      delete status.languages[language].error;
    } catch (error) {
      status.languages[language] = { ...status.languages[language], phase: 'error', error: error.message };
      console.error(`${language}: ${error.message}`);
    }
    persist();
  }
  delete status.currentLanguage;
  status.phase = languages.every(language => status.languages[language].phase === 'completed') ? 'completed' : 'completed_with_errors';
  status.finishedAt = new Date().toISOString(); persist();
  process.exitCode = status.phase === 'completed' ? 0 : 1;
}

const command = process.argv[2];
if (command === '--prepare') prepare();
else if (command === '--check') { const { frozen } = validate(); console.log(JSON.stringify({ phase: 'valid', languages,
  tours: 120, chapters: Object.values(frozen.languages).reduce((sum, row) => sum + row.chapters, 0) })); }
else if (command === '--execute') execute().catch(error => { console.error(error.message); process.exitCode = 1; });
else throw Error('Use --prepare | --check | --execute');
