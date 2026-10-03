const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadSpeech, spokenText } = require('./speech_stage.cjs');

function city(rows, tamper) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-stage-'));
  fs.mkdirSync(path.join(dir, 'final'));
  const final = JSON.stringify({ language: 'es', pieces: [] });
  fs.writeFileSync(path.join(dir, 'final/es.json'), final);
  const sha = crypto.createHash('sha256').update(final).digest('hex');
  if (rows) fs.writeFileSync(path.join(dir, 'final/es.speech.json'), JSON.stringify({ speechVersion: 'speech-1', finalSha256: tamper ? 'x' : sha, pieces: rows }));
  return dir;
}

test('a city without a speech file is a legacy city and gets no spoken text', () => {
  const speech = loadSpeech(city(null), 'es');
  assert.equal(speech, null);
  assert.equal(spokenText(speech, 'p1', 1, 'Aviso.'), undefined);
});

test('clean and repaired pieces load; the disclosure goes only before the first chapter', () => {
  const speech = loadSpeech(city([{ pieceId: 'welcome', spokenText: 'Bienvenida.', status: 'clean' }, { pieceId: 'p1', spokenText: 'Año mil doscientos.', status: 'ok' }]), 'es');
  assert.equal(speech.version, 'speech-1');
  assert.equal(spokenText(speech, 'welcome', 0, 'Aviso.'), 'Aviso.\n\nBienvenida.');
  assert.equal(spokenText(speech, 'p1', 1, 'Aviso.'), 'Año mil doscientos.');
});

test('residue, a stale file and a missing piece stop the render instead of speaking digits', () => {
  assert.throws(() => loadSpeech(city([{ pieceId: 'p1', spokenText: 'Via Roma 3', status: 'residue' }]), 'es'), /residue in p1/);
  assert.throws(() => loadSpeech(city([{ pieceId: 'p1', spokenText: 'x', status: 'needs_manual' }]), 'es'), /residue in p1/);
  assert.throws(() => loadSpeech(city([{ pieceId: 'p1', spokenText: 'x', status: 'clean' }], true), 'es'), /stale/);
  const speech = loadSpeech(city([{ pieceId: 'p1', spokenText: 'x', status: 'clean' }]), 'es');
  assert.throws(() => spokenText(speech, 'other', 1, 'Aviso.'), /Missing spoken text/);
});
