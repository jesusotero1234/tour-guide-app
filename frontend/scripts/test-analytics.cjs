// Run with Node 22: node frontend/scripts/test-analytics.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const requests = [];
let now = 0, status = 200, body = {cache:'ok'}, disabled = null, configured = true;
const window = new EventTarget();
const document = new EventTarget();
document.visibilityState = 'visible';
document.title = 'Tour';
document.getElementById = () => configured ? {getAttribute: key => key === 'src' ? 'https://stats.example.org/script.js' : '12345678-1234-4234-8234-123456789abc'} : null;
const navigator = {doNotTrack: null, language:'es'};
const context = {exports:{}, window, document, navigator, location:{hostname:'tours.example.org',pathname:'/tours/test',search:'?token=secret'}, screen:{width:390,height:844},
  localStorage:{getItem:()=>disabled}, performance:{now:()=>now}, URL, AbortController, setTimeout, clearTimeout,
  fetch:async (url, options)=>{requests.push({url:String(url),options,payload:JSON.parse(options.body).payload}); return {ok:status===200,json:async()=>body};}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/analytics.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const {trackEvent,attachAudioAnalytics}=context.exports;
const emit=(target,event)=>target.dispatchEvent(new Event(event));
(async()=>{
  configured=false; assert.equal(await trackEvent('test'),false); assert.equal(requests.length,0);
  configured=true; navigator.doNotTrack='1'; assert.equal(await trackEvent('test'),false); assert.equal(requests.length,0);
  navigator.doNotTrack=null; disabled='yes'; assert.equal(await trackEvent('test'),false); assert.equal(requests.length,0); disabled=null;
  assert.equal(await trackEvent('tour_rating',{rating:5}),true);
  assert.equal(requests[0].url,'https://stats.example.org/api/send');
  assert.equal(requests[0].payload.url,'/tours/test');
  assert.equal(requests[0].options.credentials,'omit');
  assert.ok(!requests[0].options.body.includes('secret'));
  status=500; assert.equal(await trackEvent('tour_rating'),false); status=200;
  body={beep:'boop'}; assert.equal(await trackEvent('tour_rating'),false); body={cache:'ok'};
  const audio=Object.assign(new EventTarget(),{currentTime:0,playbackRate:1,paused:false,ended:false,readyState:4,seeking:false});
  requests.length=0;
  const detach=attachAudioAnalytics(audio,{tour_id:'test',place_id:'one'});
  const step=(seconds,media=seconds)=>{now+=seconds*1000;audio.currentTime+=media;emit(audio,'timeupdate');};
  const listened=()=>requests.filter(x=>x.payload.name==='audio_listening').reduce((sum,x)=>sum+x.payload.data.seconds,0);
  emit(audio,'playing'); step(3); audio.paused=true;emit(audio,'pause');assert.equal(listened(),3,'short pause flush');
  step(20,0);audio.paused=false;emit(audio,'playing');step(2);
  audio.currentTime=100;audio.seeking=true;emit(audio,'seeking');step(10,0);audio.seeking=false;emit(audio,'seeked');step(2);
  emit(audio,'waiting');assert.equal(listened(),7,'seek does not count');step(10,0);
  emit(audio,'playing');step(2);document.visibilityState='hidden';emit(document,'visibilitychange');step(3);emit(audio,'pause');assert.equal(listened(),12,'background audio counts');
  emit(audio,'playing');emit(audio,'stalled');step(2);audio.ended=true;emit(audio,'ended');assert.equal(listened(),14,'buffered playback after stalled counts');
  audio.ended=false;audio.currentTime=0;emit(audio,'playing');step(2);detach();detach();assert.equal(listened(),16,'replay and idempotent cleanup');
  step(5);assert.equal(listened(),16,'cleanup removes listeners');
  assert.equal(requests.filter(x=>x.payload.name==='audio_started').length,1);
  console.log('Analytics checks passed: delivery, disabled tracking, short sessions, pauses, seeks, stalls, background, replay, cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
