// Local pilot batch: use the existing live preparation and whole-tour prompt builders.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const backend = path.resolve(__dirname, '../..');
const batch = path.join(backend, 'tmp/pilot-batch-europe-20260920');
process.env.NARRATIVE_WIKIDATA_READ_MODE = 'entity-data';
process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR = path.join(batch, 'wikidata-entity-cache');
const manifest = JSON.parse(fs.readFileSync(path.join(batch, 'manifest.json'), 'utf8'));
const cities = manifest.cities;
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
function freeze(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert.deepEqual(read(file), value, `Frozen input changed: ${file}`);
  else fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
async function setup() {
  assert.equal(manifest.requestedMinutes, 120);
  assert.equal(manifest.theme, 'history');
  assert.deepEqual(manifest.languages, ['es']);
  assert.equal(cities.length, 30);
  assert.equal(new Set(cities.map(c => c.slug)).size, 30);
  const countries = { FR: 'Q142', DE: 'Q183', IT: 'Q38' };
  for (const code of Object.keys(countries)) assert.equal(cities.filter(c => c.countryCode === code).length, 10);
  const file = path.join(batch, 'destinations-wikidata.json');
  if (!fs.existsSync(file)) {
    const { narrativeHttpHeadersV8 } = require('../../src/services/poi/MediaWikiRequestPolicyV8');
    const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids: cities.map(c => c.qid).join('|'), props: 'claims|labels|sitelinks', languages: 'es|en|fr|de|it', format: 'json' });
    const response = await fetch(url, { headers: narrativeHttpHeadersV8(), signal: AbortSignal.timeout(30000) });
    assert(response.ok, 'Destination identity fetch failed: ' + response.status);
    freeze(file, await response.json());
  }
  const entities = read(file).entities;
  for (const city of cities) {
    const entity = entities[city.qid];
    assert(entity && !entity.missing, 'Missing destination: ' + city.city);
    assert((entity.claims.P17 ?? []).some(row => row.rank !== 'deprecated' && row.mainsnak?.datavalue?.value?.id === countries[city.countryCode]), 'Country mismatch: ' + city.city);
    const language = city.researchLanguages.find(lang => entity.sitelinks[lang + 'wiki']?.title);
    assert(language, 'Missing destination Wikipedia');
    const voyage = city.researchLanguages.find(lang => entity.sitelinks[lang + 'wikivoyage']?.title);
    freeze(path.join(batch, city.slug, 'destination.json'), { qid: city.qid, city: city.city, country: city.country, countryCode: city.countryCode, researchLanguages: city.researchLanguages,
      wikimediaPages: { wikipedia: { language, title: entity.sitelinks[language + 'wiki'].title }, ...(voyage ? { wikivoyage: { language: voyage, title: entity.sitelinks[voyage + 'wikivoyage'].title } } : {}) },
      policyVersion: require('../../src/services/tourReadiness/TourLanguage').RESEARCH_POLICY_VERSION });
  }
}
async function prepare(slug) {
  const row = cities.find(c => c.slug === slug);
  assert(row, 'Unknown city');
  const dir = path.join(batch, slug);
  const { recovery, runId, output } = require('./preparation_attempt.cjs').allocate(backend,batch,manifest,row);
  const routePolicy = recovery?.checkpoint && recovery.phase !== 'route'
    ? (read(recovery.checkpoint).run.routePolicy ?? 'walking-v8-1') : 'walking-v8-scoped-1';
  process.env.SOURCE_ACQUISITION_DIR = path.join(dir, 'source-attempts', runId);
  fs.mkdirSync(process.env.SOURCE_ACQUISITION_DIR, { recursive: true });
  if (slug === 'venezia') {
    process.env.OVERPASS_CACHE_DIR = path.join(dir, 'cold-source-cache-v1');
    process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR = path.join(dir, 'cold-entity-cache-v1');
    freeze(path.join(dir,'cold-acquisition-policy.json'), {osmCache:process.env.OVERPASS_CACHE_DIR,
      entityCache:process.env.NARRATIVE_WIKIDATA_ENTITY_CACHE_DIR, originalsPreserved:true,
      policy:'first acquisition cold; valid responses retained for bounded recovery; destination identities frozen independently'});
  }
  const blueprintFile = path.join(output, 'blueprint.private.json');
  if (!fs.existsSync(blueprintFile)) {
    // Known identities use Wikidata's official linked-data interface, with revision checks and caching.
    const { readWikidataEntityDataV8 } = require('../../src/services/poi/WikidataEntityDataV8');
    const { narrativeHttpHeadersV8 } = require('../../src/services/poi/MediaWikiRequestPolicyV8');
    const get = async (url, params, options) => {
      const response = await require('axios').get(url, { params, headers: { ...narrativeHttpHeadersV8(), ...options?.headers }, timeout: 30000 });
      return { data: response.data, status: response.status, headers: response.headers };
    };
    await readWikidataEntityDataV8(row.qid, get, ms => new Promise(resolve => setTimeout(resolve, ms)));
    const readiness = { phase: 'identity_verified', transport: 'entity-data', checkedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, 'source-readiness.json'), JSON.stringify(readiness));
    console.log(JSON.stringify({ city: slug, ...readiness }));
    const worker = path.join(backend, 'scripts/validation/narrative-user-canary-v8.ts');
    const args = ['-r', 'ts-node/register/transpile-only', worker, '--generate', '--allow-external',
      '--profile=deepseek_control', '--writer-transport=openrouter', '--prepare-blueprint',
      '--destination-file=' + path.join(dir, 'destination.json'), '--city-qid=' + row.qid, '--city=' + row.city,
      '--country=' + row.country, '--country-code=' + row.countryCode, '--theme=history', '--language=' + row.researchLanguages[0], '--research-languages=' + row.researchLanguages.join(','),
      '--duration=120', '--rag=off', '--run-id=' + runId, '--spend-limit-usd=2',
      '--route-policy=' + routePolicy,
      ...(row.pinnedIds?.length ? ['--pinned-ids=' + row.pinnedIds.join(',')] : []),
      ...(row.excludedIds?.length ? ['--excluded-ids=' + row.excludedIds.join(',')] : []),
      '--prior-spend-usd=' + (recovery?.priorSpendUsd ?? 0),
      ...(recovery?.checkpoint ? ['--resume-from=' + recovery.phase, '--resume-checkpoint=' + recovery.checkpoint] : [])];
    const log = fs.openSync(path.join(dir, 'prepare.log'), 'a');
    try {
      await new Promise((accept, reject) => {
        const child = spawn(process.execPath, args, { cwd: backend, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', chunk => { fs.writeSync(log, chunk); process.stdout.write(chunk); });
        child.stderr.on('data', chunk => { fs.writeSync(log, chunk); process.stderr.write(chunk); });
        // The first static fallback can download and index a multi-gigabyte
        // country extract. The supervisor still owns the outer 13-hour limit.
        const timeout = setTimeout(() => child.kill('SIGTERM'),
          process.env.STATIC_OSM_FALLBACK === '1' ? 4 * 60 * 60 * 1000 : 31 * 60 * 1000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('close', code => {
          clearTimeout(timeout);
          if(code===0) return accept();
          const reportFile=path.join(output,'review.json');
          const failure=fs.existsSync(reportFile)?read(reportFile).failure:null;
          reject(Object.assign(Error(failure?.message ?? ('Preparation failed: '+slug+' ('+code+')')), {failure}));
        });
      });
    } finally { fs.closeSync(log); }
  }
  const { parseTourBlueprintSnapshot } = require('../../src/services/TourBlueprint');
  const snapshot = parseTourBlueprintSnapshot(read(blueprintFile));
  const preparationFile=path.join(dir,'preparation.json');
  const manifestsRoot=path.join(dir,'source-attempts');
  const sourceManifests=fs.readdirSync(manifestsRoot).map(name=>path.join(manifestsRoot,name,'overpass-manifest.json'))
    .filter(file=>fs.existsSync(file)&&['complete_under_policy','valid_empty'].includes(read(file).status));
  const sourceBinding=fs.existsSync(preparationFile)?{}:{sourceManifests};
  freeze(preparationFile, { runId, blueprintFile, budget: read(path.join(output, 'budget.private.json')), ...sourceBinding });
  assert.equal(snapshot.destination.qid, row.qid);
  const { loadCodexAuthorDocumentsV8 } = require('../validation/narrative-codex-live-v8');
  const { prepareAuthorCanaryMaterialV8 } = require('../validation/narrative-author-canary-material-v8');
  const { prepareTourWelcomeV8 } = require('../validation/narrative-tour-welcome-v8');
  const { combinedPrompt } = require('../validation/narrative-astra-tour-batching-v8');
  const docs = loadCodexAuthorDocumentsV8();
  const materials = prepareAuthorCanaryMaterialV8(snapshot.checkpoint, docs.template, docs.reference, docs.referenceStopId, 'es');
  const welcome = prepareTourWelcomeV8(materials);
  freeze(path.join(dir, 'inputs.json'), { snapshot, materials, welcome });
  const scope = snapshot.routePlanning?.scope ?? recovery?.scope;
  const prompt = combinedPrompt(materials, welcome) + (scope ? '\n\nAlcance del recorrido: ' + scope
    + '. Explica ese alcance en la bienvenida; es un paseo histórico por esos lugares, sin prometer cubrir toda la ciudad.\n' : '');
  const promptFile = path.join(dir, 'combined-prompt.md');
  if (fs.existsSync(promptFile)) assert.equal(fs.readFileSync(promptFile, 'utf8'), prompt);
  else fs.writeFileSync(promptFile, prompt, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ city: row.city, phase: 'prepared', stops: materials.length, minutes: snapshot.geometry.guidedDurationMinutes, durationFit: snapshot.geometry.durationFit }));
}
async function main() {
  await setup();
  const command = process.argv[2] ?? '--setup';
  if (command === '--setup') return;
  const failures = [];
  for (const slug of command === '--all' ? cities.map(c => c.slug) : [command]) {
    console.log(JSON.stringify({ city: slug, phase: 'preparing', at: new Date().toISOString() }));
    try { await prepare(slug); }
    catch (error) {
      const source = process.env.SOURCE_ACQUISITION_DIR && path.join(process.env.SOURCE_ACQUISITION_DIR, 'source-failure.json');
      const evidence = source && fs.existsSync(source) ? read(source) : null;
      const result = { stage: 'prepare', status: evidence?.status === 'waiting' ? 'waiting' : 'failed', type: evidence?.type ?? error.failure?.code ?? 'preparation_failed', message: error.message,
        ...(error.failure ? { failure: error.failure } : {}),
        ...(evidence ? { sourceFailure: evidence } : {}) };
      fs.writeFileSync(path.join(batch,slug,'prepare-result.json'),JSON.stringify(result,null,2));
      failures.push({ city: slug, error: error.message }); console.error(error.message);
    }
  }
  fs.writeFileSync(path.join(batch, command === '--all' ? 'preparation-summary.json' : command + '-preparation-summary.json'), JSON.stringify({ checkedAt: new Date().toISOString(), failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
