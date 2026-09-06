// Run: node scripts/test-generation-progress.cjs (no server or network required).
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('../frontend/node_modules/typescript');

function load(file, mocks = {}, runtime = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const unexpected = name => { throw new Error('Unexpected call: ' + name); };
  new Function('require', 'exports', 'fetch', 'process', 'console', 'setTimeout', 'clearTimeout', code)(
    name => name in mocks ? mocks[name] : unexpected(name), exports,
    runtime.fetch ?? (() => unexpected('fetch')), { env: { API_KEY: 'test', NODE_ENV: 'test' } },
    runtime.console ?? console, runtime.setTimeout ?? setTimeout, runtime.clearTimeout ?? clearTimeout,
  );
  return exports;
}

async function main() {
  const body = JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } });
  const proxy = load('frontend/src/lib/backendProxy.ts', { 'next/server': { NextResponse: Response } }, {
    fetch: async () => new Response(body, {
      status: 429, headers: { 'Retry-After': '120', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }),
  });
  for (const stream of [false, true]) {
    const response = await proxy.proxyBackend('tours/generation-jobs/test', undefined, stream);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '120');
    if (stream) assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), body);
  }

  let retryAfter = '120';
  const api = load('frontend/src/lib/api.ts', {}, {
    fetch: async () => new Response(body, {
      status: 429, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter },
    }),
  });
  let rateError;
  try { await api.getGenerationJob('test'); } catch (error) { rateError = error; }
  assert.equal(rateError.status, 429);
  assert.equal(rateError.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(rateError.retryAfterMs, 120000);
  retryAfter = new Date(Date.now() + 120000).toUTCString();
  await assert.rejects(api.getGenerationJob('test'), error => error.retryAfterMs > 118000 && error.retryAfterMs <= 120000);
  for (retryAfter of [null, '', 'invalid', '-1', '1.5']) {
    await assert.rejects(api.getGenerationJob('test'), error => error.retryAfterMs === undefined);
  }

  const timers = new Map(), states = [], errors = [], redirects = [];
  let effect, hook = 0, timerId = 0, nextError, nextJob = { id: 'test', status: 'running', step: 'routing' };
  const component = load('frontend/src/components/tour/GenerationProgress.tsx', {
    react: {
      useEffect: callback => { effect = callback; },
      useState: initial => { const index = hook++; states[index] = initial; return [initial, value => { states[index] = value; }]; },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => ({ replace: path => redirects.push(path) }) },
    '@/lib/api': { getGenerationJob: async () => { if (nextError) throw nextError; return nextJob; } },
  }, {
    console: { error: (...args) => errors.push(args) },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  const tick = async () => {
    assert.equal(timers.size, 1);
    const [id, timer] = [...timers][0];
    timers.delete(id);
    await timer.callback();
  };
  const delay = () => [...timers.values()][0]?.delay;
  component.GenerationProgress({ jobId: 'test' });
  const cleanup = effect();
  await new Promise(setImmediate);
  assert.equal(delay(), 15000);
  const previousJob = states[0];
  nextError = rateError;
  await tick();
  assert.equal(delay(), 120000);
  assert.equal(states[0], previousJob);
  assert.match(states[1], /resume automatically/);
  assert.equal(errors.length, 0);
  nextError = Object.assign(new Error('throttled'), { status: 429 });
  await tick();
  assert.equal(delay(), 60000);
  nextError = undefined;
  await tick();
  assert.equal(delay(), 15000);
  assert.equal(states[1], null);
  nextJob = { id: 'test', status: 'completed', result: { tourId: 'tour-1' } };
  await tick();
  assert.equal(timers.size, 0);
  assert.deepEqual(redirects, ['/tours/tour-1']);

  // Cleanup stops pending polling.
  nextJob = previousJob;
  hook = 0;
  component.GenerationProgress({ jobId: 'test' });
  const cleanupAgain = effect();
  await new Promise(setImmediate);
  assert.equal(timers.size, 1);
  cleanupAgain();
  assert.equal(timers.size, 0);
  cleanup();
  console.log('PASS: Retry-After survives the proxy, polling waits without losing progress, recovers, and stops on completion/unmount.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
