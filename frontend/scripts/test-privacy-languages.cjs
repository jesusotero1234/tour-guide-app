// Against a running build. Optional TEST_USERNAME/TEST_PASSWORD support private previews.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const titles = { es: 'Privacidad', en: 'Privacy', fr: 'Confidentialité', de: 'Datenschutz', it: 'Privacy' };
(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})});
  try {
    const context = await browser.newContext({locale: 'en-US', viewport: {width:390,height:844},
      ...(process.env.TEST_USERNAME ? {httpCredentials: {username:process.env.TEST_USERNAME,password:process.env.TEST_PASSWORD}} : {})});
    const page = await context.newPage();
    for (const [language, title] of Object.entries(titles)) {
      await page.goto(base + '/tours');
      const banner = page.locator('.privacy-banner');
      if (await banner.isVisible()) await banner.locator('button').first().click();
      await page.locator('#page-language').selectOption(language);
      const link = page.locator('footer nav a[href="/privacy?lang=' + language + '"]');
      await link.click();
      await page.locator('main[lang="' + language + '"]').waitFor();
      assert.equal(await page.locator('main h1').textContent(), title);
      await page.evaluate(() => {
        localStorage.setItem('tour-reading:privacy-language-test', 'test');
        localStorage.setItem('tour-privacy-v1', 'keep-consent');
        localStorage.setItem('unrelated-test', 'keep');
      });
      await page.locator('main button').click();
      assert.ok(await page.locator('main [role=status]').textContent());
      assert.deepEqual(await page.evaluate(() => [localStorage.getItem('tour-reading:privacy-language-test'),localStorage.getItem('tour-privacy-v1'),localStorage.getItem('unrelated-test')]), [null,'keep-consent','keep']);
      await page.goto(base + '/privacy');
      if (await banner.isVisible()) await banner.locator('button').first().click();
      assert.equal(await page.locator('main').getAttribute('lang'), language, 'saved language without query');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('.privacy-settings-link').click();
      assert.equal(await page.locator('dialog a[href^="/privacy"]').getAttribute('href'), '/privacy?lang=' + language);
      await page.locator('dialog').press('Escape');
      console.log('PASS privacy language, navigation, clear progress and settings:', language);
    }
    await context.clearCookies();
    await page.goto(base + '/privacy?lang=invalid');
    assert.equal(await page.locator('main').getAttribute('lang'), 'en', 'browser language fallback');
    await page.goto(base + '/privacy?lang=de');
    assert.equal(await page.locator('main').getAttribute('lang'), 'de', 'explicit language');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
