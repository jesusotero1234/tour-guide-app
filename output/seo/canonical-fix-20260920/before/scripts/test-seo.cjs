// Production Next + public Caddy config, with a read-only fixture backend.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { readFile, writeFile, mkdtemp, rm, mkdir } = require('node:fs/promises');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const ts = require('../node_modules/typescript');
const vm = require('node:vm');
const inventory = { exports: {} };
vm.runInNewContext(ts.transpileModule(require('node:fs').readFileSync(resolve(__dirname, '../src/lib/seoInventory.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, inventory);
const { SEO_CITIES, SEO_ROUTE_DEFINITIONS } = inventory.exports;
const frontend = resolve(__dirname, '..');
const ids = ['5b393fef-f58b-5e42-861e-b3baafbb3a8a', '169a5a4c-3748-51e9-8aa6-5f96df1eb8f4', 'bdfc7fda-3643-5a06-ae6a-23a09489fc1e'];
const paths = ['/es/madrid', '/en/madrid', '/es/madrid/rutas/madrid-esencial', '/en/madrid/rutas/madrid-highlights', '/es/madrid/rutas/madrid-de-los-austrias'];
const allPaths = [...SEO_CITIES.flatMap(city => ['es','en','fr','de','it'].map(lang => `/${lang}/${city.slug}`)), ...SEO_ROUTE_DEFINITIONS.map(r => `/${r.locale}/${r.city}/rutas/${r.slug}`)];
const tours = SEO_ROUTE_DEFINITIONS.map(route => ({ id: route.id, city: SEO_CITIES.find(c => c.slug === route.city).name, country: 'España', countryCode: 'ES', status: 'published', language: route.locale, durationMinutes: 90, title: route.title, introduction: `Introduction to ${route.city} in ${route.locale}.`, pilot: { version: 'fixture', scriptLicense: 'CC BY-SA 4.0' },
  places: Array.from({ length: route.group.endsWith('thematic') ? 5 : 7 }, (_, n) => ({ id: `${n + 1}1111111-1111-4111-8111-111111111111`, name: ['Almudena', 'Palacio Real', 'Plaza de España', 'Plaza Mayor', 'Cibeles', 'Puerta de Alcalá', 'Colón'][n], position: n + 1, latitude: 40.415 + n / 1000, longitude: -3.71, description: `Complete transcript stop ${n + 1}, language ${route.locale}.\n\nEvery paragraph is available before JavaScript.`, audioUrl: `/fixture-audio/${route.id}/${n}` })) }));

async function freePort() { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }

(async () => {
  assert.ok(process.env.CADDY_BIN, 'CADDY_BIN required');
  const temp = await mkdtemp(join(tmpdir(), 'nomuvia-seo-'));
  const children = [];
  let mode = 'ready', browser;
  const seen = [];
  const backend = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] });
    res.setHeader('Content-Type', 'application/json');
    const match = req.url.match(/\/tours\/([0-9a-f-]{36})(\/walking-route)?$/);
    if (mode === 'outage') { res.statusCode = 503; return res.end('{}'); }
    if (match?.[2]) return res.end(JSON.stringify({ data: { provider: 'fossgis-osrm-foot', distanceMeters: 3500, durationSeconds: 2400, geometry: { type: 'LineString', coordinates: [[-3.71, 40.415], [-3.71, 40.421]] } } }));
    if (match) {
      const tour = tours.find(t => t.id === match[1]);
      if (!tour || mode === 'withdrawn' && tour.id === ids[1]) { res.statusCode = 404; return res.end('{}'); }
      return res.end(JSON.stringify(tour));
    }
    res.end(JSON.stringify({ success: true, data: { tours, total: tours.length } }));
  });
  function launch(executable, args, env) {
    const child = spawn(executable, args, { cwd: frontend, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); child.output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => child.output = (child.output + data).slice(-6000));
    return child;
  }
  async function ready(url, child) {
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw Error(child.output);
      try { if ((await fetch(url)).status < 500) return; } catch {}
      await delay(200);
    }
    throw Error(child.output);
  }
  try {
    backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
    const appPort = await freePort(), publicPort = await freePort();
    const app = `http://127.0.0.1:${appPort}`, origin = `http://127.0.0.1:${publicPort}`;
    const token = 'seo-test-proxy-token-more-than-32-characters';
    const next = launch(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], {
      NODE_ENV: 'production', PILOT_MODE: 'true', PILOT_PROXY_TOKEN: token, PILOT_API_KEY: 'seo-participant-key', API_URL: `http://127.0.0.1:${backend.address().port}/api`, UMAMI_SCRIPT_URL: '', UMAMI_WEBSITE_ID: '',
    });
    await ready(app + '/tours', next);
    let caddy = (await readFile(resolve(frontend, '../deployment/pilot/Caddyfile.nomuvia-public'), 'utf8')).split('\nwww.nomuvia.com')[0];
    caddy = '{\n admin off\n}\n' + caddy.replace('nomuvia.com {', `${origin} {`).replace('127.0.0.1:3000', `127.0.0.1:${appPort}`);
    const config = join(temp, 'Caddyfile'); await writeFile(config, caddy);
    execFileSync(process.env.CADDY_BIN, ['validate', '--config', config, '--adapter', 'caddyfile'], { env: { ...process.env, PILOT_PROXY_TOKEN: token }, stdio: 'pipe' });
    const proxy = launch(process.env.CADDY_BIN, ['run', '--config', config, '--adapter', 'caddyfile'], { PILOT_PROXY_TOKEN: token });
    await ready(origin + '/tours', proxy);
    assert.equal((await fetch(app + '/es/madrid')).status, 401, 'private origin remains protected');
    const robots = await fetch(origin + '/robots.txt'); assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Sitemap: https:\/\/nomuvia.com\/sitemap.xml/);
    const sitemap = await fetch(origin + '/sitemap.xml'); assert.equal(sitemap.status, 200);
    const xml = await sitemap.text(); assert.equal((xml.match(/<loc>/g) || []).length, 122);
    for (const path of allPaths) assert.ok(xml.includes(`https://nomuvia.com${path}`));
    assert.ok(!xml.includes('/tours/' + ids[0]), 'player excluded from sitemap');
    for (const path of allPaths) {
      const before = seen.length;
      const response = await fetch(origin + path, { headers: { Cookie: 'tour-page-language=de', 'Accept-Language': 'fr', 'x-nomuvia-page-language': 'it' } });
      assert.equal(response.status, 200, path);
      assert.ok(!/noindex/.test(response.headers.get('x-robots-tag') || ''), path);
      const html = await response.text(), locale = path.split('/')[1];
      assert.match(html, new RegExp(`<html lang="${locale}"`), 'URL controls initial HTML');
      assert.ok(html.includes(`rel="canonical" href="https://nomuvia.com${path}"`));
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
      assert.match(html, /name="robots" content="index, follow"/);
      assert.ok(!html.includes('name="robots" content="noindex'));
      const requestedTours = seen.slice(before).filter(call => !call.url.endsWith('walking-route'));
      assert.equal(requestedTours.length, 6, 'one city catalog per request, deduplicated between page and metadata');
      assert.ok(requestedTours.every(call => SEO_ROUTE_DEFINITIONS.some(r => r.city === path.split('/')[2] && call.url.endsWith(r.id))), 'never load other cities for an individual page');
      if (path.includes('/rutas/')) {
        assert.ok(html.includes('Complete transcript stop 5'), 'complete transcripts in initial HTML');
        assert.ok(html.includes('Every paragraph is available before JavaScript.'));
        assert.match(html, /type="application\/ld\+json"/);
        const route = SEO_ROUTE_DEFINITIONS.find(r => path === `/${r.locale}/${r.city}/rutas/${r.slug}`);
        if (route.group.endsWith('thematic')) assert.ok(!html.includes('hrefLang="en"'), 'no invented translation');
        else for (const lang of ['es','en','fr','de','it']) assert.ok(html.includes(`hrefLang="${lang}"`), 'all five true equivalents linked');
      }
    }
    for (const path of ['/pt/madrid', '/fr/unknown-city', '/es/madrid/rutas/missing', '/es/sevilla/rutas/madrid-esencial']) assert.equal((await fetch(origin + path)).status, 404, path);
    const player = await fetch(origin + '/tours/' + ids[0]);
    assert.match(player.headers.get('x-robots-tag'), /noindex/);
    assert.ok(!(await player.text()).includes('rel="canonical"'), 'player has no conflicting canonical');
    assert.match((await fetch(origin + '/api/backend/tours')).headers.get('x-robots-tag'), /noindex/);
    assert.equal((await fetch(origin + '/api/backend/tours/generate', { method: 'POST' })).status, 403);
    mode = 'withdrawn';
    assert.equal((await fetch(origin + paths[3])).status, 404, 'withdrawn tour is not a soft 404');
    const reduced = await (await fetch(origin + '/sitemap.xml')).text();
    assert.ok(!reduced.includes('/en/madrid'), 'withdrawn last language tour removes city and alternates');
    const reducedEs = await (await fetch(origin + paths[2])).text();
    assert.ok(!reducedEs.includes('hrefLang="en"'));
    mode = 'outage';
    assert.ok((await fetch(origin + paths[0])).status >= 500, 'backend outage is not an empty 200');
    assert.ok((await fetch(origin + '/sitemap.xml')).status >= 500, 'outage does not erase sitemap');
    mode = 'ready';
    assert.ok(seen.every(call => call.method === 'GET' && call.key === 'seo-participant-key'));
    if (process.env.PLAYWRIGHT_MODULE) {
      const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
      browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
      await context.addCookies([{ name: 'tour-page-language', value: 'de', url: origin }]);
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + paths[0]);
      assert.equal(await page.locator('html').getAttribute('lang'), 'es');
      await page.locator('.seo-language-picker > summary').click();
      await page.getByRole('link', { name: 'English', exact: true }).evaluate(a => { a.href = a.pathname; });
      await page.getByRole('link', { name: 'English', exact: true }).click();
      await page.waitForURL('**/en/madrid');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      for (const [lang, city] of [['fr','barcelona'],['de','las-palmas-de-gran-canaria'],['it','sevilla']]) {
        await page.goto(origin + `/${lang}/${city}`);
        assert.equal(await page.locator('html').getAttribute('lang'), lang);
        assert.equal(await page.locator('.seo-header nav a').count(), 5);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${lang} header overflow`);
      }
      await page.goto(origin + paths[2]);
      await page.locator('.seo-stops > li > details > summary').first().click();
      assert.ok(await page.getByText('Complete transcript stop 1, language es.').isVisible());
      assert.equal(await page.locator('audio').getAttribute('preload'), 'none');
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}px`);
      }
      assert.deepEqual(errors, []);
    }
    console.log('PASS: 121 city/route pages, 122 sitemap URLs, 5 locales, bounded city reads, SSR, canonical, true hreflang, withdrawal, outage, read-only access and optional browser flow.');
  } finally {
    if (browser) await browser.close();
    for (const child of children.reverse()) { if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), delay(3000)]); if (child.exitCode === null) child.kill('SIGKILL'); } }
    backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
