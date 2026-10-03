// node --test frontend/scripts/test-tour-state.cjs   (progress migration, order storage, legs helpers; no browser needed)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs, fakeStorage } = require('./lib/load-ts.cjs');

const key = (tour, place, version) => `tour-listening:${tour}:${place}:${version}`;

test('a completed mark moves to the new audio version, without the position', () => {
  const localStorage = fakeStorage({ [key('t', 'p1', 'old.v1')]: JSON.stringify({ position: 90, duration: 100, completed: true }), [key('t', 'p2', 'old.v1')]: JSON.stringify({ position: 5, duration: 100, completed: false }) });
  const { readListeningProgress } = loadTs('lib/tourProgress.ts', { globals: { localStorage } });
  assert.deepEqual(readListeningProgress(key('t', 'p1', 'new.v2')), { position: 0, duration: 0, completed: true });
  assert.equal(localStorage.getItem(key('t', 'p1', 'old.v1')), null, 'the old keys of that stop are removed');
  assert.equal(JSON.parse(localStorage.getItem(key('t', 'p1', 'new.v2'))).completed, true, 'and the new one is saved');
  assert.deepEqual(readListeningProgress(key('t', 'p2', 'new.v2')), { position: 0, duration: 0, completed: false }, 'a stop that was not completed gets nothing');
  assert.notEqual(localStorage.getItem(key('t', 'p2', 'old.v1')), null);
});

test('the migration touches only the same tour and the same stop, and an existing key wins', () => {
  const localStorage = fakeStorage({ [key('t', 'p1', 'a')]: JSON.stringify({ position: 1, duration: 10, completed: true }), [key('other', 'p1', 'a')]: JSON.stringify({ position: 1, duration: 10, completed: true }),
    [key('t', 'p3', 'b')]: JSON.stringify({ position: 4, duration: 10, completed: false }) });
  const { readListeningProgress } = loadTs('lib/tourProgress.ts', { globals: { localStorage } });
  assert.equal(readListeningProgress(key('other', 'p9', 'z')).completed, false);
  assert.equal(readListeningProgress(key('t', 'p1', 'b')).completed, true);
  assert.notEqual(localStorage.getItem(key('other', 'p1', 'a')), null);
  assert.deepEqual(readListeningProgress(key('t', 'p3', 'b')), { position: 4, duration: 10, completed: false });
  const introduction = fakeStorage({ [key('t', 'introduction', 'i1')]: JSON.stringify({ position: 3, duration: 9, completed: true }) });
  assert.equal(loadTs('lib/tourProgress.ts', { globals: { localStorage: introduction } }).readListeningProgress(key('t', 'introduction', 'i2')).completed, true);
});

test('blocked storage and odd keys never throw', () => {
  const localStorage = fakeStorage(); localStorage.failures = true;
  const { readListeningProgress } = loadTs('lib/tourProgress.ts', { globals: { localStorage } });
  assert.deepEqual(readListeningProgress(key('t', 'p', 'v')), { position: 0, duration: 0, completed: false });
  assert.deepEqual(loadTs('lib/tourProgress.ts', { globals: { localStorage: fakeStorage() } }).readListeningProgress('something-else'), { position: 0, duration: 0, completed: false });
});

const ids = ['a', 'b', 'c', 'd'];
test('a saved order is used while the tour version is the same, and dropped when it changes', () => {
  const localStorage = fakeStorage();
  const order = loadTs('lib/tourOrder.ts', { globals: { localStorage } });
  const saved = order.startFrom(ids, ids, 'c', new Set(), () => 1, new Date('2026-10-01T00:00:00Z'));
  assert.deepEqual(saved.placeIds, ['c', 'a', 'b', 'd']);
  order.saveTourOrder('t', 'v1', saved);
  assert.deepEqual(order.readTourOrder('t', 'v1', ids).placeIds, ['c', 'a', 'b', 'd']);
  assert.equal(order.readTourOrder('t', 'v2', ids), null, 'another fingerprint: the custom order is discarded');
  assert.equal(localStorage.getItem('tour-order:t:v1'), null, 'and the old one is removed');
  assert.deepEqual(order.activeOrder(ids, null), ids);
  assert.deepEqual(order.activeOrder(ids, saved), saved.placeIds);
});

