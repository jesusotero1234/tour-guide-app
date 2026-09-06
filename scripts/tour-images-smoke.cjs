// Synthetic API/photo fixtures against the real Next tour page; no live generation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const description = 'Mira la fachada del palacio que tienes delante.\n\nFíjate en el escudo sobre la entrada.';
const image = (role, index, id) => ({
 id,role,paragraphIndex:index,paragraphId:'anchor-'+id,paragraphText:description.split('\n\n')[index],
 caption:role==='primary'?'Fachada del palacio':'El escudo sobre la entrada',alt:role==='primary'?'Fachada del palacio':'Detalle del escudo',
 url:'https://upload.wikimedia.org/'+id+'.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:'+id+'.jpg',
 sourceTitle:id+'.jpg',author:'Autora de prueba',attribution:'Autora de prueba',license:'CC BY 4.0',
 licenseUrl:'https://creativecommons.org/licenses/by/4.0/',changes:'none',width:1000,height:650,
 entityId:'Q123',identityEvidence:'wikidata-p18',verifiedAt:'2026-09-06T00:00:00Z',visualReason:'Synthetic test',
});
const tour={id:'image-smoke',city:'Madrid',country:'España',countryCode:'ES',theme:'history',language:'es',
 durationMinutes:60,status:'published',createdAt:'2026-09-06T00:00:00Z',places:[{
 id:'p1',name:'Palacio de prueba',description,position:0,latitude:40.415,longitude:-3.714,
 metadata:{tourImages:{version:1,sourceText:description,status:'ready',images:[image('primary',0,'facade'),image('detail',1,'shield'),image('primary',0,'extra')]}}
}]};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650"><rect width="1000" height="650" fill="#e6dfd0"/><path d="M100 510V220L500 90L900 220V510Z" fill="#b59e80"/><path d="M430 510V300h140v210" fill="#665344"/><text x="500" y="590" text-anchor="middle" font-size="34" fill="#403225">Imagen sintética de prueba</text></svg>';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=[];
  await page.route('**/api/backend/tours/image-smoke',r=>r.fulfill({json:tour}));
  await page.route('https://upload.wikimedia.org/**',r=>{requests.push(r.request().url());return r.fulfill({contentType:'image/svg+xml',body:svg});});
  await page.goto((process.env.SMOKE_BASE_URL||'http://127.0.0.1:3107')+'/tours/image-smoke');
  const card=page.locator('#guide-text article');
  await card.getByRole('button',{name:'Ampliar foto: Fachada del palacio'}).waitFor();await card.scrollIntoViewIfNeeded();
  assert.equal(await card.locator('img:visible').count(),1);
  const detail=card.getByRole('button',{name:'Ver: El escudo sobre la entrada'});
  assert.equal(await detail.count(),1);assert(!requests.some(u=>u.includes('shield')));
  await detail.click();const dialog=page.locator('dialog[open]');await dialog.waitFor();
  assert.equal(await dialog.getByRole('img').getAttribute('alt'),'Detalle del escudo');
  assert.equal(await dialog.getByRole('link',{name:'CC BY 4.0'}).count(),1);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await page.keyboard.press('Shift+Tab');
  assert(await page.evaluate(()=>document.querySelector('dialog[open]').contains(document.activeElement)));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]') && document.body.style.overflow==='');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert(await detail.evaluate(e=>e===document.activeElement));
  await card.getByRole('button',{name:'Ampliar foto: Fachada del palacio'}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'Cerrar'}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]') && document.body.style.overflow==='');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  if(process.env.SMOKE_SCREENSHOT) await card.screenshot({path:process.env.SMOKE_SCREENSHOT});
  tour.places[0].description+=' Texto nuevo.';await page.reload();await card.waitFor();
  assert.equal(await card.locator('img').count(),0);assert.equal(await card.getByRole('button',{name:/Ver:/}).count(),0);
  tour.places[0].description=description;tour.places[0].metadata.tourImages.images=[image('detail',1,'shield')];
  await page.reload();await card.waitFor();assert.equal(await card.locator('img').count(),0);
  tour.places[0].metadata.tourImages.images=[image('primary',0,'broken')];
  await page.route('https://upload.wikimedia.org/broken.jpg',r=>r.abort());
  await page.reload();await card.getByText('Imagen no disponible').waitFor();
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.deepEqual(errors,[]);
  console.log('PASS mobile: limits, paragraph anchors, lazy detail, credits, modal, Escape/focus, stale text, broken image.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
