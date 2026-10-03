// Rehearsal of the whole catalogue regeneration (plan 04) on a DISPOSABLE copy of the local database, with a fake model and a
// fake renderer: no money is spent, no GPU is used and no real database or production system is touched.
//   node -r ts-node/register/transpile-only scripts/admin/rehearse-regeneration.cjs [--keep]
// It creates the database `<name>_rehearsal` from DATABASE_URL (dropping a previous one with that name), a stage folder and an
// audio folder under REHEARSAL_DIR (default: a new folder in the OS temp directory), runs every phase and checks the result.
require('dotenv/config');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { parseArgs, runCommand, realDeps } = require('../../src/services/regeneration/cli');
const { Stage } = require('../../src/services/regeneration/stage');

const base = process.env.DATABASE_URL;
assert(base, 'DATABASE_URL is not set');
const url = new URL(base);
const sourceName = url.pathname.slice(1);
assert(!/(_rehearsal|_stage|_regen)$/.test(sourceName), 'DATABASE_URL already points at a rehearsal database; point it at the source');
const targetName = sourceName + '_rehearsal';
const plain = name => { const u = new URL(base); u.pathname = '/' + name; u.search = ''; return u.toString(); };
const withSchema = name => { const u = new URL(base); u.pathname = '/' + name; return u.toString(); };
const home = process.env.REHEARSAL_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'regen-rehearsal-'));
const stageDir = path.join(home, 'stage'), storage = path.join(home, 'audio');

function sh(cmd, args, options = {}) { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options }); }
console.log('Rehearsal folder:', home);
fs.rmSync(stageDir, { recursive: true, force: true });
sh('dropdb', ['--if-exists', '--maintenance-db', plain('postgres'), targetName]);
sh('createdb', ['--maintenance-db', plain('postgres'), targetName]);
sh('bash', ['-c', `pg_dump --no-owner --no-privileges "$SRC" | psql -q -v ON_ERROR_STOP=1 "$DST" > /dev/null`], { env: { ...process.env, SRC: plain(sourceName), DST: plain(targetName) } });
fs.rmSync(storage, { recursive: true, force: true });
const sourceAudio = path.resolve(process.env.AUDIO_STORAGE_PATH || './data/audio');
fs.mkdirSync(path.dirname(storage), { recursive: true });
sh('cp', ['-al', sourceAudio, storage]);                                   // hard links: the copy costs no space and the original is never touched

process.env.DATABASE_URL = withSchema(targetName);
delete process.env.VOXCPM_PRESET_PATH;
delete process.env.LOCAL_REVIEW_TOUR_ID;
process.env.AUDIO_STORAGE_PATH = storage;
process.env.REGEN_NEUTRALIZE_SCRIPT = path.join(__dirname, 'rehearsal/neutralize_double.py');
process.env.REGEN_RETRY_WAIT_MS = '1';

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const haversine = (a, b) => { const r = x => x * Math.PI / 180, d = Math.acos(Math.min(1, Math.sin(r(a.latitude)) * Math.sin(r(b.latitude)) + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.cos(r(a.longitude - b.longitude)))); return d * 6371000; };
const deps = {
  ...realDeps(),
  prisma: () => db,
  log: m => console.log('  ' + m),
  router: async (from, to) => { const meters = haversine(from, to) || 1; return { distanceMeters: meters, durationSeconds: meters / 1.3, coordinates: [[from.longitude, from.latitude], [(from.longitude + to.longitude) / 2, (from.latitude + to.latitude) / 2 + 0.0002], [to.longitude, to.latitude]] }; },
  // A fake renderer: writes a small file per piece plus the provenance sidecar the real renderer writes.
  render: async (input, jobDir, outputDir) => {
    fs.mkdirSync(jobDir, { recursive: true }); fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'input.json'), JSON.stringify(input));
    const results = [];
    for (const stop of input.stops) {
      const bytes = Buffer.from('ID3-rehearsal-' + stop.id + '-' + (stop.spokenText ?? stop.text));
      const file = path.join(outputDir, stop.id + '.mp3');
      fs.writeFileSync(file, bytes);
      fs.writeFileSync(path.join(outputDir, stop.id + '.provenance.json'), JSON.stringify({ spokenText: stop.spokenText ?? stop.text }));
      results.push({ id: stop.id, filename: stop.id + '.mp3', durationSeconds: 3, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') });
    }
    return { phase: 'rendered', completedStops: results.length, totalStops: results.length, results };
  },
  decode: file => { const sidecar = JSON.parse(fs.readFileSync(file.replace(/\.mp3$/, '.provenance.json'), 'utf8')); return Math.min(Math.max(sidecar.spokenText.length / 15, 1.5), 9.5); },
};

async function step(name, args, expect = 0) {
  console.log(`\n== ${name}`);
  const code = await runCommand(parseArgs([...args, '--stage', stageDir]), deps);
  assert.equal(code, expect, `${name} exited with ${code}`);
}

(async () => {
  try {
    // The user's decisions are test fixtures here, in this throwaway stage only. A real run never gets them from this tool.
    fs.mkdirSync(stageDir, { recursive: true });
    const approvals = ['sample-valencia', 'full-catalog', 'cue-templates'].map(scope => ({ scope, decision: 'approved', notes: 'REHEARSAL FIXTURE', at: new Date().toISOString() }));
    approvals.push({ scope: 'publish', decision: 'approved', authorizationReference: 'REHEARSAL FIXTURE: not an authorisation', notes: 'REHEARSAL FIXTURE', at: new Date().toISOString() });
    fs.writeFileSync(path.join(stageDir, 'approvals.json'), JSON.stringify({ approvals }, null, 1));

    await step('snapshot', ['snapshot', '--from-db']);
    await step('neutralize (estimate only)', ['neutralize']);
    await step('neutralize (fake model)', ['neutralize', '--execute']);
    await step('cues', ['cues']);
    await step('speech', ['speech']);
    await step('legs', ['legs']);
    await step('images', ['images']);
    await step('review-pack', ['review-pack']);
    await step('render plan', ['render']);
    await step('render', ['render', '--execute']);
    await step('stage-local', ['stage-local', '--storage', storage]);
    await step('package', ['package']);
    await step('verify', ['verify', '--storage', storage]);
    await step('status', ['status']);
    const stage = new Stage(stageDir);
    const report = stage.read('verify', 'report.json');
    console.log('\nREHEARSAL RESULT', JSON.stringify({ tours: report.tours, ok: report.ok, latency: report.latency, excluded: stage.state().excluded }, null, 1));
    assert(report.ok, 'verify did not pass');
  } finally {
    await db.$disconnect();
    if (!process.argv.includes('--keep')) { /* the folder is kept for inspection: it is under the OS temp directory */ }
  }
})().catch(error => { console.error('\nREHEARSAL FAILED:', error.stack || error.message); process.exit(1); });