test('a saved order that is not a permutation of the stops is ignored', () => {
  const localStorage = fakeStorage({ 'tour-order:t:v1': JSON.stringify({ version: 1, mode: 'custom', placeIds: ['a', 'b'], startPlaceId: 'a', createdAt: 'x' }) });
  assert.equal(loadTs('lib/tourOrder.ts', { globals: { localStorage } }).readTourOrder('t', 'v1', ids), null);
  const garbage = fakeStorage({ 'tour-order:t:v1': '{not json' });
  assert.equal(loadTs('lib/tourOrder.ts', { globals: { localStorage: garbage } }).readTourOrder('t', 'v1', ids), null);
});

test('start at X: pending stops by the cheapest walk, listened ones last and never lost', () => {
  const { startFrom, isRecommended } = loadTs('lib/tourOrder.ts', { globals: { localStorage: fakeStorage() } });
  const line = { a: 0, b: 1, c: 2, d: 3, e: 4 };
  const cost = (x, y) => Math.abs(line[x] - line[y]);
  const all = Object.keys(line);
  const order = startFrom(all, all, 'c', new Set(['a']), cost);
  assert.deepEqual(order.placeIds, ['c', 'b', 'd', 'e', 'a']);
  assert.equal(order.placeIds[0], 'c');
  assert.equal(order.placeIds.at(-1), 'a', 'the listened stop goes last');
  assert.deepEqual([...order.placeIds].sort(), all);
  assert.equal(order.startPlaceId, 'c');
  assert.equal(isRecommended(all, all), true);
  assert.equal(isRecommended(all, order.placeIds), false);
  assert.deepEqual(startFrom(all, all, 'a', new Set(), cost).placeIds, all, 'starting where the recommended order starts changes nothing');
});

test('the legs give times from the matrix, and from the coordinates when they do not know a pair', () => {
  const { legSeconds, legMeters, orderedLegs, estimatedSeconds, haversineMeters } = loadTs('lib/walkingLegs.ts', { globals: {} });
  const legs = { version: 1, provider: 'p', computedAt: 'x', stopIds: ['a', 'b'], durationsSeconds: [[0, 300], [300, 0]], distancesMeters: [[0, 400], [400, 0]], geometries: { 'a|b': '_p~iF~ps|U_ulLnnqC' } };
  const points = { a: { latitude: 0, longitude: 0 }, b: { latitude: 0, longitude: 0.001 }, c: { latitude: 0, longitude: 0.002 } };
  assert.equal(legSeconds(legs, 'a', 'b', points), 300);
  assert.equal(legMeters(legs, 'b', 'a', points), 400);
  assert.equal(legSeconds(legs, 'a', 'c', points), estimatedSeconds(haversineMeters(points.a, points.c)));
  assert.equal(legSeconds(null, 'a', 'b', points), estimatedSeconds(haversineMeters(points.a, points.b)));
  assert.ok(Math.abs(estimatedSeconds(130) - 130) < 1e-9, '1.3 detour at 1.3 m/s is one second per metre');
  assert.equal(legSeconds(null, 'a', 'zzz', points), Infinity);
  const forward = orderedLegs(legs, ['a', 'b'])[0], backward = orderedLegs(legs, ['b', 'a'])[0];
  assert.deepEqual(forward.line, [[38.5, -120.2], [40.7, -120.95]]);
  assert.deepEqual(backward.line, [[40.7, -120.95], [38.5, -120.2]], 'a leg walked the other way is drawn reversed');
  assert.equal(orderedLegs({ ...legs, geometries: {} }, ['a', 'b'])[0].line, null, 'a missing geometry is reported so the map draws a dashed line');
  assert.equal(orderedLegs({ ...legs, geometries: { 'a|b': '!!!' } }, ['a', 'b'])[0].line, null);
});

