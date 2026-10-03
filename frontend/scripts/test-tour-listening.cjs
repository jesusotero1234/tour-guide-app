// BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node frontend/scripts/test-tour-listening.cjs
// Browser smoke test; intercepts requests, never writes to the database.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const description = Array.from({length: 15}, (_, i) => 'Párrafo ' + i + '. La historia de Sevilla se puede leer con calma mientras continúa la narración. Cada detalle del lugar nos invita a mirar a nuestro alrededor.').join('\n\n');
const photo = i => ({ id: 'photo' + i, role: i ? 'detail' : 'primary', paragraphIndex: 0, paragraphText: description.split('\n\n')[0], caption: 'Vista ' + i, alt: 'Patio ' + i, url: 'https://upload.wikimedia.org/listening-test-' + i + '.svg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.svg', sourceTitle: 'Test', author: 'Test', attribution: 'Test', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', changes: 'none', width: 600, height: 600 });
const places = ['Alcázar', 'Giralda', 'Catedral'].map((name, i) => ({ id: 'stop-' + i, audioVersion: 'v1', name, description, position: i + 1, latitude: 37.38 + i * .003, longitude: -5.99, metadata: { sourceCredits: {version:'test',items:[{sourceId:'wiki',title:'Giralda — fuente de prueba',url:'https://es.wikipedia.org/wiki/Giralda',attribution:'Wikipedia contributors',capturedAt:'2026-09-08',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',status:'permitted',usage:'research'}]}, tourImages: { version: 1, sourceText: description, status: 'ready', images: [photo(0), photo(1)] } } }));
const tour = { id: 'listening-test', city: 'Sevilla', country: 'España', language: 'es', status: 'review', places };
const wav = Buffer.alloc(44 + 320000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
(async () => {
  const browserType = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({ headless: true, ...(browserType === chromium && process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}) });
  const access = process.env.PREVIEW_ACCESS_FILE ? JSON.parse(require('node:fs').readFileSync(process.env.PREVIEW_ACCESS_FILE, 'utf8')) : null;
  const context = await browser.newContext({locale: 'es-ES', viewport: {width: 390, height: 844}, reducedMotion: 'reduce', ...(process.env.PREVIEW_PROXY_TOKEN ? {extraHTTPHeaders: {'x-pilot-proxy-token': process.env.PREVIEW_PROXY_TOKEN}} : {}), ...(access ? {httpCredentials: {username: access.user, password: access.password}} : {})});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  let failAudio = false, noPhotos = false, unavailable = false, posts = 0;
  await context.addInitScript(() => Object.defineProperty(navigator, 'geolocation', {configurable: true, value: {watchPosition: (_ok, fail) => {window.gpsCalls = (window.gpsCalls || 0) + 1; setTimeout(() => fail({code: 1}), 0); return 1;}, clearWatch() {}}}));
  await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await context.route('https://upload.wikimedia.org/listening-test-*', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#ccb99a"/></svg>'}));
  await context.route('**/api/backend/**', route => {
    if (route.request().url().endsWith('/audio')) {
      if (route.request().method() === 'POST') posts++;
      return route.fulfill({json: {tourId: tour.id, status: unavailable ? 'failed' : 'completed', phase: 'completed', completedStops: 3, totalStops: 3, audioVersions: Object.fromEntries(places.map(p => [p.id, p.audioVersion])), introduction: tour.introductionAudio, transcripts: Object.fromEntries(places.map(p => [p.id,'Esta audioguía experimental utiliza una voz generada por inteligencia artificial. Texto.'])), audioUrls: unavailable ? {} : Object.fromEntries(places.map(p => [p.id, '/test-audio/' + p.id + '.wav']))}});
    }
    if (route.request().url().endsWith('/walking-route')) return route.fulfill({status: 503, json: {error: {message: 'test failure'}}});
    return route.fulfill({json: noPhotos ? {...tour, places: places.map(p => ({...p, metadata: undefined}))} : tour});
  });
  await context.route('**/test-audio/**', route => {
    if (failAudio) return route.abort();
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({status: range ? 206 : 200, headers: {'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', ...(range ? {'Content-Range': 'bytes ' + start + '-' + end + '/' + wav.length} : {})}, body: wav.subarray(start, end + 1)});
  });
  const start = async (target = page, showNotice = false) => {
    const privacyNotice = target.locator('.privacy-banner');
    // The notice renders after hydration; waiting for it avoids a race in which it appears later over the player.
    await privacyNotice.waitFor({timeout: 4000}).catch(() => {});
    if (await privacyNotice.isVisible()) await privacyNotice.getByRole('button', {name: 'Entendido', exact: true}).click();
    if (showNotice) { const b = target.getByRole('button', {name:'Entendido, empezar',exact:true}); await b.waitFor(); await b.click(); }
    else { await target.locator('.listening-header').waitFor(); assert.equal(await target.locator('.tour-safety h1').count(), 0); }
  };
  const ready = () => page.waitForFunction(() => document.querySelector('audio')?.duration === 20);
  const button = name => page.getByRole('button', {name, exact: true});
  const same = async () => assert.equal(await page.evaluate(() => window.testAudio === document.querySelector('audio')), true);
  const menu = async () => {await page.locator('.stop-selector').click(); await page.locator('.stop-popover[data-open="true"]').waitFor();};
  const select = async i => {await menu(); await page.locator('[data-stop="' + i + '"]').click(); await ready();};
  const back = async () => {await button('← Volver').click(); await page.locator('main[data-view="photos"]').waitFor();};
  const finish = async () => {await page.locator('audio').evaluate(a => {a.currentTime = 19.8; return a.play();}); await page.locator('.stop-finished').waitFor();};
  const url = (process.env.BASE_URL || 'http://127.0.0.1:3100') + '/tours/' + tour.id + '?listen=1';
  try {
    if (process.env.WELCOME_ONLY === '1') {
      tour.introduction = 'Bienvenido a Sevilla. Vamos a descubrir sus plazas y sus historias.\n\n' + 'Miraremos la ciudad a nuestro ritmo. '.repeat(60);
      tour.introductionAudio = {status:'completed',text:tour.introduction,audioUrl:'/test-audio/introduction.wav',version:'intro-v1'};
      places[0].name = 'alcázar'; places[1].nameInTourLanguage = 'église de la Giralda';
      places[0].audioVersion = 'first-separated';
      await page.addInitScript(() => localStorage.setItem('tour-listening:listening-test:stop-0:v1', JSON.stringify({position:12,duration:20,completed:true})));
      await page.goto(url); await start(page, true); await ready();
      assert.equal(await page.locator('main').getAttribute('data-segment'), 'introduction');
      assert.equal(await page.locator('.listening-story h1').textContent(), 'Bienvenida al tour');
      assert.equal(await page.locator('.listening-tabs').isVisible(), false);
      assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
      await page.locator('audio').evaluate(a => {a.currentTime = 8; a.dispatchEvent(new Event('seeked'));});
      await button('Ir a la primera parada →').click(); await ready();
      assert.equal(await page.locator('.player-title').textContent(), 'Alcázar');
      assert.equal(await page.locator('audio').evaluate(a => a.currentTime), 0, 'New first audio does not inherit seconds from the legacy combined narration');
      assert.equal(await page.locator('.player-play svg path').count(), 1);
      assert.equal(await page.locator('.player-play').textContent(), '');
      await button('Leer').click();
      assert.equal(await page.locator('.listening-story').innerText().then(t => t.includes('Bienvenido a Sevilla')), false);
      await select(1);
      assert.equal(await page.locator('.listening-story h1').textContent(), 'Église de la Giralda');
      places[0].audioVersion = 'first-next-edition';
      await page.reload(); await start(); await ready();
      assert.match(await page.locator('.stop-selector').innerText(), /Parada 2/, 'Stable stop selection survives changed audio editions');
      await menu(); await page.locator('[data-stop="introduction"]').click(); await ready();
      assert.equal(await page.locator('audio').evaluate(a => a.currentTime), 8, 'Introduction has its own saved listening position');
      await page.locator('audio').evaluate(a => {a.currentTime = 19.8; return a.play();});
      await page.waitForFunction(() => document.querySelector('audio')?.ended);
      assert.equal(await page.locator('main').getAttribute('data-segment'), 'introduction', 'No autoplay into stop one');
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({width,height:568});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await page.locator('.player-play').evaluate(el => {const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
      }
      await menu();
      assert.equal(await page.locator('.stop-popover ol li').count(), 3, 'The introduction is not counted as a real stop');
      // The mark saved for stop one under its previous audio version carries over to the new version (plan 05 section 4.4, the audio is
      // regenerated and every version changes); finishing the introduction is a different key and never marks a stop.
      assert.match(await page.locator('[data-stop="0"]').innerText(), /Escuchada/, 'A completed mark survives a new audio version of the same stop');
      assert.doesNotMatch(await page.locator('[data-stop="1"]').innerText(), /Escuchada/, 'Introduction completion does not complete another stop');
      await page.keyboard.press('Escape');
      await button('Ir a la primera parada →').click(); await ready();
      await button('Mapa').click(); await page.locator('details.map-options summary').click();
      assert.equal(await page.locator('#tour-destination option').count(), 3);
      assert.equal(await page.evaluate(() => window.gpsCalls || 0), 0);
      const other = await context.newPage();
      tour.id = 'another-welcome-test'; tour.language = 'fr';
      await other.goto(new URL('/tours/' + tour.id + '?listen=1', url).href);
      await other.getByRole('heading', {name:'Bienvenue dans cette visite',exact:true}).waitFor();
      assert.equal(await other.locator('.tour-safety').count(), 0);
      await other.getByRole('button', {name:'Aller à la première étape →',exact:true}).click();
      await other.close();
      assert.deepEqual(errors, []);
      console.log('PASS: integrated introduction, separate audio progress, edition migration, real stop counts, no autoplay, SVG play and mobile layouts.');
      return;
    }
    await page.goto(url); await page.getByText('Tu paseo, a tu ritmo', {exact:true}).waitFor();
    assert.equal(await page.locator('audio').count(), 0); assert.equal(await page.evaluate(() => window.gpsCalls || 0), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('tour-notice:v1')), null);
    await start(page, true); await ready();
    assert.equal(await page.evaluate(() => localStorage.getItem('tour-notice:v1')), '1');
    // NOTICE_ONLY=1 exercises the remembered notice without running unrelated listening scenarios.
    if (process.env.NOTICE_ONLY === '1') {
      await page.addInitScript(() => {
        window.noticeFlashed = false;
        new MutationObserver(() => { if (document.querySelector('.tour-safety h1')) window.noticeFlashed = true; })
          .observe(document, {childList: true, subtree: true});
      });
      await page.reload(); await start(); await ready();
      assert.equal(await page.evaluate(() => window.noticeFlashed), false);
      assert.equal(await page.evaluate(() => window.gpsCalls || 0), 0);
      assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
      await page.locator('.tour-information > summary').click();
      await page.getByText('Tu ubicación es opcional. Las fotos vienen de Wikimedia y los mapas de OpenStreetMap.', {exact: true}).waitFor();
      const other = await context.newPage();
      const firstId = tour.id; tour.id = 'another-notice-test';
      await other.goto(new URL('/tours/' + tour.id + '?listen=1', url).href); await start(other);
      assert.equal(await other.evaluate(() => window.gpsCalls || 0), 0);
      tour.id = firstId;
      await other.goto(new URL('/privacy?lang=es', url).href);
      await other.evaluate(() => localStorage.setItem('keep-unrelated', 'yes'));
      await other.getByRole('button', {name: 'Borrar progreso y preferencias', exact: true}).click();
      assert.equal(await other.evaluate(() => localStorage.getItem('tour-notice:v1')), null);
      assert.equal(await other.evaluate(() => localStorage.getItem('keep-unrelated')), 'yes');
      await other.goto(url);
      await other.getByRole('heading', {name: 'Tu paseo, a tu ritmo', exact: true}).waitFor();
      await other.close();
      const blocked = await context.newPage();
      blocked.on('pageerror', e => errors.push(e.message));
      await blocked.addInitScript(() => {
        const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        Storage.prototype.getItem = function(key) { if (key.startsWith('tour-')) throw Error('blocked'); return get.call(this, key); };
        Storage.prototype.setItem = function(key, value) { if (key.startsWith('tour-')) throw Error('blocked'); return set.call(this, key, value); };
      });
      await blocked.goto(url); await start(blocked, true);
      await blocked.locator('.listening-header').waitFor();
      await blocked.reload();
      await blocked.getByRole('heading', {name: 'Tu paseo, a tu ritmo', exact: true}).waitFor();
      await blocked.close();
      assert.equal(posts, 0); assert.deepEqual(errors, []);
      console.log('PASS: notice shown once, no flash on reload, remembered across tours, no GPS/autoplay, privacy reset and blocked storage.');
      return;
    }
    assert.equal(await page.getByText('Draft — pending review').count(), 0);
    await button('Reproducir narración').click();
    await page.waitForFunction(() => document.querySelector('audio').currentTime > .2);
    await page.evaluate(() => {window.testAudio = document.querySelector('audio');});
    await button('Leer').click(); await same();
    assert.equal(await page.locator('.listening-tabs button').count(), 3);
    assert.deepEqual(await page.locator('.listening-tabs button').evaluateAll(b => b.map(x => x.textContent.trim())), ['Mirar','Leer','Mapa']);
    assert.equal(await page.locator('.listening-tabs button[aria-pressed="true"]').evaluate(e => e.textContent.trim()), 'Leer');
    assert.equal(await page.locator('.audio-transcript').count(), 0);
    await page.locator('.listening-story .source-credits summary').click();
    assert.equal(await page.locator('.listening-story .source-credits a').first().getAttribute('href'),'https://es.wikipedia.org/wiki/Giralda');
    assert.equal(await page.locator('audio').evaluate(a => a.paused), false);
    await page.locator('.listening-story').evaluate(e => {e.scrollTop = 350; e.dispatchEvent(new Event('scroll'));});
    await back(); await button('Foto siguiente').click(); await same();
    await button('Mapa').click();
    assert.equal(await page.evaluate(() => window.gpsCalls || 0), 0);
    await page.locator('.map-canvas').waitFor();
    await page.getByText('Recorrido no disponible.', {exact: false}).waitFor();
    const collapsedHeight = await page.locator('.map-canvas').evaluate(e => e.getBoundingClientRect().height);
    assert.equal(await page.locator('details.map-options').evaluate(e => e.open), false);
    assert.equal(await page.locator('details.map-options select').isVisible(), false);
    assert.equal(await page.locator('.listening-tabs button').count(), 3);
    assert.equal(await button('Usar mi ubicación').isVisible(), true, 'The location button is visible on the map without opening the options (plan 06 A1)');
    await page.locator('details.map-options summary').click();
    await page.locator('details.map-options select').waitFor();
    assert.equal(await page.locator('details.map-options select').isVisible(), true);
    assert.equal(await page.evaluate(() => window.gpsCalls || 0), 0);
    await button('Usar mi ubicación').click();
    await page.getByText('La ubicación está desactivada.', {exact: false}).waitFor();
    assert.equal(await page.evaluate(() => window.gpsCalls), 1);
    await page.getByText('Recorrido no disponible.', {exact: false}).waitFor();
    assert.equal(await page.getByRole('link',{name:'FOSSGIS/OSRM',exact:true}).count(),1);
    await page.getByLabel('Elegir destino').selectOption('1'); await same();
    const maps = new URL(await page.locator('.directions-link').getAttribute('href'));
    assert.equal(maps.searchParams.get('destination'), '37.383,-5.99');
    assert.equal(maps.searchParams.get('travelmode'), 'walking'); assert.equal(maps.searchParams.has('origin'), false);
    await page.locator('details.map-options summary').click();
    assert.equal(await page.locator('details.map-options').evaluate(e => e.open), false);
    await page.getByText('La ubicación está desactivada.', {exact: false}).waitFor();
    await page.getByRole('button', {name: 'Dejar de usar mi ubicación', exact: true}).waitFor();
    await button('Dejar de usar mi ubicación').click();
    assert.equal(await page.evaluate(() => window.gpsCalls || 0), 1);
    const mapHeight = await page.locator('.map-canvas').evaluate(e => e.getBoundingClientRect().height);
    assert.ok(mapHeight >= collapsedHeight - 2);
    await back(); await button('Leer').click();
    assert.equal(await page.locator('.listening-story').evaluate(e => e.scrollTop), 350); await back();
    await menu(); await page.mouse.click(8, 500); await page.locator('.stop-popover[data-open="false"]').waitFor({state: 'attached'}); await same();
    await menu(); await page.keyboard.press('Escape'); await same();
    await select(1); assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
    await page.locator('audio').evaluate(a => {a.currentTime = 5;});
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('tour-listening:listening-test:stop-1:v1')).position === 5);
    await page.reload(); await start(); await ready();
    assert.match(await page.locator('.stop-selector').innerText(), /Parada 2/);
    assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
    assert.equal(await page.locator('audio').evaluate(a => a.currentTime), 5);
    await button('Avanzar 15 segundos').click(); await page.waitForFunction(() => document.querySelector('audio').currentTime === 20);
    await button('Retroceder 15 segundos').click(); await page.waitForFunction(() => document.querySelector('audio').currentTime === 5);
    await select(0); assert.ok(await page.locator('audio').evaluate(a => a.currentTime > 0));
    await finish(); await menu(); assert.match(await page.locator('[data-stop="0"]').innerText(), /Escuchada/); await page.keyboard.press('Escape');
    await button('Siguiente parada: Giralda →').click(); await ready();
    assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
    await select(2); await finish();
    await page.getByText('Última parada del recorrido.', {exact: true}).waitFor();
    assert.equal(await page.getByText('Has escuchado todo el tour.').count(), 0);
    await button('Reproducir narración').click(); await page.waitForFunction(() => document.querySelector('audio').currentTime < 2);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tour-listening:listening-test:stop-2:v1')).completed), true);
    await page.locator('audio').evaluate(a => a.pause()); await button('Reproducir narración').waitFor();
    failAudio = true; await page.reload(); await start(); await page.getByText('No se pudo cargar el audio.', {exact: false}).waitFor();
    failAudio = false; await button('Reintentar').click(); await ready();
    noPhotos = true; await page.reload(); await start(); await ready(); await page.getByText('Mira a tu alrededor.').waitFor();
    unavailable = true; await page.reload(); await start(); await button('Reintentar').click();
    await page.waitForFunction(() => document.querySelector('.audio-preparation button') !== null); assert.equal(posts, 1);
    unavailable = false; await page.setViewportSize({width: 320, height: 568}); await page.reload(); await start(); await ready();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await button('Leer').click();
    assert.equal(await page.locator('.listening-tabs button').count(), 3);
    await button('Mapa').click();
    assert.equal(await page.locator('.listening-tabs button').count(), 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.map-canvas').waitFor();
    await page.getByText('Recorrido no disponible.', {exact: false}).waitFor();
    const mapSummaryBox = await page.locator('details.map-options summary').boundingBox();
    const mapsLinkBox = await page.getByRole('link', {name: 'Abrir en Mapas ↗', exact: true}).boundingBox();
    const playerTop = (await page.locator('.listening-footer').boundingBox()).y;
    assert.ok(Math.abs(mapsLinkBox.y - mapSummaryBox.y) < 1 && mapsLinkBox.x >= mapSummaryBox.x + mapSummaryBox.width);
    assert.ok(mapsLinkBox.y + mapsLinkBox.height <= playerTop && mapSummaryBox.y + mapSummaryBox.height <= playerTop, 'Both map actions fit above the player');
    const tabsCenter = await page.locator('.listening-tabs button').evaluateAll(es => (es[0].getBoundingClientRect().left + es[es.length - 1].getBoundingClientRect().right) / 2);
    assert.ok(Math.abs(tabsCenter - 160) < 1, 'Tabs centered on mobile');
    assert.ok(mapSummaryBox.x >= 0 && mapSummaryBox.x + mapSummaryBox.width <= 320 && mapSummaryBox.y >= 0 && mapSummaryBox.y + mapSummaryBox.height <= 568);
    assert.ok(await page.locator('.map-canvas').evaluate(e => e.getBoundingClientRect().height > 0));
    await page.locator('details.map-options summary').click();
    const creditBox = await page.getByText('Ruta a pie:', {exact: false}).boundingBox();
    const optionsBox = await page.locator('details.map-options').boundingBox();
    assert.ok(creditBox.y + creditBox.height <= optionsBox.y, 'Map credits must not overlap expanded options');
    await page.locator('details.map-options select').scrollIntoViewIfNeeded();
    const destinationBox = await page.locator('details.map-options select').boundingBox();
    const footerBox = await page.locator('.listening-footer').boundingBox();
    assert.ok(destinationBox.y + destinationBox.height <= footerBox.y, 'Expanded options must be reachable above the player');
    await button('Mirar').click();
    await button('Reproducir narración').click(); await button('Pausar narración').waitFor();
    const box = await page.locator('.player-play').boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= 568);
    const fallback = await context.newPage();
    fallback.on('pageerror', error => errors.push('Fallback: ' + error.message));
    await fallback.addInitScript(() => {
      delete HTMLElement.prototype.showPopover;
      // Block app storage; Next's development overlay uses unrelated keys before the app mounts.
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key.startsWith('tour-')) throw Error('blocked'); return get.call(this,key); };
      Storage.prototype.setItem = function(key,value) { if (key.startsWith('tour-')) throw Error('blocked'); return set.call(this,key,value); };
    });
    await fallback.goto(url); await start(fallback, true); await fallback.waitForFunction(() => document.querySelector('audio')?.duration === 20);
    await fallback.locator('.stop-selector').click(); await fallback.locator('[data-stop="1"]').click();
    await fallback.getByRole('button', {name: 'Reproducir narración', exact: true}).click();
    await fallback.getByRole('button', {name: 'Pausar narración', exact: true}).waitFor(); await fallback.close();
    places.forEach(p => {p.audioVersion='v2';});
    await page.reload(); await start(); await ready();
    assert.match(await page.locator('.stop-selector').innerText(),/Parada 3/, 'Changing audio versions preserves the selected real stop');
    assert.equal(await page.locator('audio').evaluate(a=>a.currentTime),0);
    const privacy = await context.newPage();
    await privacy.addInitScript(() => Object.defineProperty(navigator, 'geolocation', {configurable:true,value:{
      watchPosition: ok => {window.gpsCalls=(window.gpsCalls||0)+1;window.lateGPS=ok;ok({coords:{latitude:37.381,longitude:-5.991}});return 7;},
      clearWatch: () => {window.gpsCleared=(window.gpsCleared||0)+1;}
    }}));
    await privacy.goto(url); await start(privacy);
    await privacy.getByRole('button',{name:'Mapa',exact:true}).click();
    assert.equal(await privacy.evaluate(()=>window.gpsCalls||0),0);
    await privacy.getByRole('button',{name:'Usar mi ubicación',exact:true}).click();
    await privacy.getByRole('button',{name:'Dejar de usar mi ubicación',exact:true}).click();
    await privacy.evaluate(()=>window.lateGPS({coords:{latitude:37.4,longitude:-5.9}}));
    assert.equal(await privacy.evaluate(()=>window.gpsCleared),1);
    assert.equal(await privacy.getByRole('button',{name:'Dejar de usar mi ubicación',exact:true}).count(),0);
    await privacy.goto(new URL('/privacy?lang=es',url).href);
    await privacy.getByRole('heading',{name:'Privacidad',exact:true}).waitFor();
    await privacy.evaluate(()=>{localStorage.setItem('tour-listening:test','test');localStorage.setItem('keep-unrelated','yes');});
    await privacy.getByRole('button',{name:'Borrar progreso y preferencias',exact:true}).click();
    assert.deepEqual(await privacy.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tour-') && k !== 'tour-privacy-v1')),[]);
    assert.equal(await privacy.evaluate(()=>localStorage.getItem('keep-unrelated')),'yes');
    await privacy.goto(new URL('/about?lang=fr',url).href);
    await privacy.getByRole('heading',{name:'Voix générée par IA',exact:true}).waitFor();
    tour.language='fr'; await privacy.goto(url);
    await privacy.getByRole('button',{name:'Compris, commencer',exact:true}).click();
    await privacy.getByText('Voix générée par IA',{exact:false}).first().waitFor();
    await privacy.waitForFunction(() => document.querySelector('audio')?.duration === 20);
    for (const language of ['en', 'de', 'it']) {
      tour.language = language;
      await privacy.goto(url);
      const notice = privacy.locator('.tour-safety button').first();
      await Promise.race([notice.waitFor(), privacy.locator('.listening-header').waitFor()]);
      if (await notice.isVisible()) await notice.click();
      await privacy.waitForFunction(() => document.querySelector('audio')?.duration === 20);
      await privacy.locator('.player-play').click();
      await privacy.waitForFunction(() => !document.querySelector('audio').paused);
    }
    await privacy.close(); tour.language='es';
    let geocodingCalls=0, catalogueCalls=0;
    await page.route('**/api/geocoding/cities**',r=>{geocodingCalls++;return r.fulfill({json:[]});});
    await page.route('**/api/backend/tours?**',r=>{catalogueCalls++;return r.fulfill({json:{success:true,data:{tours:[],total:0}}});});
    await page.goto(new URL('/tours',url).href);
    const cityInput=page.getByLabel('¿Qué ciudad quieres explorar?',{exact:true});
    await cityInput.fill('Sevilla');
    await page.getByRole('heading',{name:'Todavía no hay tours en español para Sevilla',exact:true}).waitFor();
    assert.equal(geocodingCalls,0); assert.equal(catalogueCalls,1);
    assert.deepEqual(errors, []);
    console.log('PASS: audio continuity, reading, gallery, map, menu, resume, completion, errors, mobile layout and fallbacks.');
  } catch (error) {await page.screenshot({path: '/tmp/tour-listening-failure.png'}); throw error;}
  finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
