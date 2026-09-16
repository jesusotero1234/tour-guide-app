// Run after npm run build. Uses an isolated browser and mocked catalog; no external providers.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const port = 3187;
const origin = 'http://127.0.0.1:' + port;
const token = 'tour-entry-test-proxy-token-32-characters';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, NODE_ENV: 'production', PILOT_MODE: 'true', PILOT_PROXY_TOKEN: token, UMAMI_SCRIPT_URL: '', UMAMI_WEBSITE_ID: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', b => output += b);
child.stderr.on('data', b => output += b);
(async () => {
  let browser;
  try {
    for (let n = 0; n < 120; n++) {
      if (child.exitCode !== null) throw Error(output);
      try { if ((await fetch(origin + '/tours', { headers: { 'x-pilot-proxy-token': token } })).ok) break; } catch {}
      if (n === 119) throw Error('Server did not start: ' + output);
      await delay(250);
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ locale: 'es-ES', viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-pilot-proxy-token': token } });
    const errors = [], calls = [], providers = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/geocoding|nominatim|generate/.test(r.url())) providers.push(r.url()); });
    let mode = 'found';
    const id = '11111111-1111-4111-8111-111111111111';
    await page.route('**/api/backend/tours?**', async route => {
      const url = new URL(route.request().url());
      calls.push(url);
      const responseMode = mode;
      const city = url.searchParams.get('city') === 'Bar' ? 'Barcelona' : 'Madrid';
      await delay(url.searchParams.get('city') === 'Slow' ? 900 : 80);
      if (responseMode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Unavailable' } }) });
      const tours = responseMode === 'empty' ? [] : [{ id, title: city + ', entre plazas e historias', city, country: 'España', language: url.searchParams.get('language'), durationMinutes: 90, places: [{}, {}] }];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { tours } }) });
    });
    await page.goto(origin + '/');
    assert.equal(new URL(page.url()).pathname, '/tours');
    const cityInput = page.getByLabel('¿Qué ciudad quieres explorar?');
    const languageInput = page.getByLabel('Idioma del tour');
    await languageInput.selectOption('fr');
    await cityInput.fill('   ');
    await delay(450);
    assert.equal(calls.length, 0, 'No lookup without a city');
    assert.equal(await page.getByRole('button', { name: 'Buscar tour →' }).count(), 0);
    await languageInput.selectOption('es');
    await cityInput.fill('');
    await cityInput.pressSequentially('Mad', { delay: 60 });
    await page.getByRole('link', { name: 'Ver tour →' }).waitFor();
    assert.equal(calls.length, 1, 'Typing is debounced');
    assert.equal(calls[0].searchParams.get('city'), 'Mad');
    assert.equal(calls[0].searchParams.get('language'), 'es');
    assert.equal(calls[0].searchParams.get('readyOnly'), 'true');
    assert.ok(await cityInput.isVisible(), 'Search remains visible with results');
    assert.equal(await cityInput.evaluate(el => el === document.activeElement), true, 'Results preserve typing focus');
    assert.equal(await page.getByRole('link', { name: 'Ver tour →' }).getAttribute('href'), '/tours/' + id);
    await cityInput.press('Enter');
    await delay(450);
    assert.equal(calls.length, 1, 'Enter does not reload or duplicate the query');
    await languageInput.selectOption('fr');
    await page.getByText('90 min · 2 paradas · FR', { exact: true }).waitFor();
    assert.equal(calls.length, 2, 'Changing language automatically searches again');
    assert.equal(calls[1].searchParams.get('language'), 'fr');
    await languageInput.selectOption('es');
    await cityInput.fill(' Madrid ');
    await page.getByText('90 min · 2 paradas · ES', { exact: true }).waitFor();
    assert.equal(calls.at(-1).searchParams.get('city'), 'Madrid', 'Query is trimmed');

    const slowRequest = page.waitForRequest(r => new URL(r.url()).searchParams.get('city') === 'Slow');
    await cityInput.fill('Slow');
    await slowRequest;
    assert.ok(await cityInput.isEnabled(), 'Typing remains enabled during requests');
    assert.ok(await languageInput.isEnabled());
    await cityInput.fill('Bar');
    await page.getByRole('heading', { name: 'Barcelona, entre plazas e historias' }).waitFor();
    await delay(1000);
    assert.equal(await page.getByRole('heading', { name: 'Madrid, entre plazas e historias' }).count(), 0, 'Stale response cannot replace current results');

    const pendingRequest = page.waitForRequest(r => new URL(r.url()).searchParams.get('city') === 'Slow');
    await cityInput.fill('Slow');
    await pendingRequest;
    await cityInput.fill('');
    const beforeClear = calls.length;
    await delay(1000);
    assert.equal(calls.length, beforeClear, 'Clearing the city does not request the whole catalogue');
    assert.equal(await page.getByRole('link', { name: 'Ver tour →' }).count(), 0);
    assert.equal(await page.getByRole('status').textContent(), '');

    mode = 'error';
    await cityInput.fill('Madrid');
    await page.getByText('No hemos podido buscar los tours. Inténtalo de nuevo.', { exact: true }).waitFor();
    mode = 'found';
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.getByRole('link', { name: 'Ver tour →' }).waitFor();
    await page.route('**/tours/' + id, route => route.fulfill({ contentType: 'text/html', body: '<h1>Recorrido de prueba</h1>' }));
    await page.getByRole('link', { name: 'Ver tour →' }).click();
    await page.waitForURL('**/tours/' + id);
    await page.goto(origin + '/tours');
    mode = 'empty';
    await cityInput.fill('Madrid');
    await page.getByRole('heading', { name: 'Todavía no hay tours en español para Madrid' }).waitFor();
    assert.ok(await cityInput.isVisible(), 'Empty results keep the search editable');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width);
    }
    const gap = await page.evaluate(() => document.querySelector('footer').getBoundingClientRect().top - document.querySelector('.tour-entry').getBoundingClientRect().bottom);
    assert.ok(gap < 32, 'Footer follows compact content');
    for (const href of ['/privacy?lang=es', '/about?lang=es', '/data-sources?lang=es']) assert.ok(await page.locator('footer a[href="' + href + '"]').count());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await cityInput.fill('Barcelona');
    await page.getByRole('heading', { name: 'Todavía no hay tours en español para Barcelona' }).waitFor();
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(providers, []);
    const french = await browser.newPage({ locale: 'fr-FR', viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-pilot-proxy-token': token } });
    french.on('pageerror', e => errors.push(e.message));
    const frenchCalls = [];
    let frenchMode = 'found';
    await french.route('**/api/backend/tours?**', route => {
      frenchCalls.push(new URL(route.request().url()));
      if (frenchMode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { tours: frenchMode === 'empty' ? [] : [{
        id, city: 'Sevilla', country: 'España', countryCode: 'ES', cityNames: { es: 'Sevilla', fr: 'Séville', en: 'Seville', de: 'Sevilla', it: 'Siviglia' },
        language: new URL(route.request().url()).searchParams.get('language'), durationMinutes: 60, places: [{}],
      }] } }) });
    });
    await french.goto(origin + '/');
    const frenchOrigin = new URL(french.url()).origin;
    await french.getByRole('heading', { name: 'Votre prochaine balade commence ici.' }).waitFor();
    assert.equal(await french.locator('html').getAttribute('lang'), 'fr');
    assert.equal(await french.getByLabel('Langue de la page').inputValue(), 'fr');
    assert.equal(await french.getByLabel('Langue de la visite').inputValue(), 'fr');
    assert.equal(frenchCalls.length, 0);
    await french.getByLabel('Quelle ville souhaitez-vous explorer ?').fill('Séville');
    await french.getByRole('link', { name: 'Voir la visite →' }).waitFor();
    assert.equal(frenchCalls.at(-1).searchParams.get('city'), 'Séville');
    await french.getByRole('heading', { name: 'Séville, Espagne' }).waitFor();
    await french.getByText('60 min · 1 étape · FR', { exact: true }).waitFor();
    await french.getByLabel('Langue de la visite').selectOption('es');
    await french.getByText('60 min · 1 étape · ES', { exact: true }).waitFor();
    assert.equal(await french.locator('html').getAttribute('lang'), 'fr', 'Tour language does not change the page language');
    const beforePageChange = frenchCalls.length;
    await french.getByLabel('Langue de la page').selectOption('en');
    await french.getByRole('heading', { name: 'Seville, Spain' }).waitFor();
    assert.equal(await french.getByLabel('Tour language').inputValue(), 'es', 'Explicit tour language survives page language changes');
    assert.equal(await french.locator('#tour-city').inputValue(), 'Séville', 'Page language preserves the city query');
    await delay(400);
    assert.equal(frenchCalls.length, beforePageChange, 'Translating the page reuses current results');
    await french.reload();
    await french.getByRole('heading', { name: 'Your next walk starts here.' }).waitFor();
    assert.equal(await french.locator('html').getAttribute('lang'), 'en', 'Saved preference overrides browser locale on reload');
    await french.goto(frenchOrigin + '/about?lang=fr');
    await french.getByRole('link', { name: 'Retour aux visites' }).click();
    await french.getByRole('heading', { name: 'Your next walk starts here.' }).waitFor();
    for (const [language, heading] of [['de', 'Dein nächster Spaziergang beginnt hier.'], ['it', 'La tua prossima passeggiata inizia qui.'], ['fr', 'Votre prochaine balade commence ici.']]) {
      await french.locator('#page-language').selectOption(language);
      await french.getByRole('heading', { name: heading }).waitFor();
      assert.equal(await french.locator('#tour-language').inputValue(), language, 'Default tour language follows page language');
      for (const width of [320, 390, 768, 1440]) {
        await french.setViewportSize({ width, height: 844 });
        assert.ok(await french.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow for ' + language + ' at ' + width);
      }
    }
    frenchMode = 'empty';
    await french.locator('#tour-city').fill('Rome');
    await french.getByRole('heading', { name: 'Pas encore de visites en français à Rome' }).waitFor();
    frenchMode = 'error';
    await french.locator('#tour-city').fill('Paris');
    await french.getByRole('alert').filter({ hasText: 'Impossible de rechercher les visites.' }).waitFor();
    await french.locator('#page-language').selectOption('es');
    await french.getByRole('alert').filter({ hasText: 'No hemos podido buscar los tours.' }).waitFor();
    frenchMode = 'found';
    await french.getByRole('button', { name: 'Reintentar' }).click();
    await french.getByRole('link', { name: 'Ver tour →' }).waitFor();
    assert.deepEqual(errors, []);
    const unsupported = await browser.newPage({ locale: 'ja-JP', extraHTTPHeaders: { 'x-pilot-proxy-token': token } });
    await unsupported.goto(origin + '/tours');
    await unsupported.getByRole('heading', { name: 'Your next walk starts here.' }).waitFor();
    console.log('PASS: browser locale, five page languages, independent tour filter, localized city/country/cards, persistence, navigation, fallback, translated empty/error/retry and mobile layouts.');
    console.log('PASS: automatic debounced search, partial city/language query, focus, stale responses, clearing, direct tour, empty/error/retry, responsive footer, reduced motion, no providers.');
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
