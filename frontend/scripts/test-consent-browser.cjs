// Same configured test server and browser environment as test-analytics-browser.cjs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:3107';
const key = 'tour-privacy-v1';
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const context = await browser.newContext({locale:'es-ES',viewport:{width:390,height:844}});
    const requests = [], errors = [];
    await context.route('https://stats.example.org/**', route => {
      requests.push(route.request().url());
      const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-umami-website-id,x-umami-hostname,x-umami-cache'};
      return route.fulfill({headers,contentType:route.request().url().endsWith('script.js')?'application/javascript':'application/json',body:route.request().url().endsWith('script.js')?'window.umami={getSession:()=>({})};':'{"cache":"test"}'});
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/privacy');
    const banner = page.locator('.privacy-banner');
    await banner.waitFor();
    assert.equal(requests.length, 0, 'no tracker download or event before choice');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'no mobile overflow');
    await page.screenshot({path:'/tmp/tour-cookie-mobile.png'});
    await page.getByRole('button',{name:'Rechazar estadísticas',exact:true}).click();
    await banner.waitFor({state:'detached'});
    await page.reload();
    await page.getByRole('button',{name:'Configurar privacidad',exact:true}).waitFor();
    assert.equal(await banner.count(),0,'rejection persists');
    assert.equal(requests.length,0,'rejection prevents requests');
    await page.getByRole('button',{name:'Configurar privacidad',exact:true}).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('checkbox').isChecked(),false,'statistics default off');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Configurar privacidad',exact:true}).evaluate(el=>el===document.activeElement),true,'focus returns after closing');
    await page.getByRole('button',{name:'Configurar privacidad',exact:true}).click();
    await dialog.getByRole('checkbox').check();
    assert.equal(requests.length,0,'unsaved changes do not enable tracking');
    await page.screenshot({path:'/tmp/tour-cookie-settings.png'});
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/send') && r.request().method()==='POST'), dialog.getByRole('button',{name:'Guardar preferencias'}).click()]);
    await page.waitForFunction(()=>!!window.umami);
    assert.ok(requests.some(url=>url.endsWith('script.js')));
    assert.ok(requests.some(url=>url.endsWith('api/send')));
    assert.equal(await page.locator('#umami-analytics').getAttribute('data-auto-track'),'false');
    const other = await context.newPage();
    await other.goto(base + '/privacy');
    await other.waitForFunction(()=>!!window.umami);
    await page.getByRole('button',{name:'Configurar privacidad',exact:true}).click();
    await dialog.getByRole('button',{name:'Rechazar estadísticas',exact:true}).click();
    await other.waitForFunction(()=>JSON.parse(localStorage.getItem('tour-privacy-v1')).analytics===false);
    const before = requests.length;
    await other.getByRole('link',{name:'Fuentes y licencias'}).first().click();
    await other.waitForURL('**/data-sources*');
    await other.getByRole('heading',{level:1}).waitFor();
    assert.equal(requests.length,before,'revocation prevents route tracking in another tab');
    await page.reload();
    await page.getByRole('button',{name:'Configurar privacidad',exact:true}).waitFor();
    assert.equal(requests.length,before,'revocation prevents tracker reload');
    await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,analytics:true,savedAt:0})),key);
    await page.reload();
    await banner.waitFor();
    assert.equal(requests.length,before,'expired consent does not enable tracking');
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'/tmp/tour-cookie-desktop.png'});
    assert.deepEqual(errors,[]);
    await context.close();
    for (const mode of ['dnt','blocked','malformed']) {
      const isolated = await browser.newContext({locale:'es-ES'});
      let hits = 0;
      await isolated.route('https://stats.example.org/**',r=>{hits++;return r.abort();});
      await isolated.addInitScript(({mode,key})=>{
        if(mode==='dnt') {
          localStorage.setItem(key,JSON.stringify({version:1,analytics:true,savedAt:Date.now()}));
          Object.defineProperty(navigator,'doNotTrack',{value:'1'});
        } else if(mode==='blocked') {
          Storage.prototype.getItem=()=>{throw new Error('blocked');};
          Storage.prototype.setItem=()=>{throw new Error('blocked');};
        } else localStorage.setItem(key,'{invalid');
      },{mode,key});
      const p = await isolated.newPage();
      await p.goto(base+'/privacy');
      if (mode === 'malformed') {
        await p.locator('.privacy-banner').waitFor();
        await p.locator('.privacy-banner .privacy-text-action').click();
      } else {
        await p.locator('.privacy-settings-link').click();
      }
      await p.getByRole('dialog').waitFor();
      assert.equal(hits,0,mode+' prevents tracking');
      if(mode!=='malformed') assert.equal(await p.getByRole('checkbox').isDisabled(),true);
      await isolated.close();
    }
    console.log('Consent browser checks passed: initial block, rejection, settings, keyboard focus, acceptance, cross-tab revocation, expiry, DNT, blocked storage, malformed choice, mobile and desktop.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
