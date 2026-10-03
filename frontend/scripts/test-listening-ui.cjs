// BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node frontend/scripts/test-listening-ui.cjs
// UI improvements of plan 06 on the flexible-tour fixture: viewport, SVG icons, dialog accessibility, remembered speed and tab, location
// on the map, a map that keeps the visitor's zoom, a sticky start bar, tappable stops, sharing and Apple Maps, minimum font sizes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/fixtures/flexible-tour.json'), 'utf8'));
const wav = seconds => {
  const bytes = Buffer.alloc(44 + 16000 * seconds);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
};
const BODY = wav(8), LINK = wav(1);
const url = (process.env.BASE_URL || 'http://127.0.0.1:3100') + '/tours/flex-test';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const make = async (options = {}) => {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', permissions: ['geolocation'], geolocation: { latitude: 39.4702, longitude: -0.376, accuracy: 40 }, ...options });
    await context.addInitScript(() => {
      localStorage.setItem('tour-privacy-v1', JSON.stringify({ version: 1, analytics: false, savedAt: Date.now() }));
      if (!localStorage.getItem('tour-selection:flex-test')) localStorage.setItem('tour-selection:flex-test', JSON.stringify({ kind: 'stop', placeId: 'stop-0' }));
    });
    await context.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
    await context.route('**/api/backend/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.includes('/cue/')) return route.fulfill({ contentType: 'audio/wav', body: LINK });
      if (pathname.endsWith('/walking-legs')) return route.fulfill({ json: { data: fixture.legs } });
      if (pathname.endsWith('/walking-route')) return route.fulfill({ status: 503, json: { error: { message: 'test' } } });
      if (pathname.endsWith('/audio')) return route.fulfill({ json: fixture.audio });
      return route.fulfill({ json: fixture.tour });
    });
    await context.route('**/test-audio/**', route => route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: BODY }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    return { context, page, errors };
  };
  const ready = page => page.waitForFunction(() => document.querySelector('audio')?.duration > 0);
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const openPlayer = async page => {
    await page.goto(url + '?listen=1');
    await page.getByRole('button', { name: 'Entendido, empezar', exact: true }).click().catch(() => {});
    await page.locator('.listening-header').waitFor();
    await ready(page);
  };
  try {
    const { page, context, errors } = await make();

    // --- Overview: sticky start bar, tappable stops, short notice, sharing ------------------------------------------------------
    await page.goto(url);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /viewport-fit=cover/, 'safe areas work on phones with a notch (D3)');
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#f8f5ef');
    const bar = await page.locator('.overview-start').boundingBox();
    assert.ok(bar.y + bar.height <= 844 + 1 && bar.y > 400, 'the start bar is on screen without scrolling (B2)');
    assert.match(await page.locator('.overview-start .tour-primary').innerText(), /^Empezar el paseo\s*→$/);
    assert.equal(await page.locator('.overview-notice p').count(), 2, 'one short line of safety, plus the AI notice (B4)');
    await page.locator('.overview-stop-link').nth(1).click();
    await page.getByRole('button', { name: 'Entendido, empezar', exact: true }).click().catch(() => {});
    await page.locator('.listening-header').waitFor();
    assert.equal(await page.locator('.listening-heading h1').textContent(), 'Plaza de la Virgen', 'a stop in the list opens the player there (B3)');
    await ready(page);
    await page.locator('audio').evaluate(a => { a.currentTime = 3; a.dispatchEvent(new Event('seeked')); });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('tour-listening:flex-test:stop-1:v1') || '{}').position === 3);
    await page.goto(url);
    await page.locator('.overview-start').waitFor();
    assert.match(await page.locator('.overview-start').innerText(), /Continuar el paseo/);
    assert.match(await page.locator('.overview-start').innerText(), /Continuar en Plaza de la Virgen/, 'the bar says where it will continue (B2)');
    // Sharing: the system sheet when there is one, the clipboard when not.
    await page.addInitScript(() => { window.shared = []; navigator.share = async data => { window.shared.push(data); }; });
    await page.reload();
    await page.locator('.overview-share').click();
    assert.match(await page.evaluate(() => window.shared[0].url), /\/tours\/flex-test$/);
    await page.close();

    // --- Apple Maps only where it makes sense (B9) ------------------------------------------------------------------------------
    const apple = await make({ ...devices['iPhone 13'], locale: 'es-ES', permissions: ['geolocation'] });
    await apple.page.goto(url);
    await apple.page.getByRole('heading', { level: 1 }).waitFor();
    const href = await apple.page.getByRole('link', { name: /Abrir en Apple Maps/ }).getAttribute('href');
    assert.match(href, /^https:\/\/maps\.apple\.com\/\?daddr=39\.47%2C-0\.376&dirflg=w$/);
    assert.equal(await apple.page.getByRole('link', { name: /Abrir en Mapas/ }).count(), 1, 'Google Maps stays');
    await apple.context.close();

    // --- Player: icons, dialog, speed, tab, footer, fonts ------------------------------------------------------------------------
    const player = await make();
    const p = player.page;
    await openPlayer(p);
    assert.equal(await p.locator('.stop-selector svg').count(), 1);
    assert.doesNotMatch(await p.locator('main').innerText(), /[☷⌑⌄‹›↶↷]/, 'no Unicode glyph is used as an icon (D6)');
    assert.equal(await p.locator('.player-skip svg').count(), 2);
    assert.equal(await p.getByRole('button', { name: 'Retroceder 15 segundos', exact: true }).count(), 1, 'icons keep their labels');
    const footer = await p.locator('.listening-footer').boundingBox();
    assert.ok(footer.height <= 844 * 0.4, `the footer takes at most about a third of the screen (D8): ${footer.height}`);
    assert.equal(await p.locator('.tour-information > summary').innerText(), 'Más');

    // Dialog: focus in, trapped, out once on Escape (D7).
    await p.locator('.stop-selector').click();
    await p.locator('.stop-popover[data-open="true"]').waitFor();
    assert.equal(await p.locator('.stop-popover').getAttribute('aria-modal'), 'true');
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('data-stop')), '0', 'the focus goes to the current stop');
    for (let i = 0; i < 8; i++) await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(() => !!document.activeElement?.closest('.stop-popover')), true, 'Tab never leaves the dialog');
    await p.keyboard.press('Shift+Tab');
    assert.equal(await p.evaluate(() => !!document.activeElement?.closest('.stop-popover')), true);
    await p.evaluate(() => { window.focusEvents = 0; document.querySelector('.stop-selector').addEventListener('focus', () => window.focusEvents++); });
    await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(() => document.activeElement?.classList.contains('stop-selector')), true, 'Escape returns the focus to the trigger');
    assert.equal(await p.evaluate(() => window.focusEvents), 1, 'and only once');

    // Speed: remembered, applied to each file, visible in compact mode (A4).
    await p.locator('.player-times .rate-chip').click();
    assert.equal(await p.locator('audio').evaluate(a => a.playbackRate), 1.25);
    await p.locator('.stop-selector').click(); await p.locator('[data-stop="1"]').click(); await ready(p);
    assert.equal(await p.locator('audio').evaluate(a => a.playbackRate), 1.25, 'loading another stop does not reset the speed');
    assert.equal(await p.evaluate(() => localStorage.getItem('tour-playback-rate:v1')), '1.25');
    await p.getByRole('button', { name: 'Leer', exact: true }).click();
    assert.equal(await p.locator('.rate-chip').innerText(), '1.25×', 'the chip is there in compact mode too');
    await p.locator('.rate-chip').click();
    assert.equal(await p.locator('audio').evaluate(a => a.playbackRate), 1.5);
    await p.reload(); await p.locator('.listening-header').waitFor(); await ready(p);
    assert.equal(await p.locator('audio').evaluate(a => a.playbackRate), 1.5, 'the speed survives a reload');
    // The tab too (B6).
    assert.equal(await p.locator('main').getAttribute('data-view'), 'story', 'the tab comes back');
    await p.getByRole('button', { name: 'Mirar', exact: true }).click();
    // Fonts: nothing below 12 px (D4).
    const small = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.getBoundingClientRect().width > 0 && !el.closest('.leaflet-container') && !el.closest('svg') && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.className + ':' + getComputedStyle(el).fontSize));
    assert.deepEqual(small, [], 'text under 12 px');
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim()), '#84661a');

    // --- Map: a visible location button, an accuracy circle, and the visitor's zoom is kept (A1, A5) --------------------------------
    await p.getByRole('button', { name: 'Mapa', exact: true }).click();
    await p.locator('.map-canvas').waitFor();
    assert.equal(await p.locator('details.map-options').evaluate(e => e.open), false);
    await p.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon').length >= 4);
    assert.equal(await button(p, 'Usar mi ubicación').isVisible(), true, 'one visible tap on the map');
    await button(p, 'Usar mi ubicación').click();
    await p.getByRole('button', { name: 'Centrar en mí', exact: true }).waitFor();
    await p.waitForFunction(() => document.querySelector('path[stroke="#3B82F6"]'));
    assert.equal(await p.locator('path[stroke="#3B82F6"]').count(), 1, 'a circle for the accuracy of the reading');
    const spread = () => p.evaluate(() => { const m = [...document.querySelectorAll('.leaflet-marker-icon')].filter(e => e.textContent.trim()).map(e => e.getBoundingClientRect()); return Math.round(Math.hypot(m[0].x - m[3].x, m[0].y - m[3].y)); });
    await p.locator('.leaflet-control-zoom-in').click();
    await p.waitForTimeout(400);
    const zoomed = await spread();
    await p.setViewportSize({ width: 360, height: 700 });
    await p.waitForTimeout(500);
    assert.ok(Math.abs((await spread()) - zoomed) <= 2, 'a resize does not take the zoom away');
    await p.locator('.leaflet-marker-icon').filter({ hasText: '2' }).click();
    await p.getByRole('button', { name: 'Ver esta parada', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Ir hasta aquí', exact: true }).click();
    await p.waitForTimeout(400);
    assert.ok(Math.abs((await spread()) - zoomed) <= 2, 'choosing a destination does not refit the map');
    await p.locator('details.map-options summary').click();
    assert.equal(await p.getByText('Ruta a pie:', { exact: false }).count(), 1, 'the credit line is in the language of the tour (C3)');
    assert.deepEqual(player.errors, []);
    await player.context.close();

    // --- The closing screen (B7) ---------------------------------------------------------------------------------------------------
    const finish = await make();
    await finish.context.addInitScript(() => {
      for (const id of ['stop-0', 'stop-1', 'stop-2', 'stop-3']) localStorage.setItem('tour-listening:flex-test:' + id + ':v1', JSON.stringify({ position: 8, duration: 8, completed: true }));
      localStorage.setItem('tour-selection:flex-test', JSON.stringify({ kind: 'stop', placeId: 'stop-3' }));
    });
    await openPlayer(finish.page);
    await finish.page.locator('.stop-finished').waitFor();
    await finish.page.getByRole('button', { name: /Ver el resumen del paseo/ }).click();
    const end = finish.page.locator('.tour-end');
    await end.waitFor();
    assert.match(await end.innerText(), /Has escuchado todo el tour\./);
    assert.match(await end.innerText(), /4 de 4 paradas escuchadas/);
    assert.match(await end.innerText(), /Unos 1([,.]\d)? km recorridos/);
    assert.equal(await end.getByRole('link', { name: /Otros paseos en Valencia/ }).getAttribute('href'), '/es/valencia');
    await end.locator('.tour-end-sources > summary').click();
    assert.ok(await end.locator('.tour-end-sources a').count() > 0, 'sources and credits are one tap away');
    await end.getByRole('button', { name: 'Cerrar', exact: true }).click();
    assert.equal(await finish.page.locator('.tour-end').count(), 0);
    await finish.context.close();

    // --- Denied permission is explained in the language of the tour (A1) ------------------------------------------------------------
    const denied = await make({ permissions: [] });
    await openPlayer(denied.page);
    await denied.page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await button(denied.page, 'Usar mi ubicación').click();
    await denied.page.getByText('La ubicación está desactivada.', { exact: false }).waitFor();
    assert.match(await denied.page.locator('.map-location-status').innerText(), /ajustes del navegador/);
    await denied.context.close();
    console.log('PASS: viewport, SVG icons, modal dialog, remembered speed and tab, short footer, minimum fonts, location on the map, kept zoom, sticky start bar, tappable stops, share and Apple Maps.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
