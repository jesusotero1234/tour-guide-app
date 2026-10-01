// Regression: introductions have no place UUID but must contribute listening time.
// Run after a production build. All audio, API and analytics calls use fixtures.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://127.0.0.1:3189';
const token = 'audio-consent-test-proxy-token-long-enough';
const tour = { id: '11111111-1111-4111-8111-111111111111', city: 'Madrid', country: 'España', language: 'en', status: 'published', introduction: 'Welcome to Madrid.', introductionAudio: { status: 'completed', audioUrl: '/fixture-audio/intro.wav', version: 'v1' }, places: [{ id: '22222222-2222-4222-8222-222222222222', name: 'First stop', description: 'A story.', position: 1, latitude: 40.416, longitude: -3.71, audioUrl: '/fixture-audio/stop.wav', audioVersion: 'v1' }] };
const wav = Buffer.alloc(44 + 160000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3189'], {
  cwd: resolve(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', PILOT_MODE: 'true', PILOT_PROXY_TOKEN: token, UMAMI_SCRIPT_URL: 'https://stats.example.org/script.js', UMAMI_WEBSITE_ID: '33333333-3333-4333-8333-333333333333' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => output = (output + data).slice(-3000));
(async () => {
  let browser;
  try {
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw Error(output);
      try { if ((await fetch(origin + '/tours', { headers: { 'x-pilot-proxy-token': token } })).ok) break; } catch {}
      if (n === 99) throw Error('Frontend not ready: ' + output);
      await delay(100);
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    const context = await browser.newContext({ locale: 'en-GB', extraHTTPHeaders: { 'x-pilot-proxy-token': token } });
    const events = [], errors = [];
    await context.route('https://stats.example.org/**', route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (route.request().url().endsWith('script.js')) return route.fulfill({ headers, contentType: 'application/javascript', body: 'window.umami={getSession:()=>({})};' });
      events.push(route.request().postDataJSON().payload);
      return route.fulfill({ headers, json: { cache: 'fixture' } });
    });
    await context.route('**/api/backend/**', route => route.fulfill({ json: route.request().url().endsWith('/audio') ? { status: 'completed', introduction: tour.introductionAudio, audioUrls: { [tour.places[0].id]: tour.places[0].audioUrl }, canGenerate: false } : tour }));
    await context.route('**/fixture-audio/**', route => route.fulfill({ contentType: 'audio/wav', body: wav }));
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/tours/' + tour.id + '?listen=1');
    await page.getByRole('button', { name: 'Accept statistics', exact: true }).click();
    await page.waitForFunction(() => !!window.umami);
    await page.getByRole('button', { name: 'Understood, start', exact: true }).click();
    async function listenBriefly(measure = true) {
      await page.locator('.player-play').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="tour-audio"]')?.currentTime > 0.6);
      const sent = measure ? page.waitForResponse(r => r.url().endsWith('/api/send') && r.request().method() === 'POST' && r.request().postDataJSON().payload.name === 'audio_listening') : Promise.resolve();
      await page.locator('.player-play').click();
      await sent;
    }
    await listenBriefly();
    const intro = events.find(e => e.name === 'audio_listening');
    assert.equal(intro.data.segment, 'introduction'); assert.equal(intro.data.place_id, undefined); assert.ok(intro.data.seconds > 0);
    await page.locator('.introduction-continue').click();
    await listenBriefly(); await delay(150);
    assert.ok(events.some(e => e.name === 'audio_listening' && e.data.place_id === tour.places[0].id && e.data.seconds > 0));
    await page.goto(origin + '/privacy');
    await page.locator('.privacy-settings-link').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reject statistics', exact: true }).click();
    const before = events.length;
    await page.goto(origin + '/tours/' + tour.id + '?listen=1');
    await listenBriefly(false); await delay(150);
    assert.equal(events.length, before); assert.deepEqual(errors, []);
    console.log('PASS: real introduction and stop listening events; no fabricated place ID; consent withdrawal stops events.');
  } finally {
    if (browser) await browser.close();
    child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
