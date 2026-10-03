const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'https://nomuvia.com';
const catalog = JSON.parse(fs.readFileSync(__dirname + '/catalog.json'));
const seo = JSON.parse(fs.readFileSync(__dirname + '/seo-additions.json'));
const totals = { es: 52, en: 41, fr: 41, de: 41, it: 41 };
const get = async (url, options) => {
  const response = await fetch(origin + url, options);
  assert(![404, 429, 500, 502, 503].includes(response.status), url + ' returned ' + response.status);
  return response;
};

(async () => {
  const startedAt = new Date().toISOString();
  for (const [language, total] of Object.entries(totals)) {
    const response = await get('/api/backend/tours?language=' + language + '&limit=50');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.total, total);
  }
  let ranges = 0, routes = 0;
  for (const wanted of catalog.tours) {
    const response = await get('/api/backend/tours/' + wanted.id);
    assert.equal(response.status, 200);
    const live = await response.json();
    assert.equal(live.id, wanted.id);
    assert.equal(live.city, wanted.city);
    assert.equal(live.countryCode, wanted.countryCode);
    assert.equal(live.language, wanted.language);
    assert.equal(live.title, wanted.metadata.catalogTitle);
    assert.equal(live.introduction, wanted.introduction);
    assert.equal(live.pilot.approvalMode, 'owner-authorized');
    const places = catalog.places.filter(place => place.tourId === wanted.id).sort((a, b) => a.position - b.position);
    assert.equal(live.places.length, places.length);
    live.places.forEach((place, index) => {
      assert.equal(place.id, places[index].id);
      assert.equal(place.description, places[index].description);
      assert.equal(place.latitude, places[index].latitude);
      assert.equal(place.longitude, places[index].longitude);
    });
    const route = await get('/api/backend/tours/' + wanted.id + '/walking-route');
    assert.equal(route.status, 200);
    const routeData = (await route.json()).data;
    assert.equal(routeData.distanceMeters, wanted.metadata.pilotWalkingRoute.distanceMeters);
    assert.equal(routeData.durationSeconds, wanted.metadata.pilotWalkingRoute.durationSeconds);
    routes += 1;
    for (const audioUrl of [live.introductionAudio.audioUrl, live.places[0].audioUrl]) {
      const audio = await get(audioUrl, { headers: { Range: 'bytes=0-1023' } });
      assert.equal(audio.status, 206);
      assert.equal((await audio.arrayBuffer()).byteLength, 1024);
      ranges += 1;
    }
  }
  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.equal((xml.match(/<loc>/g) || []).length, 422);
  for (const city of seo.cities) for (const language of Object.keys(totals))
    assert(xml.includes(`${origin}/${language}/${city.slug}`));
  for (const route of seo.routes)
    assert(xml.includes(`${origin}/${route.locale}/${route.city}/rutas/${route.slug}`));
  const samples = [];
  for (const city of ['paris', 'berlin', 'roma']) for (const language of Object.keys(totals)) {
    const route = seo.routes.find(item => item.city === city && item.locale === language);
    const tour = catalog.tours.find(item => item.id === route.id);
    samples.push({ route, tour });
  }
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/tours', { waitUntil: 'domcontentloaded' });
    let playback = 0;
    for (const { route, tour } of samples) {
      const live = await (await get('/api/backend/tours/' + tour.id)).json();
      const advanced = await page.evaluate(async url => {
        const audio = new Audio(url);
        await audio.play();
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Playback timeout')), 10000);
          const check = () => {
            if (audio.currentTime > .5) { clearTimeout(timeout); audio.pause(); resolve(); }
            else setTimeout(check, 100);
          };
          check();
        });
        return audio.currentTime;
      }, origin + live.introductionAudio.audioUrl);
      assert(advanced > .5);
      playback += 1;
      const routePath = `/${route.locale}/${route.city}/rutas/${route.slug}`;
      const response = await page.goto(origin + routePath, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      assert(await page.locator('h1').count());
      assert(await page.locator('audio').count());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(__dirname + '/public-smoke.json', JSON.stringify({
      startedAt, finishedAt: new Date().toISOString(), tours: 150, routes,
      partialAudioRequests: ranges, sitemapUrls: 422, browserPlayback: playback,
      mobileRoutePages: samples.length, totals,
    }, null, 2) + '\n');
    console.log(fs.readFileSync(__dirname + '/public-smoke.json', 'utf8'));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
