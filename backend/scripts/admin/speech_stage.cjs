// Spoken text of a batch city, shared by the audio scripts (plan 02 section 8).
// final/<language>.speech.json is written next to final/<language>.json by deepseek-batch-text.py and bound to its hash.
// A city without that file is a legacy city: no spokenText, and its audio ids and hashes stay exactly as they were.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function loadSpeech(cityDir, language) {
  const file = path.join(cityDir, 'final', language + '.speech.json');
  if (!fs.existsSync(file)) return null;
  const speech = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (speech.finalSha256 !== sha(path.join(cityDir, 'final', language + '.json')))
    throw Error('Spoken text is stale for ' + language + ': regenerate final/' + language + '.speech.json');
  const residue = speech.pieces.filter(row => !['clean', 'ok'].includes(row.status));
  if (residue.length)
    throw Error('Spoken text still has residue in ' + residue.map(row => row.pieceId).join(', ') + ': repair it before rendering');
  return { version: speech.speechVersion, byPiece: Object.fromEntries(speech.pieces.map(row => [row.pieceId, row.spokenText])) };
}

// The first chapter is preceded by the voice-disclosure notice, which has no digits and is spoken as written.
function spokenText(speech, pieceId, index, disclosure) {
  if (!speech) return undefined;
  const body = speech.byPiece[pieceId];
  if (typeof body !== 'string' || !body.trim()) throw Error('Missing spoken text for ' + pieceId);
  return index === 0 ? disclosure + '\n\n' + body : body;
}

module.exports = { loadSpeech, spokenText };
