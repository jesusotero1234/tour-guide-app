// Local pilot batch: use the existing live preparation and whole-tour prompt builders.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const backend = path.resolve(__dirname, '../..');
const batch = path.join(backend, 'tmp/pilot-batch-spain-20260912');
const cities = [
  ['madrid', 'Madrid', 'Q2807'], ['barcelona', 'Barcelona', 'Q1492'],
  ['valencia', 'Valencia', 'Q8818'], ['zaragoza', 'Zaragoza', 'Q10305'],
  ['sevilla', 'Sevilla', 'Q8717'], ['malaga', 'Málaga', 'Q8851'],
  ['murcia', 'Murcia', 'Q12225'], ['palma', 'Palma', 'Q8826'],
  ['las-palmas', 'Las Palmas de Gran Canaria', 'Q11974'], ['alicante', 'Alicante', 'Q11959'],
  ['castellon', 'Castellón de la Plana', 'Q15092'],
];
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
function freeze(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert.deepEqual(read(file), value, `Frozen input changed: ${file}`);
  else fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
async function setup() {
  const file = path.join(batch, 'destinations-wikidata.json');
  if (!fs.existsSync(file)) {
    const ids = [...cities.map(c => c[2]), 'Q2074737'].join('|');
    const { narrativeHttpHeadersV8 } = require('../../src/services/poi/MediaWikiRequestPolicyV8');
    const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', ids, props: 'claims|labels|sitelinks', languages: 'es|en', format: 'json' });
    const response = await fetch(url, { headers: narrativeHttpHeadersV8(), signal: AbortSignal.timeout(30000) });
    assert(response.ok, 'Destination identity fetch failed: ' + response.status);
    freeze(file, await response.json());
  }
  const entities = read(file).entities;
  const claims = (entity, property) => (entity.claims[property] ?? []).map(row => row.mainsnak?.datavalue?.value?.id);
  assert(claims(entities.Q2074737, 'P279').includes('Q15284'), 'Spanish municipality root changed');
  for (const [slug, city, qid] of cities) {
    const entity = entities[qid];
    assert(entity && !entity.missing && claims(entity, 'P17').includes('Q29'), `Country mismatch: ${city}`);
    assert(claims(entity, 'P31').some(id => ['Q2074737', 'Q515', 'Q15284', 'Q1549591'].includes(id)), `Settlement identity needs checking: ${city}`);
    const wikipedia = entity.sitelinks.eswiki?.title;
    assert(wikipedia, 'Spanish city article missing');
    const destination = { qid, city, country: 'España', countryCode: 'ES', researchLanguages: ['es','en'],
      wikimediaPages: { wikipedia: { language: 'es', title: wikipedia },
        ...(entity.sitelinks.eswikivoyage ? { wikivoyage: { language: 'es', title: entity.sitelinks.eswikivoyage.title } } : {}) },
      policyVersion: require('../../src/services/tourReadiness/TourLanguage').RESEARCH_POLICY_VERSION };
    freeze(path.join(batch, slug, 'destination.json'), destination);
  }
  freeze(path.join(batch, 'manifest.json'), { version: 1, cities: cities.map(([slug, city, qid]) => ({slug, city, qid})),
    languages: ['es','en','fr','de','it'], requestedMinutes: 120, theme: 'history',
    populationList: 'https://municipal.viajeinteligencia.com/editorial/municipios-mas-poblados-espana.html',
    scope: 'Ten most populated municipalities plus Castellón, final Spanish masters then translations and audio; no human approval fabricated.',
    preparationLimitUsdPerCity: 2, astraApiCalls: 0 });
}
async function prepare(slug) {
  const row = cities.find(c => c[0] === slug);
  assert(row, 'Unknown city');
  const dir = path.join(batch, slug);
  const recovery = fs.existsSync(path.join(dir, 'prepare-recovery.json')) ? read(path.join(dir, 'prepare-recovery.json')) : null;
  const runId = 'pilot-spain-20260912-' + slug + (recovery ? '-' + (recovery.runSuffix ?? 'recovery') : '');
  const output = path.join(backend, 'tmp/narrative-v8', runId);
  const blueprintFile = path.join(output, 'blueprint.private.json');
  if (!fs.existsSync(blueprintFile)) {
    const worker = path.join(backend, 'scripts/validation/narrative-user-canary-v8.ts');
    const args = ['-r', 'ts-node/register/transpile-only', worker, '--generate', '--allow-external',
      '--profile=deepseek_control', '--writer-transport=openrouter', '--prepare-blueprint',
      '--destination-file=' + path.join(dir, 'destination.json'), '--city-qid=' + row[2], '--city=' + row[1],
      '--country=España', '--country-code=ES', '--theme=history', '--language=es', '--research-languages=es,en',
      '--duration=120', '--rag=off', '--run-id=' + runId, '--spend-limit-usd=2',
      '--prior-spend-usd=' + (recovery?.priorSpendUsd ?? 0),
      ...(recovery?.checkpoint ? ['--resume-from=' + recovery.phase, '--resume-checkpoint=' + recovery.checkpoint] : [])];
    const log = fs.openSync(path.join(dir, 'prepare.log'), 'a');
    try {
      await new Promise((accept, reject) => {
        const child = spawn(process.execPath, args, { cwd: backend, env: process.env, stdio: ['ignore', log, log] });
        const timeout = setTimeout(() => child.kill('SIGTERM'), 31 * 60 * 1000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('close', code => { clearTimeout(timeout); code === 0 ? accept() : reject(Error('Preparation failed: ' + slug + ' (' + code + ')')); });
      });
    } finally { fs.closeSync(log); }
  }
  const { parseTourBlueprintSnapshot } = require('../../src/services/TourBlueprint');
  const snapshot = parseTourBlueprintSnapshot(read(blueprintFile));
  freeze(path.join(dir, 'preparation.json'), { runId, blueprintFile, budget: read(path.join(output, 'budget.private.json')) });
  assert.equal(snapshot.destination.qid, row[2]);
  const { loadCodexAuthorDocumentsV8 } = require('../validation/narrative-codex-live-v8');
  const { prepareAuthorCanaryMaterialV8 } = require('../validation/narrative-author-canary-material-v8');
  const { prepareTourWelcomeV8 } = require('../validation/narrative-tour-welcome-v8');
  const { combinedPrompt } = require('../validation/narrative-astra-tour-batching-v8');
  const docs = loadCodexAuthorDocumentsV8();
  const materials = prepareAuthorCanaryMaterialV8(snapshot.checkpoint, docs.template, docs.reference, docs.referenceStopId, 'es');
  const welcome = prepareTourWelcomeV8(materials);
  freeze(path.join(dir, 'inputs.json'), { snapshot, materials, welcome });
  const prompt = combinedPrompt(materials, welcome) + (recovery?.scope ? '\n\nAlcance del recorrido: ' + recovery.scope + '\n' : '');
  const promptFile = path.join(dir, 'combined-prompt.md');
  if (fs.existsSync(promptFile)) assert.equal(fs.readFileSync(promptFile, 'utf8'), prompt);
  else fs.writeFileSync(promptFile, prompt, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ city: row[1], phase: 'prepared', stops: materials.length, minutes: snapshot.geometry.guidedDurationMinutes, durationFit: snapshot.geometry.durationFit }));
}
async function main() {
  await setup();
  const command = process.argv[2] ?? '--setup';
  if (command === '--setup') return;
  const failures = [];
  for (const slug of command === '--all' ? cities.map(c => c[0]) : [command]) {
    console.log(JSON.stringify({ city: slug, phase: 'preparing', at: new Date().toISOString() }));
    try { await prepare(slug); } catch (error) { failures.push({ city: slug, error: error.message }); console.error(error.message); }
  }
  fs.writeFileSync(path.join(batch, 'preparation-summary.json'), JSON.stringify({ checkedAt: new Date().toISOString(), failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
