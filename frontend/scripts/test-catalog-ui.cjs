// BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node frontend/scripts/test-catalog-ui.cjs
// Catalogue presentation of plan 06 section E, with the API intercepted: city tiles, whole-card link, one slogan, theme chips,
// the language as a secondary filter, "near you" sorting without storing a coordinate, and a first-visit notice that leaves the search visible.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/fixtures/flexible-tour.json'), 'utf8')).tour;
const cities = [['Valencia', 'ES', 39.47, -0.376], ['Madrid', 'ES', 40.41, -3.70], ['Sevilla', 'ES', 37.38, -5.99], ['París', 'FR', 48.85, 2.35]];
const tours = cities.flatMap(([city, cc, lat, lng], i) => ['history', 'thematic'].map((theme, j) => ({ ...fixture, id: `t-${i}-${j}`, city, countryCode: cc, country: cc, theme,
  title: `${city} ${theme === 'history' ? 'esencial' : 'secreta'}`, orderFlexible: undefined, places: fixture.places.map((p, k) => ({ ...p, latitude: lat + k * 0.002, longitude: lng })) })));
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', permissions: ['geolocation'], geolocation: { latitude: 37.39, longitude: -5.99 } });
    await context.route('**/api/backend/tours?**', route => route.fulfill({ json: { success: true, data: { tours, total: tours.length } } }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.goto((process.env.BASE_URL || 'http://127.0.0.1:3100') + '/tours');
    await page.locator('.mobile-tour-card').first().waitFor();

    // E2: the first-visit notice is a compact card at the bottom and leaves the search box in view.
    const banner = await page.locator('.privacy-banner').boundingBox();
    const search = await page.locator('.discovery-search').boundingBox();
    assert.ok(banner.height <= 844 * 0.28, `the notice is compact: ${banner.height}`);
    assert.ok(search.y + search.height <= banner.y, 'and does not cover the search box');
    await page.getByRole('button', { name: 'Entendido', exact: true }).click();

    // E5: the slogan once.
    assert.equal(await page.getByText('A pie. Sin prisas. Con historias.').count(), 1);
    // E4: one accessible link per card, and the whole card is its target.
    const card = page.locator('.mobile-tour-card').first();
    assert.equal(await card.getByRole('link').count(), 1);
    const box = await card.boundingBox();
    await page.mouse.click(box.x + box.width - 12, box.y + 80);
    await page.waitForURL(/\/tours\/t-\d-\d/);
    await page.goBack();
    await page.locator('.mobile-tour-card').first().waitFor();

    // E6: theme chips.
    const names = () => page.locator('.mobile-tour-card h3').allInnerTexts();
    assert.equal((await names()).length, 6, 'six cards are shown first');
    await page.getByRole('button', { name: 'Temáticos', exact: true }).click();
    assert.deepEqual((await names()).map(n => n.split(' ').pop()), ['secreta', 'secreta', 'secreta', 'secreta']);
    await page.getByRole('button', { name: 'Historia', exact: true }).click();
    assert.deepEqual((await names()).map(n => n.split(' ').pop()), ['esencial', 'esencial', 'esencial', 'esencial']);
    await page.getByRole('button', { name: 'Todos', exact: true }).click();

    // E3: the language is a secondary filter, closed by default.
    assert.equal(await page.locator('details.discovery-language').evaluate(e => e.open), false);
    assert.equal(await page.locator('#tour-language').count(), 0, 'no second language selector next to the page one');
    await page.locator('details.discovery-language > summary').click();
    assert.equal(await page.getByRole('button', { name: 'Français', exact: true }).isVisible(), true);

    // E7: near you sorts by distance with a one-off reading, and keeps nothing.
    await page.locator('details.discovery-language > summary').click();
    const firstCity = async () => (await page.locator('.discovery-cities button').nth(1).innerText());
    assert.equal(await firstCity(), 'Madrid', 'alphabetical by default');
    await page.getByRole('button', { name: 'Cerca de ti', exact: true }).click();
    await page.getByText('Ordenado por cercanía').waitFor();
    assert.equal(await firstCity(), 'Sevilla', 'the nearest city comes first');
    assert.equal((await names())[0].startsWith('Sevilla'), true);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).some(k => /near|lat|geo|location/i.test(k + (localStorage.getItem(k) || '')))), false, 'no coordinate or preference is stored');
    await page.getByRole('button', { name: 'Cerca de ti', exact: true }).click();
    assert.equal(await firstCity(), 'Madrid');

    // E1: city tiles, aligned, with the localized name and the number of walks.
    const tiles = page.locator('.discovery-city-links a');
    assert.ok(await tiles.count() >= 30);
    await tiles.first().scrollIntoViewIfNeeded();
    const left = await page.locator('.discovery-city-links li:nth-child(odd) a').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
    assert.equal(new Set(left).size, 1, 'the left column is aligned');
    assert.equal((await page.locator('.discovery-city-links li:nth-child(odd) a span').evaluateAll(els => els.map(e => getComputedStyle(e).textAlign))).every(a => a === 'left' || a === 'start'), true);
    assert.match(await tiles.first().innerText(), /Madrid\s+\d+ paseos?/);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: compact first-visit notice, one slogan, whole-card link, theme chips, secondary language filter, near-you sorting without stored coordinates, aligned city tiles.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
