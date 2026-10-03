// node --test frontend/scripts/test-route-order.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./lib/load-ts.cjs');
const { bestOpenPath } = loadTs('lib/routeOrder.ts');

const points = { a: [0, 0], b: [0, 1], c: [0, 2], d: [1, 2], e: [1, 0], f: [2, 1], g: [3, 3], h: [2, 3] };
const dist = (x, y) => Math.hypot(points[x][0] - points[y][0], points[x][1] - points[y][1]);
const total = (path, cost = dist) => path.slice(1).reduce((sum, id, i) => sum + cost(path[i], id), 0);
function permutations(items) { return items.length <= 1 ? [items] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [x, ...rest])); }
const bruteForce = (start, ids, cost) => permutations(ids).map(p => [start, ...p]).reduce((best, path) => (total(path, cost) < total(best, cost) - 1e-9 ? path : best));

test('one and two stops', () => {
  assert.deepEqual(bestOpenPath('a', [], dist), ['a']);
  assert.deepEqual(bestOpenPath('a', ['b'], dist), ['a', 'b']);
  assert.deepEqual(bestOpenPath('a', ['c', 'b'], dist), ['a', 'b', 'c']);
});

test('the exact search equals brute force for up to eight stops, from every start', () => {
  const ids = Object.keys(points);
  for (const start of ids) {
    const others = ids.filter(id => id !== start);
    for (const size of [3, 5, 7]) {
      const subset = others.slice(0, size), found = bestOpenPath(start, subset, dist);
      assert.equal(found.length, subset.length + 1);
      assert.equal(found[0], start);
      assert.deepEqual([...found].sort(), [start, ...subset].sort());
      assert.ok(Math.abs(total(found) - total(bruteForce(start, subset, dist))) < 1e-9, `${start} ${size}`);
    }
  }
});

test('it handles asymmetric costs, which the exact search must respect', () => {
  const cost = (x, y) => (y > x ? 1 : 10);
  assert.deepEqual(bestOpenPath('a', ['c', 'b'], cost), ['a', 'b', 'c']);
});

test('it is stable: equal costs keep the order given', () => {
  const flat = () => 1;
  assert.deepEqual(bestOpenPath('s', ['x', 'y', 'z'], flat), ['s', 'x', 'y', 'z']);
  assert.deepEqual(bestOpenPath('s', ['z', 'y', 'x'], flat), ['s', 'z', 'y', 'x']);
});

test('beyond twelve stops it still visits each stop once and does not lose to the given order', () => {
  const ids = Array.from({ length: 30 }, (_, i) => 'p' + i);
  const xy = Object.fromEntries(ids.map((id, i) => [id, [Math.sin(i * 12.9898) * 43758 % 1 * 100, Math.cos(i * 78.233) * 43758 % 1 * 100]]));
  xy.start = [50, 50];
  const cost = (x, y) => Math.hypot(xy[x][0] - xy[y][0], xy[x][1] - xy[y][1]);
  const found = bestOpenPath('start', ids, cost);
  assert.equal(found.length, 31);
  assert.deepEqual([...found].sort(), ['start', ...ids].sort());
  assert.ok(total(found, cost) <= total(['start', ...ids], cost) + 1e-9);
  assert.deepEqual(bestOpenPath('start', ids, cost), found, 'deterministic');
});

test('Valencia esencial: starting at Torres de Serranos, optimising beats rotating the original order', () => {
  // Straight-line kilometres between the nine real stops, in the published order (plan 05 section 4.2): rotating gives 3.15 km, the best order 2.51 km.
  const names = ['plaza', 'catedral', 'lonja', 'mercado', 'colon', 'estacion', 'jardines', 'ciutat', 'serranos'];
  const lat = [39.4753, 39.4759, 39.4743, 39.4739, 39.4690, 39.4665, 39.4780, 39.4540, 39.4797];
  const lng = [-0.3764, -0.3753, -0.3784, -0.3794, -0.3703, -0.3773, -0.3855, -0.3510, -0.3763];
  const km = (a, b) => { const i = names.indexOf(a), j = names.indexOf(b), r = x => x * Math.PI / 180; return 6371 * Math.acos(Math.min(1, Math.sin(r(lat[i])) * Math.sin(r(lat[j])) + Math.cos(r(lat[i])) * Math.cos(r(lat[j])) * Math.cos(r(lng[i] - lng[j])))); };
  const rest = names.filter(n => n !== 'serranos');
  const optimised = bestOpenPath('serranos', rest, km);
  const rotated = ['serranos', ...rest];
  assert.ok(total(optimised, km) <= total(rotated, km) + 1e-9);
  assert.equal(optimised[0], 'serranos');
});
