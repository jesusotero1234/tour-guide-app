// For a deployed preview with analytics unconfigured. Uses isolated browser storage.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    for (const [language,button] of Object.entries({es:'Entendido',en:'Got it',fr:'Compris',de:'Verstanden',it:'Ho capito'})) {
      const context = await browser.newContext({locale:language,viewport:{width:390,height:844},
        ...(process.env.TEST_USERNAME ? {httpCredentials:{username:process.env.TEST_USERNAME,password:process.env.TEST_PASSWORD}} : {})});
      const page = await context.newPage();
      await page.goto(base+'/about');
      const banner = page.locator('.privacy-banner');
      await banner.waitFor();
      assert.equal(await page.locator('#umami-analytics').count(),0);
      assert.equal(await banner.locator('button').count(),2,'acknowledge and settings; no inactive analytics consent');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await banner.getByRole('button',{name:button,exact:true}).click();
      await banner.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tour-privacy-v1')).analytics),false);
      await page.reload();
      await page.locator('.privacy-settings-link').waitFor();
      assert.equal(await banner.count(),0,'acknowledgement persists');
      await page.locator('.privacy-settings-link').click();
      assert.equal(await page.getByRole('dialog').getByRole('checkbox').isDisabled(),true);
      await page.keyboard.press('Escape');
      await page.evaluate(()=>localStorage.setItem('tour-privacy-v1',JSON.stringify({version:1,analytics:false,savedAt:0})));
      await page.reload();
      await banner.waitFor();
      await context.close();
      console.log('PASS first visit, acknowledgement, reload, expiry, disabled analytics and mobile:',language);
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