test('the privacy button clears the new keys too', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/legal/ClearProgressButton.tsx'), 'utf8');
  const pattern = new RegExp(source.match(/test\(key\)/) ? source.match(/filter\(key => (\/.*?\/)\.test/)[1].slice(1, -1) : '');
  for (const name of ['tour-order:t:v1', 'tour-location:v1', 'tour-listening:x', 'tour-selection:x', 'tour-notice:v1']) assert.ok(pattern.test(name), name);
  assert.equal(pattern.test('tour-privacy-v1'), false, 'the consent record is not progress');
});

test('pilot mode proxies the link clips and the walking legs, and still nothing else', () => {
  const { pilotPathAllowed } = loadTs('lib/pilotPaths.ts');
  const id = '11111111-1111-4111-8111-111111111111', place = '22222222-2222-4222-8222-222222222222';
  for (const ok of ['tours', 'tours?language=es&limit=50', `tours/${id}`, `tours/${id}/walking-route`, `tours/${id}/walking-legs`, `tours/${id}/provenance`, `tours/${id}/audio`,
    `tours/${id}/audio/introduction`, `tours/${id}/audio/${place}?v=abc.def`, `tours/${id}/cue/finish`, `tours/${id}/cue/first/${place}`, `tours/${id}/cue/next/${place}?v=abc.def`]) assert.ok(pilotPathAllowed(ok), ok);
  for (const bad of [`tours/${id}/cue`, `tours/${id}/cue/other/${place}`, `tours/${id}/cue/first`, `tours/${id}/cue/first/not-a-uuid`, `tours/${id}/cue/finish/extra`, `tours/${id}/cue/next/${place}?v=<script>`,
    `tours/${id}/walking-legs/x`, `tours/generate`, `cities/madrid/concepts`, `tours/${id}/../x`, 'passes/flexible/quote']) assert.ok(!pilotPathAllowed(bad), bad);
});

test('the link clip that follows each position, in any order', () => {
  const { cueRefAfter, cueFor } = loadTs('lib/playerPlan.ts');
  const order = ['c', 'a', 'b'];
  assert.deepEqual(cueRefAfter(order, { kind: 'introduction' }), { kind: 'first', placeId: 'c' });
  assert.deepEqual(cueRefAfter(order, { kind: 'stop', placeId: 'c' }), { kind: 'next', placeId: 'a' });
  assert.deepEqual(cueRefAfter(order, { kind: 'stop', placeId: 'a' }), { kind: 'next', placeId: 'b' });
  assert.deepEqual(cueRefAfter(order, { kind: 'stop', placeId: 'b' }), { kind: 'finish' });
  assert.equal(cueRefAfter(order, { kind: 'stop', placeId: 'zz' }), null);
  assert.equal(cueRefAfter([], { kind: 'introduction' }), null);
  const cues = { first: { c: { text: 'F', audioUrl: '/f' } }, next: { a: { text: 'N', audioUrl: '/n' } }, finish: { text: 'E', audioUrl: '/e' } };
  assert.equal(cueFor(cues, { kind: 'first', placeId: 'c' }).audioUrl, '/f');
  assert.equal(cueFor(cues, { kind: 'next', placeId: 'a' }).audioUrl, '/n');
  assert.equal(cueFor(cues, { kind: 'finish' }).audioUrl, '/e');
  assert.equal(cueFor(cues, { kind: 'next', placeId: 'b' }), undefined, 'a missing clip is simply not played');
  assert.equal(cueFor(undefined, { kind: 'finish' }), undefined);
});

