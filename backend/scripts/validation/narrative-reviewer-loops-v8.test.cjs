const { test } = require('node:test');
const assert = require('node:assert/strict');
const { correctionLoop, reuseValidResult } = require('./narrative-reviewer-loops-v8.cjs');

test('resume reuses only valid results of exactly the same request', () => {
  const row = { id: 'a', result: { status: 'valid', requestFingerprint: 'same', value: 'saved' } };
  assert.equal(reuseValidResult(row, 'same'), row.result);
  assert.equal(reuseValidResult(undefined, 'same'), null);
  assert.equal(reuseValidResult({ result: { status: 'transport_error' } }, 'same'), null);
  assert.equal(reuseValidResult({ result: { status: 'semantic_error' } }, 'same'), null);
  assert.throws(() => reuseValidResult(row, 'changed'), /mismatch/);
});

test('bounded corrections preserve every version, recheck edits, and never accept failed reviews', async () => {
  let corrections = 0;
  const failed = await correctionLoop('original', async () => ({ valid: false, issues: [] }), async () => { corrections++; });
  assert.equal(failed.status, 'review_failed'); assert.equal(corrections, 0);
  const unresolved = await correctionLoop('original', async () => ({ valid: true, issues: ['error'] }), async text => { corrections++; return text + ' edited'; });
  assert.equal(unresolved.status, 'unresolved'); assert.equal(corrections, 2);
  assert.deepEqual(unresolved.history.map(v => v.text), ['original', 'original edited', 'original edited edited']);
  let reviews = 0;
  const fixed = await correctionLoop('original', async () => ({ valid: true, issues: ++reviews === 1 ? ['error'] : [] }), async () => 'fixed');
  assert.equal(fixed.status, 'reviewer_accepted'); assert.equal(reviews, 2); assert.equal(fixed.text, 'fixed');
  const stalled = await correctionLoop('original', async () => ({ valid: true, issues: ['error'] }), async text => text);
  assert.equal(stalled.status, 'stalled'); assert.equal(stalled.history.length, 1);
  const broken = await correctionLoop('original', async () => ({ valid: true, issues: ['error'] }), async () => null);
  assert.equal(broken.status, 'correction_failed'); assert.equal(broken.text, 'original');
});
