// Applies (or rolls back) a catalogue update package (plan 04 section 10). Runs on the server from the release directory that
// contains this script, with /etc/tour-guide/backend.env and then /etc/tour-guide/migration.env (which can write).
//   node remote-update.cjs <catalog-update.json> [--dry-run | --rollback]
// Before touching anything it checks, for every tour, that the schema is migrated, that its audio is already in place and
// verified, and that it is still admitted with the fingerprint the package expects. Then one transaction per tour, each verified
// after COMMIT with a separate connection and compensated on the spot when it is not admitted. Nothing old is deleted.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const { applyTourUpdate, rollbackTourUpdate } = require('./backend/dist/services/regeneration/applyUpdate');
const { createVerifier } = require('./backend/dist/services/regeneration/fingerprint');

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('usage: node remote-update.cjs <catalog-update.json> [--dry-run | --rollback]'); process.exit(2); }
const rollback = flags.includes('--rollback'), dryRun = flags.includes('--dry-run');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const storage = path.resolve(process.env.AUDIO_STORAGE_PATH || './data/audio');
const db = new PrismaClient();
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function preconditions(verify) {
  const problems = [];
  const columns = await db.$queryRawUnsafe(`select table_name, column_name from information_schema.columns where table_schema = 'public'`);
  const has = (t, c) => columns.some(r => r.table_name === t && r.column_name === c);
  for (const [t, c] of [['places', 'spoken_text'], ['tours', 'introduction_spoken_text'], ['tour_cue_audio', 'spoken_text'], ['tour_walking_legs', 'sha256']]) {
    if (!has(t, c)) problems.push(`schema is not migrated: ${t}.${c} is missing`);
  }
  if (problems.length) return problems;
  for (const entry of pkg.tours) {
    const current = await db.tour.findUnique({ where: { id: entry.tourId }, select: { metadata: true } });
    const fingerprint = current?.metadata?.pilotRelease?.fingerprint;
    if (!rollback) {
      if (fingerprint === entry.update.metadata.pilotRelease.fingerprint) continue;                       // already applied
      const state = await verify(entry.tourId);
      if (fingerprint !== entry.expectedCurrentFingerprint) { problems.push(`${entry.tourId}: changed since the snapshot (it will be skipped)`); continue; }
      if (!state.admitted) problems.push(`${entry.tourId}: not admitted by this release before the update (the release does not match the data)`);
      const files = [entry.update.introductionAudio, ...entry.update.audioAssets, ...entry.update.cues];
      for (const f of files) {
        const target = path.join(storage, f.storagePath);
        if (!fs.existsSync(target)) problems.push(`${entry.tourId}: audio file missing ${f.storagePath}`);
        else if (sha(target) !== f.metadata.fileSha256) problems.push(`${entry.tourId}: audio file differs from the package ${f.storagePath}`);
      }
    }
  }
  return problems;
}

(async () => {
  try {
    const verify = createVerifier(db);
    const problems = await preconditions(verify);
    const blocking = problems.filter(p => !p.endsWith('(it will be skipped)'));
    if (blocking.length) { console.error('PRECONDITIONS FAILED:\n' + blocking.join('\n')); process.exitCode = 1; return; }
    if (problems.length) console.log('Notes:\n' + problems.join('\n'));
    if (dryRun) { console.log(JSON.stringify({ dryRun: true, tours: pkg.tours.length, preconditions: 'ok' })); return; }
    const outcomes = [];
    for (const entry of pkg.tours) {
      const outcome = rollback ? await rollbackTourUpdate(db, entry) : await applyTourUpdate(db, entry, verify);
      outcomes.push(outcome);
      console.log(`${entry.tourId}: ${outcome.status}${outcome.reason ? ' (' + outcome.reason + ')' : ''}`);
    }
    const count = status => outcomes.filter(o => o.status === status).length;
    console.log(JSON.stringify({ mode: rollback ? 'rollback' : 'update', updated: count('updated'), skipped: count('skipped'), failed: count('failed'), compensated: count('compensated') }));
    if (count('failed') || count('compensated')) process.exitCode = 1;
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
