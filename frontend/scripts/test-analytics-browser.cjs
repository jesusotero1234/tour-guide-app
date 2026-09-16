// Run against a frontend with UMAMI_SCRIPT_URL=https://stats.example.org/script.js
// and UMAMI_WEBSITE_ID=12345678-1234-4234-8234-123456789abc. All APIs are intercepted.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(),events=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let failRating=true;
  await context.route('https://stats.example.org/script.js',r=>r.fulfill({contentType:'application/javascript',body:'window.umami={track:async()=>{},getSession:()=>({})};'}));
  await context.route('https://stats.example.org/api/send',r=>{
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-umami-website-id,x-umami-hostname,x-umami-cache','access-control-allow-methods':'POST,OPTIONS'};
   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
   const data=r.request().postDataJSON();events.push(data.payload);
   return r.fulfill({status:failRating&&data.payload.name==='tour_rating'?500:200,headers,contentType:'application/json',body:JSON.stringify({cache:'test'})});
  });
  const tour={id:'analytics-test',city:'Sevilla',country:'España',language:'es',status:'review',places:[{id:'stop-one',name:'Giralda',description:'La historia de este lugar.',position:1,latitude:37.38,longitude:-5.99}]};
  await context.route('**/api/backend/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().endsWith('/audio')?{status:'unavailable',audioUrls:{},supported:false}:tour)}));
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:3102')+'/tours/analytics-test');
  await page.waitForFunction(()=>!!window.umami);
  await page.locator('.safety-start').click();
  await page.getByText('Valorar este tour',{exact:true}).click();
  await page.getByRole('radio',{name:'5',exact:true}).check();
  await page.getByLabel('Comentario (opcional)').fill('Me gustó la narración.');
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Algo salió mal'}).waitFor();
  assert.equal(await page.getByText('Gracias por tu comentario.').count(),0);
  await page.screenshot({path:'/tmp/tour-analytics-feedback.png',fullPage:true});
  failRating=false;
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await page.getByText('Gracias por tu comentario.',{exact:true}).waitFor();
  assert.ok(events.some(e=>e.name==='tour_started'&&e.data.tour_id==='analytics-test'));
  assert.ok(events.some(e=>e.name==='stop_viewed'&&e.data.place_id==='stop-one'));
  const rating=events.filter(e=>e.name==='tour_rating');
  assert.equal(rating.length,2);assert.equal(rating[1].data.rating,5);
  assert.equal(rating[1].data.comment,'Me gustó la narración.');
  assert.equal(await page.getByRole('button',{name:'Enviar',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: start, stop view, rating error/retry/acknowledgement, no duplicate success.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