test('arrival needs two consecutive readings inside the radius, which grows with a poor accuracy', () => {
  const { updateStreaks, reached, arrivalRadius } = loadTs('lib/arrival.ts');
  const stops = [{ id: 'a', latitude: 39.47, longitude: -0.376 }, { id: 'b', latitude: 39.48, longitude: -0.376 }];
  const near = { latitude: 39.47 + 0.0002, longitude: -0.376 };                  // about 22 m
  let streaks = updateStreaks({}, near, stops);
  assert.equal(reached(streaks, 'a'), false, 'one reading is not enough');
  streaks = updateStreaks(streaks, near, stops);
  assert.equal(reached(streaks, 'a'), true);
  assert.equal(reached(streaks, 'b'), false);
  streaks = updateStreaks(streaks, { latitude: 39.4710, longitude: -0.376 }, stops);   // about 110 m: back outside
  assert.equal(streaks.a, 0, 'leaving resets the count');
  const poor = { latitude: 39.47 + 0.0006, longitude: -0.376, accuracy: 120 };    // about 67 m away but 120 m of uncertainty
  assert.equal(arrivalRadius(poor), 120);
  assert.equal(arrivalRadius({ ...near, accuracy: 5 }), 35);
  assert.equal(arrivalRadius(near), 35);
  assert.equal(reached(updateStreaks(updateStreaks({}, poor, stops), poor, stops), 'a'), true);
});

test('distances read as a person says them, in the language of the page', () => {
  const { formatDistanceLabel, walkingMinutes } = loadTs('lib/geo.ts');
  assert.equal(formatDistanceLabel(350, 'es'), '350 m');
  assert.equal(formatDistanceLabel(1234, 'es'), '1,2 km');
  assert.equal(formatDistanceLabel(1234, 'en'), '1.2 km');
  assert.equal(formatDistanceLabel(1234, 'de'), '1,2 km');
  assert.equal(formatDistanceLabel(47, 'es'), '45 m');
  assert.equal(formatDistanceLabel(3, 'es'), '5 m');
  assert.equal(formatDistanceLabel(996, 'es'), '1 km');
  assert.equal(formatDistanceLabel(Infinity, 'es'), '');
  assert.equal(walkingMinutes(20), 1);
  assert.equal(walkingMinutes(350), 6);
});

test('every language has every flexible-walk text, with the same placeholders', () => {
  const { flexibleCopy } = loadTs('components/tour/flexibleCopy.ts');
  const reference = flexibleCopy('en');
  for (const language of ['es', 'fr', 'de', 'it']) {
    const copy = flexibleCopy(language);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(reference).sort(), language);
    for (const [key, value] of Object.entries(reference)) {
      if (typeof value === 'function') {
        const args = ['<A>', '<B>', 3].slice(0, value.length);
        const text = copy[key](...args);
        for (const argument of args) assert.ok(text.includes(String(argument)), `${language}.${key} lost an argument: ${text}`);
      } else assert.ok(copy[key].trim() && copy[key] !== reference[key], `${language}.${key}`);
    }
  }
});

test('the player speaks German and Italian completely, not English with five words changed', () => {
  const { listeningCopy } = loadTs('components/tour/listeningCopy.ts');
  const english = listeningCopy('en');
  const looksEnglish = text => /\b(the|your|is|not|stop|audio is|listen|we’ll)\b/i.test(text);
  for (const language of ['de', 'it', 'es', 'fr']) {
    const copy = listeningCopy(language);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort(), language);
    const same = Object.keys(english).filter(key => typeof english[key] === 'string' && copy[key] === english[key] && !['introduction', 'map', 'stop', 'photos', 'story'].includes(key));
    assert.deepEqual(same, [], `${language} still has English text for: ${same.join(', ')}`);
    assert.ok(Object.values(copy).every(value => (typeof value === 'string' && value.trim()) || typeof value === 'function'), language);
  }
  for (const language of ['es', 'fr', 'de', 'it']) {
    const copy = listeningCopy(language);
    for (const key of Object.keys(english).filter(k => typeof english[k] === 'function')) {
      const args = ['<A>', 7].slice(0, english[key].length);
      for (const argument of args) assert.ok(copy[key](...(key === 'stopsListened' ? [3, 7] : args)).includes(String(key === 'stopsListened' ? 7 : argument)), `${language}.${key} lost an argument`);
    }
  }
  assert.ok(!looksEnglish(listeningCopy('de').safety) && !looksEnglish(listeningCopy('it').safety));
  assert.equal(listeningCopy('xx'), english, 'unknown languages fall back to English');
});
