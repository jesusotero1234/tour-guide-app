// Run after npm run build. Tests the mobile discovery -> detail -> listening flow.
// All catalog, audio, map and image requests are local fixtures; no provider writes.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const port = 3187;
const origin = 'http://127.0.0.1:' + port;
const token = 'tour-entry-test-proxy-token-32-characters';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: path.resolve(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', PILOT_MODE: 'true', PILOT_PROXY_TOKEN: token, UMAMI_SCRIPT_URL: '', UMAMI_WEBSITE_ID: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', b => output += b);
child.stderr.on('data', b => output += b);
const description = 'La ciudad cambió al convertirse en corte. Sus plazas cuentan esa transformación.';
const photo = { id: 'verified-photo', role: 'primary', paragraphIndex: 0, paragraphText: description, caption: 'Plaza de prueba', alt: 'Vista de la plaza', url: 'https://upload.wikimedia.org/mobile-test.svg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.svg', sourceTitle: 'Test', author: 'Test author', attribution: 'Test author', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', changes: 'none', width: 600, height: 400 };
const places = ['Plaza de Oriente, junto a Bailén: vista hacia el solar del Alcázar', 'Descalzas Reales', 'Casa de la Villa', 'Plaza Mayor', 'Palacio de Santa Cruz'].map((name, i) => ({ id: 'place-' + i, name, description, position: i + 1, latitude: 40.416 + i * .001, longitude: -3.71, audioVersion: 'v1', audioUrl: '/fixture-audio/' + i + '.wav', metadata: { tourImages: { version: 1, status: 'ready', sourceText: description, images: [photo] } } }));
const tour = { id: '11111111-1111-4111-8111-111111111111', title: 'Madrid de los Austrias: una villa se convierte en corte', city: 'Madrid', country: 'España', countryCode: 'ES', theme: 'thematic', language: 'es', durationMinutes: 34, status: 'published', introduction: 'Bienvenido a Madrid. Un paseo para descubrir las historias de la ciudad.', introductionAudio: { status: 'completed', text: 'Bienvenido', audioUrl: '/fixture-audio/intro.wav', version: 'v1', durationSeconds: 60 }, places };
const wav = Buffer.alloc(44 + 960000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
(async () => {
  let browser;
  try {
    for (let n = 0; n < 120; n++) {
      if (child.exitCode !== null) throw Error(output);
      try { if ((await fetch(origin + '/tours', { headers: { 'x-pilot-proxy-token': token } })).ok) break; } catch {}
      if (n === 119) throw Error(output);
      await delay(250);
    }
    const browserType = process.env.BROWSER === 'webkit' ? webkit : chromium;
    browser = await browserType.launch({ headless: true, executablePath: browserType === chromium ? process.env.CHROMIUM_PATH || undefined : process.env.WEBKIT_PATH || undefined });
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-pilot-proxy-token': token } });
    const page = await context.newPage();
    const errors = [], calls = [], mutations = [];
    let mode = 'found';
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') mutations.push(request.url()); });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition() { window.gpsCalls = (window.gpsCalls || 0) + 1; return 1; }, clearWatch() {} } });
    });
    await context.route('https://upload.wikimedia.org/mobile-test.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#acb399"/></svg>' }));
    await context.route('**/api/backend/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/walking-route')) return route.fulfill({ json: { data: { provider: 'fossgis-osrm-foot', distanceMeters: 1500, durationSeconds: 1200, geometry: { type: 'LineString', coordinates: [[-3.71,40.416],[-3.71,40.42]] } } } });
      if (url.pathname.endsWith('/audio')) return route.fulfill({ json: { tourId: tour.id, status: 'completed', phase: 'completed', completedStops: 5, totalStops: 5, canGenerate: false, introduction: tour.introductionAudio, audioUrls: Object.fromEntries(places.map(p => [p.id, p.audioUrl])), audioVersions: Object.fromEntries(places.map(p => [p.id, p.audioVersion])) } });
      if (!url.pathname.endsWith('/tours')) return route.fulfill({ json: tour });
      calls.push(url);
      const requestMode = mode;
      const lang = url.searchParams.get('language');
      await delay(lang === 'de' ? 350 : 20);
      if (requestMode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } });
      const catalog = [tour, { ...tour, id: 'barcelona', city: 'Barcelona', title: 'Barcelona y el mar' }, { ...tour, id: 'sevilla', city: 'Sevilla', cityNames: { es: 'Sevilla', fr: 'Séville', en: 'Seville' }, title: undefined }, ...Array.from({ length: 4 }, (_, i) => ({ ...tour, id: 'more-' + i, city: 'Valencia', title: 'Valencia ' + i, places: places.map(p => ({ ...p, metadata: undefined })) }))];
      return route.fulfill({ json: { data: { tours: requestMode === 'empty' ? [] : catalog.map(t => ({ ...t, language: lang })) } } });
    });
    await context.route('**/fixture-audio/**', route => {
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: range ? 206 : 200, headers: { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) });
    });
    await page.goto(origin + '/');
    await page.getByRole('heading', { name: 'La ciudad tiene mucho que contarte.' }).waitFor();
    await page.locator('.mobile-tour-card').first().waitFor();
    assert.equal(new URL(page.url()).pathname, '/tours');
    assert.equal(calls[0].searchParams.has('city'), false, 'Tours are discoverable before typing');
    assert.equal(calls[0].searchParams.get('readyOnly'), 'true');
    assert.equal(calls[0].searchParams.get('limit'), '50');
    assert.equal(await page.locator('.mobile-tour-card').count(), 6);
    await page.getByRole('button', { name: 'Ver más paseos ↓' }).click();
    assert.equal(await page.locator('.mobile-tour-card').count(), 7);
    await page.locator('.privacy-banner').getByRole('button', { name: 'Entendido', exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tour-privacy-v1')).analytics), false);
    await page.getByRole('button', { name: 'Barcelona', exact: true }).click();
    assert.equal(await page.locator('.mobile-tour-card').count(), 1);
    await page.locator('#tour-city').fill('séViLle');
    await page.getByRole('heading', { name: 'Sevilla, España' }).waitFor();
    assert.equal(calls.length, 1, 'City filtering is local and accent-insensitive');
    await page.locator('#tour-city').fill('Unknown');
    await page.getByRole('heading', { name: 'Todavía no hay tours en español para Unknown' }).waitFor();
    await page.getByRole('button', { name: 'Ver todos los paseos' }).click();
    await page.locator('#tour-language').selectOption('de');
    await page.locator('#tour-language').selectOption('fr');
    await page.waitForFunction(() => document.querySelector('.tour-card-meta')?.textContent.includes('FR'));
    await delay(400);
    assert.ok((await page.locator('.tour-card-meta').first().textContent()).includes('FR'), 'Stale language response cannot overwrite selection');
    await page.locator('#page-language').selectOption('en');
    assert.equal(await page.locator('#tour-language').inputValue(), 'fr');
    await page.getByRole('heading', { name: 'Seville, Spain' }).waitFor();
    await page.locator('#page-language').selectOption('es');
    await page.locator('#tour-language').selectOption('es');
    await page.waitForFunction(() => document.querySelector('.tour-card-meta')?.textContent.includes('ES'));
    const firstSample = page.locator('.tour-sample-button').nth(0);
    const secondSample = page.locator('.tour-sample-button').nth(1);
    await firstSample.click();
    await page.waitForFunction(() => !document.querySelector('.tour-sample audio').paused);
    await secondSample.click();
    await page.waitForFunction(() => document.querySelectorAll('.tour-sample audio')[0].paused && !document.querySelectorAll('.tour-sample audio')[1].paused);
    await page.locator('.tour-sample audio').nth(1).evaluate(a => { a.currentTime = 46; a.dispatchEvent(new Event('timeupdate')); });
    assert.equal(await page.locator('.tour-sample audio').nth(1).evaluate(a => a.paused), true, 'Sample stops after 45 seconds');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('tour-listening:'))), false, 'Preview does not alter listening progress');
    await page.locator('.mobile-tour-card h3 a').first().click();
    await page.locator('.tour-overview').waitFor();
    assert.equal(await page.locator('.overview-stops li').count(), 3);
    await page.getByRole('button', { name: 'Ver todas las paradas ↓' }).click();
    assert.equal(await page.locator('.overview-stops li').count(), 5);
    await page.locator('.overview-distance').filter({ hasText: '20 min' }).waitFor();
    assert.equal(await page.evaluate(() => window.gpsCalls || 0), 0);
    await page.getByRole('link', { name: 'Empezar el paseo' }).click();
    await page.locator('.tour-experience').waitFor();
    assert.equal(await page.locator('.tour-safety').count(), 0, 'Safety notice on the detail page avoids a second gate');
    await page.getByRole('button', { name: 'Ir a la primera parada →' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="tour-audio"]')?.duration === 60);
    await page.getByRole('button', { name: 'Reproducir narración', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="tour-audio"]')?.currentTime > 0);
    await page.getByRole('button', { name: 'Velocidad de reproducción: 1×' }).click();
    assert.equal(await page.locator('[data-testid="tour-audio"]').evaluate(a => a.playbackRate), 1.25);
    await page.locator('[data-testid="tour-audio"]').evaluate(a => { window.originalAudio = a; a.currentTime = 12; a.dispatchEvent(new Event('seeked')); });
    await page.getByRole('button', { name: 'Leer', exact: true }).click();
    assert.equal(await page.evaluate(() => window.originalAudio === document.querySelector('[data-testid="tour-audio"]')), true);
    await page.getByRole('button', { name: 'Mirar', exact: true }).click();
    await page.getByRole('link', { name: '← El paseo', exact: true }).click();
    await page.getByRole('link', { name: 'Continuar el paseo' }).waitFor();
    await page.getByRole('link', { name: 'Continuar el paseo' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="tour-audio"]')?.currentTime >= 12);
    assert.equal(await page.locator('[data-testid="tour-audio"]').evaluate(a => a.paused), true, 'Resume is not autoplay');
    for (const [width, height] of [[320,568], [390,844], [430,932]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const selector of ['.listening-header', '.listening-heading', '.player-progress', '.listening-next']) {
        assert.equal(await page.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), true, selector + ' fits long stop names');
      }
      assert.equal(await page.locator('.player-play').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true, 'Play stays reachable on small screens');
    }
    await page.locator('.listening-next').click();
    await page.getByRole('heading', { name: 'Descalzas Reales', exact: true }).waitFor();
    await page.goto(origin + '/tours');
    mode = 'error';
    await page.locator('#tour-language').selectOption('it');
    await page.getByRole('alert').filter({ hasText: 'No hemos podido buscar' }).waitFor();
    mode = 'empty';
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.getByRole('heading', { name: 'Todavía no hay paseos disponibles en este idioma.' }).waitFor();
    for (const lang of ['fr','de','it','en','es']) {
      await page.locator('#page-language').selectOption(lang);
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, [], 'The design does not generate tours, audio, or analytics without consent');
    console.log('PASS mobile discovery, city/language filters, stale responses, pagination, translated empty/error/retry, verified photos, exclusive 45s previews, detail/route, real playback, rate, stable audio across views, saved progress and 320–430px layouts.');
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
