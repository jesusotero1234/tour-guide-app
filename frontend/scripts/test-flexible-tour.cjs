// BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node frontend/scripts/test-flexible-tour.cjs
// Order-flexible walk (plan 05): start near you, reordered stops, link clips, arrival notice, lock-screen actions. Intercepts every
// request with src/fixtures/flexible-tour.json and never writes to a database. SHOTS=<dir> saves the 390x844 and 360x740 captures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/fixtures/flexible-tour.json'), 'utf8'));
const wav = seconds => {
  const bytes = Buffer.alloc(44 + 16000 * seconds);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
};
const BODY = wav(8), LINK = wav(1);
const stops = fixture.tour.places;
const near = (i, shift = 0) => ({ latitude: stops[i].latitude + 0.0001 + shift, longitude: stops[i].longitude, accuracy: 8 });   // about 11 m away
const text = ['Torres de Serranos', 'Plaza de la Virgen', 'Lonja de la Seda', 'Mercado Central'];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const make = async (viewport = { width: 390, height: 844 }) => {
    const context = await browser.newContext({ locale: 'es-ES', viewport, reducedMotion: 'reduce', permissions: ['geolocation'], geolocation: near(2) });
    // Lock-screen actions: capture what the player registers, so the test can press "next" and "previous" as the phone would.
    await context.addInitScript(() => {
      window.mediaHandlers = {};
      if ('mediaSession' in navigator) {
        const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
        navigator.mediaSession.setActionHandler = (action, handler) => { if (handler) window.mediaHandlers[action] = handler; else delete window.mediaHandlers[action]; try { original(action, handler); } catch { /* ignore */ } };
      }
      localStorage.setItem('tour-privacy-v1', JSON.stringify({ version: 1, analytics: false, savedAt: Date.now() }));
      window.vibrations = [];
      navigator.vibrate = pattern => { window.vibrations.push(pattern); return true; };
    });
    const state = { flexible: true, tour: structuredClone(fixture.tour), audio: structuredClone(fixture.audio), legs: fixture.legs };
    await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
    await context.route('**/api/backend/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/cue/')) return route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: LINK });
      if (url.pathname.endsWith('/walking-legs')) return state.flexible ? route.fulfill({ json: { data: state.legs } }) : route.fulfill({ status: 404, json: { error: { code: 'TOUR_NOT_FOUND' } } });
      if (url.pathname.endsWith('/walking-route')) return route.fulfill({ status: 503, json: { error: { message: 'test' } } });
      if (url.pathname.endsWith('/audio')) { const audio = structuredClone(state.audio); if (!state.flexible) delete audio.cues; return route.fulfill({ json: audio }); }
      const tour = structuredClone(state.tour); if (!state.flexible) delete tour.orderFlexible;
      return route.fulfill({ json: tour });
    });
    await context.route('**/test-audio/**', route => route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: BODY }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    return { context, page, state, errors };
  };
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const ready = page => page.waitForFunction(() => document.querySelector('audio')?.duration > 0);
  const header = async page => (await page.locator('.stop-selector').innerText()).replace('☷', '').trim().replace(/\s+/g, ' ');
  const finishBody = page => page.locator('audio').evaluate(a => { a.currentTime = a.duration - 0.2; return a.play(); });
  const shot = async (page, name) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); } };
  const url = (process.env.BASE_URL || 'http://127.0.0.1:3100') + '/tours/flex-test';
  try {
    // --- 1. The overview offers to start where you are -------------------------------------------------------------------------
    const { page, context, state, errors } = await make();
    await page.goto(url);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.locator('.overview-start-here').first().waitFor();
    assert.equal(await page.locator('.overview-start-here').count(), 3, 'three stops are listed until expanded, each one can start the walk');
    assert.equal(await page.evaluate(() => localStorage.getItem('tour-location:v1')), null, 'location is not asked for until the visitor taps');
    await shot(page, 'overview-390x844');
    await button(page, 'Usar mi ubicación').click();
    const card = page.locator('.overview-nearby-card');
    await card.waitFor();
    assert.match(await card.innerText(), /Estás a \d+ m de Lonja de la Seda \(parada 3\)\. ¿Empezar ahí\?/);
    assert.equal(await page.evaluate(() => localStorage.getItem('tour-location:v1')), 'granted', 'only the choice is remembered');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => /lat|coord/i.test(localStorage.getItem(key) || '') && key.startsWith('tour-location'))), false, 'never a coordinate');
    await page.getByRole('link', { name: 'Empezar ahí', exact: true }).click();
    await page.locator('.listening-header').waitFor();
    assert.equal(await page.locator('.tour-safety').count(), 0);
    await ready(page);
    assert.equal(await header(page), 'Parada 1 de 4');
    assert.equal(await page.locator('.listening-heading h1').textContent(), 'Lonja de la Seda');
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('tour-order:flex-test:fp-flex-1')));
    assert.deepEqual(saved.placeIds, ['stop-2', 'stop-3', 'stop-1', 'stop-0'], 'the rest follows the shortest walk from the chosen stop');
    assert.equal(await page.locator('audio').evaluate(a => a.paused), true, 'nothing plays by itself');
    await shot(page, 'player-390x844');

    // --- 2. The link clip is the one of the next stop in the ACTIVE order -------------------------------------------------------
    await finishBody(page);
    await page.locator('[data-segment-kind="cue"]').waitFor();
    assert.match(await page.locator('audio').evaluate(a => a.src), /\/cue\/next\/stop-3\?v=n3\.a$/);
    assert.equal(await page.locator('.player-link').innerText(), 'Siguiente parada: Mercado Central.');
    assert.equal(await page.locator('audio').evaluate(a => a.paused), false, 'the clip follows the body on the same element');
    await page.waitForFunction(() => document.querySelector('audio').ended);
    assert.equal(await header(page), 'Parada 1 de 4', 'the clip does not move to the next stop by itself');
    assert.equal(await page.locator('.stop-finished').isVisible(), true);
    // The body is marked listened, the clip leaves no progress of its own.
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tour-listening:flex-test:stop-2:v1')).completed), true);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tour-listening:')).some(k => k.includes('cue'))), false);
    await page.locator('.player-play').click();
    await ready(page);
    assert.equal(await page.locator('[data-segment-kind="body"]').count(), 1, 'play after the clip plays the stop again');
    await page.locator('audio').evaluate(a => a.pause());

    // --- 3. Arrival: a notice and a vibration, never playback ------------------------------------------------------------------
    assert.equal(await page.locator('.location-chip').count(), 0, 'the remembered choice already switched location on');
    // Two readings in a row, as a phone delivers them about a second apart (the browser would merge two that arrive together).
    await context.setGeolocation(near(3, 0));
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.arrival-notice').count(), 0, 'one reading is not an arrival');
    await context.setGeolocation(near(3, 0.00001));
    await page.locator('.arrival-notice').waitFor();
    assert.match(await page.locator('.arrival-notice').innerText(), /Has llegado a Mercado Central/);
    assert.equal(await page.evaluate(() => window.vibrations.length > 0), true);
    assert.equal(await page.locator('audio').evaluate(a => a.paused), true, 'no automatic playback on arrival');
    assert.equal(await header(page), 'Parada 1 de 4');
    await shot(page, 'arrival-390x844');
    await button(page, 'Escuchar').click();
    await ready(page);
    assert.equal(await header(page), 'Parada 2 de 4');
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    assert.equal(await page.locator('.listening-heading h1').textContent(), 'Mercado Central');

    // --- 4. Lock screen: next and previous --------------------------------------------------------------------------------------
    assert.deepEqual(await page.evaluate(() => Object.keys(window.mediaHandlers).sort()), ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto']);
    await page.evaluate(() => window.mediaHandlers.nexttrack());
    await ready(page);
    assert.equal(await header(page), 'Parada 3 de 4', 'nexttrack goes to the next stop of the active order');
    assert.equal(await page.locator('.listening-heading h1').textContent(), 'Plaza de la Virgen');
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    const sameElement = await page.evaluate(() => { window.firstAudio = document.querySelector('audio'); return true; });
    await page.evaluate(() => window.mediaHandlers.previoustrack());
    await ready(page);
    assert.equal(await header(page), 'Parada 2 de 4', 'previoustrack under five seconds goes back');
    assert.equal(await page.evaluate(() => window.firstAudio === document.querySelector('audio')), sameElement, 'one audio element for the whole walk');
    await page.locator('audio').evaluate(a => { a.currentTime = 6; });
    await page.evaluate(() => window.mediaHandlers.previoustrack());
    assert.equal(await page.locator('audio').evaluate(a => a.currentTime < 0.5), true, 'later it restarts the stop');
    assert.equal(await header(page), 'Parada 2 de 4');

    // --- 5. Jumping asks first; "just listen" keeps the order -------------------------------------------------------------------
    await page.locator('.stop-selector').click();
    await page.locator('.stop-popover[data-open="true"]').waitFor();
    await page.locator('[data-stop="3"]').click();                       // the last stop in the active order: not the next one
    const prompt = page.locator('.order-prompt');
    await prompt.waitFor();
    assert.match(await prompt.innerText(), /¿Seguir desde aquí\? Reordenaremos las paradas que faltan\./);
    await button(page, 'Solo escuchar esta').click();
    assert.equal(await page.locator('.listening-heading h1').textContent(), 'Torres de Serranos');
    assert.equal(await header(page), 'Parada 4 de 4');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('tour-order:flex-test:fp-flex-1'))).placeIds, ['stop-2', 'stop-3', 'stop-1', 'stop-0'], 'listening to one stop does not reorder');
    await page.locator('.stop-selector').click();
    await page.locator('[data-stop="1"]').click();
    await prompt.waitFor();
    await button(page, 'Sí, reordenar').click();
    const reordered = JSON.parse(await page.evaluate(() => localStorage.getItem('tour-order:flex-test:fp-flex-1'))).placeIds;
    assert.equal(reordered[0], 'stop-3', 'the chosen stop starts the new order');
    assert.equal(reordered.at(-1), 'stop-2', 'the stop already listened to goes last');

    // --- 6. Everything survives a reload, and the recommended order comes back -------------------------------------------------
    const before = await header(page), heading = await page.locator('.listening-heading h1').textContent();
    await page.reload();
    await page.locator('.listening-header').waitFor();
    await ready(page);
    assert.equal(await header(page), before);
    assert.equal(await page.locator('.listening-heading h1').textContent(), heading);
    await page.locator('.tour-information > summary').click();
    assert.match(await page.locator('.order-state').innerText(), /Tu orden/);
    await button(page, 'Volver al orden recomendado').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('tour-order:flex-test:fp-flex-1')), null);
    await page.locator('.stop-selector').click();
    assert.deepEqual(await page.locator('[data-stop] .stop-row-text > span').allInnerTexts(), text, 'the menu is in the published order again');
    await page.keyboard.press('Escape');

    // --- 7. The map draws the order walked, with a dashed line where a leg has no geometry --------------------------------------
    await page.evaluate(() => localStorage.setItem('tour-order:flex-test:fp-flex-1', JSON.stringify({ version: 1, mode: 'custom', placeIds: ['stop-3', 'stop-2', 'stop-1', 'stop-0'], startPlaceId: 'stop-3', createdAt: 'x' })));
    state.legs = { ...state.legs, geometries: { ...state.legs.geometries, 'stop-1|stop-2': '!!' } };
    await page.reload();
    await ready(page);
    await button(page, 'Mapa').click();
    await page.locator('.map-canvas').waitFor();
    await page.locator('.leaflet-interactive').first().waitFor();
    assert.equal(await page.locator('path.leaflet-interactive').count(), 3, 'one line per leg of the walk');
    assert.equal(await page.locator('path.leaflet-interactive[stroke-dasharray]').count(), 1, 'the leg without geometry is dashed');
    assert.equal(await page.locator('.leaflet-marker-icon').evaluateAll(markers => markers.map(m => m.textContent.trim()).filter(Boolean).sort().join(',')), '1,2,3,4');
    await page.locator('.leaflet-marker-icon').first().click();
    await page.getByRole('button', { name: 'Ver esta parada', exact: true }).waitFor();
    await shot(page, 'map-390x844');
    assert.deepEqual(errors, []);

    // --- 8. Layout at 360x740 -----------------------------------------------------------------------------------------------------
    await page.setViewportSize({ width: 360, height: 740 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
    await shot(page, 'map-360x740');
    await page.goto(url);
    await page.locator('.overview-start-here').first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.overview-start-here').first().evaluate(el => el.getBoundingClientRect().height >= 44), 'tap targets of at least 44 px');
    await shot(page, 'overview-360x740');
    await context.close();

    // --- 9. A tour that is not flexible behaves as before: no "start here", no clips, no location button ----------------------------
    const plain = await make();
    plain.state.flexible = false;
    await plain.page.goto(url);
    await plain.page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await plain.page.locator('.overview-start-here').count(), 0);
    assert.equal(await button(plain.page, 'Usar mi ubicación').count(), 0);
    await plain.page.goto(url + '?listen=1');
    await plain.page.getByRole('button', { name: 'Entendido, empezar', exact: true }).click();
    await plain.page.locator('.listening-header').waitFor();
    await ready(plain.page);
    assert.equal(await plain.page.locator('.location-chip').count(), 0);
    await plain.page.locator('.stop-selector').click();
    assert.equal(await plain.page.locator('[data-stop="0"] .stop-number').innerText(), '1');
    await plain.page.keyboard.press('Escape');
    await plain.page.locator('.stop-selector').click(); await plain.page.locator('[data-stop="introduction"]').click(); await ready(plain.page);
    await plain.page.locator('audio').evaluate(a => { a.currentTime = a.duration - 0.2; return a.play(); });
    await plain.page.waitForFunction(() => document.querySelector('audio').ended);
    assert.equal(await plain.page.locator('[data-segment-kind="cue"]').count(), 0, 'no link clip without the flag');
    assert.equal(await plain.page.locator('.order-prompt').count(), 0);
    assert.deepEqual(plain.errors, []);
    await plain.context.close();
    console.log('PASS: start where you are, active order, link clips, no autoplay, arrival notice, lock-screen next/previous, jump prompt, reload, map legs and the non-flexible regression.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
