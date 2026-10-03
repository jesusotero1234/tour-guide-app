#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { audioDisclosure, audioIdentity } = require('../../src/services/AudioProvenance');
const { getCityNames } = require('../../src/domain/cityNames');
const { admittedToPilot, pilotFingerprint } = require('../../src/services/PilotRelease');
const { sourceUse, SOURCE_POLICY_VERSION } = require('../../src/services/poi/SourceUsePolicy');

const backend = path.resolve(__dirname, '../..');
const root = path.dirname(backend);
const batch = process.env.BATCH_STAGE || path.join(backend, 'tmp/pilot-batch-europe-20260920');
const stage = path.resolve(process.env.EUROPE_PUBLICATION_STAGE
  || path.join(os.homedir(), '.local/share/tour-guide/nomuvia/europe-launch-20260922'));
const languages = ['es', 'en', 'fr', 'de', 'it'];
// Expected size of the batch. Defaults are the 30-city European launch of 2026-09-22; override for another batch.
const expectedCities = Number(process.env.EXPECTED_CITIES || 30);
const expectedStops = Number(process.env.EXPECTED_STOPS || 1170);
const expectedTours = expectedCities * languages.length;
const expectedAudioFiles = expectedStops + expectedTours;
const namespace = 'https://nomuvia.com/europe-history-20260922/';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha(fs.readFileSync(file));
const stableUuid = value => {
  const hash = sha(namespace + value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const save = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
};
const normalize = text => text.replace(/\s+/g, ' ').trim();
const coordinate = value => Number(value.toFixed(7));
const title = (city, language) => ({
  es: `${city}: recorrido histórico general`,
  en: `${city}: historical walking tour`,
  fr: `${city} : parcours historique`,
  de: `${city}: historischer Rundgang`,
  it: `${city}: percorso storico`,
})[language];
const routeSlug = (city, language) => ({
  es: `${city}-recorrido-historico`,
  en: `${city}-historical-walk`,
  fr: `${city}-parcours-historique`,
  de: `${city}-historischer-rundgang`,
  it: `${city}-percorso-storico`,
})[language];
const allowedAudio = file => {
  const resolved = fs.realpathSync(file);
  assert(resolved.startsWith(fs.realpathSync(batch) + path.sep), 'Audio outside frozen batch: ' + file);
  return resolved;
};
const linkFile = (source, target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    assert.equal(fileSha(target), fileSha(source), 'Conflicting staged audio: ' + target);
    return;
  }
  try { fs.linkSync(source, target); } catch (error) {
    if (!['EXDEV', 'EPERM'].includes(error.code)) throw error;
    fs.copyFileSync(source, target);
  }
};
function sourceIndex(input) {
  const found = new Map();
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.sourceId && value.finalUrl && value.capturedAt) found.set(value.sourceId + '\n' + value.finalUrl, value);
    Object.values(value).forEach(visit);
  };
  visit(input);
  return found;
}
function credits(piece, sources) {
  return {
    version: SOURCE_POLICY_VERSION,
    items: piece.sources.map(source => {
      const evidence = sources.get(source.sourceId + '\n' + source.url);
      assert(evidence, `Missing source evidence: ${source.sourceId} ${source.url}`);
      const use = sourceUse(source.url);
      assert.notEqual(use.status, 'restricted', 'Restricted source: ' + source.url);
      let revisionUrl;
      if (evidence.wikimediaRevision?.revisionId && use.license === 'CC BY-SA 4.0') {
        const url = new URL(source.url);
        url.searchParams.set('oldid', String(evidence.wikimediaRevision.revisionId));
        revisionUrl = url.toString();
      }
      return {
        sourceId: source.sourceId,
        title: source.title,
        url: source.url,
        attribution: use.attribution || new URL(source.url).hostname,
        capturedAt: evidence.capturedAt,
        ...(revisionUrl ? { revisionUrl } : {}),
        ...(use.license ? { license: use.license, licenseUrl: use.licenseUrl } : {}),
        status: use.status,
        usage: 'research',
      };
    }),
  };
}
function voiceIdentity(language) {
  const presetPath = path.join(root, `pods/voxcpm-pod/presets/guide-${language}-a.json`);
  const preset = read(presetPath);
  return audioIdentity(fs.readFileSync(presetPath),
    fs.readFileSync(path.resolve(path.dirname(presetPath), preset.reference)));
}
function variantPaths(citySlug, language) {
  const directory = language === 'es'
    ? path.join(batch, citySlug)
    : path.join(batch, 'translation-audio/tours', citySlug, language);
  return {
    master: path.join(directory, 'master.json'),
    listening: path.join(directory, 'listening-result.json'),
  };
}
function audioRecord(chapter, piece, identity, inputs) {
  const audio = allowedAudio(chapter.audio);
  const provenancePath = audio.replace(/\.mp3$/, '.provenance.json');
  const provenance = read(provenancePath);
  assert.equal(inputs.get(piece.audioId), piece.text);
  assert.equal(provenance.stopId, piece.audioId);
  assert.equal(fileSha(audio), chapter.sha256);
  assert.equal(provenance.fileSha256, chapter.sha256);
  assert.deepEqual(provenance.identity, identity);
  assert(normalize(provenance.spokenText || '').length > 0);
  assert(Number.isFinite(chapter.durationSeconds) && chapter.durationSeconds > 1);
  return { audio, provenancePath, fileSha256: chapter.sha256, durationSeconds: chapter.durationSeconds };
}
function tourObject(row, places) {
  return {
    ...row,
    blueprintId: row.blueprintId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    places: places.sort((a, b) => a.position - b.position).map(place => ({
      ...place,
      tourId: row.id,
      nameInTourLanguage: place.metadata?.nameInTourLanguage,
      createdAt: place.createdAt,
      updatedAt: place.updatedAt,
    })),
  };
}
function audioState(tour, assets, intro) {
  const versions = Object.fromEntries(assets.map(asset =>
    [asset.placeId, asset.metadata.sourceHash + '.' + asset.metadata.fileSha256]));
  return {
    tourId: tour.id,
    status: 'completed',
    phase: 'completed',
    completedStops: assets.length,
    totalStops: assets.length,
    audioUrls: Object.fromEntries(assets.map(asset => [asset.placeId, '/audio/' + asset.id])),
    audioVersions: versions,
    transcripts: Object.fromEntries(tour.places.map(place => [place.id, place.description])),
    introduction: {
      status: 'completed',
      text: [audioDisclosure(tour.language), tour.introduction].join('\n\n'),
      audioUrl: '/audio/' + intro.id,
      version: intro.metadata.sourceHash + '.' + intro.metadata.fileSha256,
      durationSeconds: intro.durationSeconds,
    },
  };
}
function verifyCatalog(catalog, audioRoot) {
  assert.equal(catalog.tours.length, expectedTours);
  assert.equal(catalog.places.length, expectedStops);
  assert.equal(catalog.audioAssets.length, expectedStops);
  assert.equal(catalog.introductionAudios.length, expectedTours);
  for (const rows of Object.values(catalog)) {
    const ids = rows.map(row => row.id);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate row IDs');
  }
  for (const row of catalog.tours) {
    const places = catalog.places.filter(place => place.tourId === row.id);
    const assets = catalog.audioAssets.filter(asset => places.some(place => place.id === asset.placeId));
    const intro = catalog.introductionAudios.find(item => item.tourId === row.id);
    assert(intro && places.length >= 2 && assets.length === places.length);
    for (const asset of [...assets, intro]) {
      const file = path.join(audioRoot, asset.storagePath);
      assert(fs.statSync(file).size > 0);
      assert.equal(fileSha(file), asset.metadata.fileSha256);
    }
    const tour = tourObject(row, places);
    const state = audioState(tour, assets, intro);
    assert(admittedToPilot(tour, state), `Tour rejected: ${row.city} ${row.language}`);
  }
}
function prepare() {
  assert(!fs.existsSync(path.join(stage, 'catalog.json')), 'Stage already prepared: ' + stage);
  fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
  const sourceManifest = read(path.join(batch, 'manifest.json'));
  const citySlugs = sourceManifest.cities.map(city => city.slug).sort();
  assert.equal(citySlugs.length, expectedCities);
  assert.equal(read(path.join(batch, 'translation-audio/status.json')).phase, 'completed');
  const identities = Object.fromEntries(languages.map(language => [language, voiceIdentity(language)]));
  const rendererKeys = Object.fromEntries(languages.map(language =>
    [language, sha('nano-vllm-voxcpm-2.0.4-tempo-v1:' + JSON.stringify(identities[language]))]));
  const generatedAt = new Date().toISOString();
  const jobId = stableUuid('audio-import');
  const audioRoot = path.join(stage, 'audio');
  const catalog = { tours: [], places: [], audioAssets: [], introductionAudios: [] };
  const seo = { cities: [], routes: [] };
  const plan = [];
  const fileLines = [];
  const renderInputs = Object.fromEntries(languages.map(language => [language, new Map()]));
  for (const citySlug of citySlugs) {
    const input = read(path.join(batch, citySlug, 'audio-input.json'));
    assert.deepEqual(input.identity, identities.es);
    for (const stop of input.stops) {
      assert(!renderInputs.es.has(stop.id));
      renderInputs.es.set(stop.id, stop.text);
    }
  }
  for (const language of languages.slice(1)) {
    const directory = path.join(batch, 'translation-audio/languages', language);
    for (const name of fs.readdirSync(directory).filter(name => name.startsWith('batch-')).sort()) {
      const input = read(path.join(directory, name, 'audio-input.json'));
      assert.deepEqual(input.identity, identities[language]);
      for (const stop of input.stops) {
        assert(!renderInputs[language].has(stop.id));
        renderInputs[language].set(stop.id, stop.text);
      }
    }
  }
  for (const citySlug of citySlugs) {
    const spanish = read(variantPaths(citySlug, 'es').master);
    const inputs = read(path.join(batch, citySlug, 'inputs.json'));
    const destination = inputs.snapshot.destination;
    const route = read(path.join(batch, citySlug, 'walking-route.json'));
    const sources = sourceIndex(inputs);
    const cityNames = getCityNames(spanish.city, destination.countryCode);
    assert(cityNames, 'Missing localized city names: ' + spanish.city);
    assert.equal(spanish.country, destination.country);
    assert.equal(route.provider, 'fossgis-osrm-foot');
    seo.cities.push({ slug: citySlug, name: spanish.city, countryCode: destination.countryCode, names: cityNames });
    const basePieces = new Map(spanish.pieces.map(piece => [piece.id, piece]));
    for (const language of languages) {
      const paths = variantPaths(citySlug, language);
      const master = read(paths.master);
      const listening = read(paths.listening);
      assert.equal(master.language, language);
      assert.equal(master.city, spanish.city);
      assert.equal(master.country, spanish.country);
      assert.equal(master.pieces.length, listening.chapters.length);
      assert([
        'Identidad, texto normalizado, clips decodificables y procedencia enlazada comprobados; no escucha humana.',
        'Identidad, texto, audio decodificable y procedencia comprobados; sin escucha humana.',
      ].includes(listening.validation), 'Unexpected listening validation: ' + listening.validation);
      assert.deepEqual(master.pieces.map(piece => piece.id), spanish.pieces.map(piece => piece.id));
      assert.deepEqual(listening.chapters.map(chapter => chapter.id), master.pieces.map(piece => piece.id));
      const tourId = stableUuid(`tour/${citySlug}/${language}`);
      const introId = stableUuid(`intro/${citySlug}/${language}`);
      const tourPlaces = [], tourAssets = [], evidence = [];
      const chapterMap = new Map(listening.chapters.map(chapter => [chapter.id, chapter]));
      const welcome = master.pieces[0];
      const disclosure = audioDisclosure(language);
      assert(welcome.text.startsWith(disclosure + '\n\n'));
      const introduction = welcome.text.slice(disclosure.length + 2).trim();
      const welcomeAudio = audioRecord(chapterMap.get(welcome.id), welcome, identities[language], renderInputs[language]);
      const addAudio = (id, record) => {
        const relative = path.join('voxcpm2', jobId, id + '.mp3');
        const target = path.join(audioRoot, relative);
        linkFile(record.audio, target);
        fileLines.push(`${record.fileSha256}  ${relative}`);
        evidence.push({ id, sourceAudio: record.audio, sourceProvenance: record.provenancePath,
          fileSha256: record.fileSha256, durationSeconds: record.durationSeconds });
        return { relative, target };
      };
      const introFile = addAudio(introId, welcomeAudio);
      for (let index = 1; index < master.pieces.length; index++) {
        const piece = master.pieces[index];
        const base = basePieces.get(piece.id);
        assert(base && piece.qid === base.qid);
        assert.deepEqual(piece.coordinates, base.coordinates);
        assert.deepEqual(piece.sources, base.sources);
        const placeId = stableUuid(`place/${citySlug}/${language}/${piece.id}`);
        const record = audioRecord(chapterMap.get(piece.id), piece, identities[language], renderInputs[language]);
        const stored = addAudio(placeId, record);
        const metadata = {
          sourceCredits: credits(base, sources),
          sourcePoi: { wikidata: base.qid },
          nameInTourLanguage: piece.name,
        };
        catalog.places.push({
          id: placeId, tourId, name: base.name, description: piece.text,
          position: index - 1, latitude: coordinate(piece.coordinates.latitude), longitude: coordinate(piece.coordinates.longitude),
          importanceScore: null, imageUrl: null, metadata, createdAt: generatedAt, updatedAt: generatedAt,
        });
        const sourceHash = sha(language + rendererKeys[language] + piece.text.trim());
        catalog.audioAssets.push({
          id: placeId, placeId, language, format: 'mp3', storagePath: stored.relative,
          durationSeconds: Math.round(record.durationSeconds),
          metadata: { provider: 'VoxCPM2', voice: 'A', rendererKey: rendererKeys[language], sourceHash,
            fileSha256: record.fileSha256, identity: identities[language],
            editorialRevision: 'europe-history-import-20260922', importedAudio: true },
          createdAt: generatedAt, updatedAt: generatedAt,
        });
        tourPlaces.push(catalog.places.at(-1));
        tourAssets.push(catalog.audioAssets.at(-1));
      }
      const introSourceHash = sha(language + rendererKeys[language] + welcome.text);
      catalog.introductionAudios.push({
        id: introId, tourId, language, format: 'mp3', storagePath: introFile.relative,
        durationSeconds: Math.round(welcomeAudio.durationSeconds),
        metadata: { provider: 'VoxCPM2', voice: 'A', rendererKey: rendererKeys[language],
          sourceHash: introSourceHash, fileSha256: welcomeAudio.fileSha256, identity: identities[language],
          firstAudioAssetId: tourAssets[0].id, editorialRevision: 'europe-history-import-20260922',
          importedAudio: true },
        createdAt: generatedAt, updatedAt: generatedAt,
      });
      const catalogTitle = title(cityNames[language], language);
      const audioSeconds = welcomeAudio.durationSeconds + evidence.slice(1).reduce((sum, row) => sum + row.durationSeconds, 0);
      const tourRow = {
        id: tourId, city: spanish.city, country: spanish.country, countryCode: destination.countryCode,
        theme: 'history', language, durationMinutes: Math.ceil((route.durationSeconds + audioSeconds) / 60),
        status: 'published', introduction, blueprintId: null,
        metadata: { catalogTitle, pilotWalkingRoute: route, introductionAudioId: introId },
        createdAt: generatedAt, updatedAt: generatedAt,
      };
      const mapped = tourObject(tourRow, tourPlaces);
      const state = audioState(mapped, tourAssets, catalog.introductionAudios.at(-1));
      tourRow.metadata.pilotRelease = {
        version: 1, approvalMode: 'owner-authorized',
        authorizationReference: 'Owner explicitly requested publication of the France, Germany and Italy tours on nomuvia.com on 2026-09-21',
        status: 'approved', reviewedBy: 'Owner authorization; automated technical checks',
        reviewedAt: generatedAt, sourcePolicy: SOURCE_POLICY_VERSION, scriptLicense: 'CC BY-SA 4.0',
        changes: 'AI-generated narration and translations. Audio identity, text, hashes, routes and source records validated automatically; no complete human listening review. Pending source permissions remain pending.',
        checks: { text: false, audio: false, route: false, rights: false }, fingerprint: '',
      };
      mapped.metadata = tourRow.metadata;
      tourRow.metadata.pilotRelease.fingerprint = pilotFingerprint(mapped, state);
      assert(admittedToPilot(mapped, state), `Prepared tour rejected: ${citySlug} ${language}`);
      catalog.tours.push(tourRow);
      seo.routes.push({ id: tourId, city: citySlug, locale: language, slug: routeSlug(citySlug, language),
        group: `${citySlug}-history`, title: catalogTitle });
      plan.push({ citySlug, language, tourId, introId, title: catalogTitle,
        stops: tourPlaces.length, routeDistanceMeters: route.distanceMeters,
        routeDurationSeconds: route.durationSeconds, audio: evidence });
    }
  }
  assert.equal(fileLines.length, expectedAudioFiles);
  verifyCatalog(catalog, audioRoot);
  save(path.join(stage, 'catalog.json'), catalog);
  save(path.join(stage, 'plan.json'), plan);
  save(path.join(stage, 'seo-additions.json'), seo);
  fs.writeFileSync(path.join(stage, 'audio.sha256'), fileLines.sort().join('\n') + '\n', { mode: 0o600 });
  const bytes = catalog.audioAssets.concat(catalog.introductionAudios)
    .reduce((sum, row) => sum + fs.statSync(path.join(audioRoot, row.storagePath)).size, 0);
  const manifest = {
    version: 1, generatedAt, jobId, sourceBatch: batch,
    counts: { cities: expectedCities, tours: expectedTours, stops: expectedStops, introductions: expectedTours, audioFiles: expectedAudioFiles,
      languages: Object.fromEntries(languages.map(language =>
        [language, catalog.tours.filter(tour => tour.language === language).length])) },
    audioBytes: bytes,
    files: Object.fromEntries(['catalog.json', 'plan.json', 'seo-additions.json', 'audio.sha256']
      .map(file => [file, fileSha(path.join(stage, file))])),
  };
  save(path.join(stage, 'manifest.json'), manifest);
  console.log(JSON.stringify({ stage, ...manifest.counts, audioGiB: +(bytes / 2 ** 30).toFixed(3) }));
}
function verify() {
  const manifest = read(path.join(stage, 'manifest.json'));
  for (const [file, expected] of Object.entries(manifest.files)) assert.equal(fileSha(path.join(stage, file)), expected);
  const catalog = read(path.join(stage, 'catalog.json'));
  verifyCatalog(catalog, path.join(stage, 'audio'));
  const lines = fs.readFileSync(path.join(stage, 'audio.sha256'), 'utf8').trim().split('\n');
  assert.equal(lines.length, expectedAudioFiles);
  for (const line of lines) {
    const [expected, relative] = line.split(/\s{2}/);
    assert.equal(fileSha(path.join(stage, 'audio', relative)), expected);
  }
  console.log(JSON.stringify({ stage, verifiedTours: catalog.tours.length, verifiedAudio: lines.length }));
}
function refreshFingerprints() {
  const catalogPath = path.join(stage, 'catalog.json');
  const catalog = read(catalogPath);
  for (const place of catalog.places) {
    place.latitude = coordinate(place.latitude);
    place.longitude = coordinate(place.longitude);
  }
  for (const row of catalog.tours) {
    const places = catalog.places.filter(place => place.tourId === row.id);
    const assets = catalog.audioAssets.filter(asset => places.some(place => place.id === asset.placeId));
    const intro = catalog.introductionAudios.find(item => item.tourId === row.id);
    const tour = tourObject(row, places);
    const state = audioState(tour, assets, intro);
    row.metadata.pilotRelease.fingerprint = pilotFingerprint(tour, state);
    tour.metadata = row.metadata;
    assert(admittedToPilot(tour, state), `Refreshed tour rejected: ${row.city} ${row.language}`);
  }
  save(catalogPath, catalog);
  const manifestPath = path.join(stage, 'manifest.json');
  const manifest = read(manifestPath);
  manifest.files['catalog.json'] = fileSha(catalogPath);
  save(manifestPath, manifest);
  verifyCatalog(catalog, path.join(stage, 'audio'));
  console.log(JSON.stringify({ refreshedFingerprints: catalog.tours.length }));
}

if (process.argv[2] === '--prepare') prepare();
else if (process.argv[2] === '--verify') verify();
else if (process.argv[2] === '--refresh-fingerprints') refreshFingerprints();
else throw Error('Use --prepare | --verify | --refresh-fingerprints');
