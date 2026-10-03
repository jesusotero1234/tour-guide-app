// Render only the reviewed, complete Spanish master from the standard Spain text workflow.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const backend=path.resolve(__dirname,'../..'),root=path.dirname(backend),B=process.env.BATCH_STAGE||path.join(backend,'tmp/pilot-batch-europe-20260920');
require('dotenv').config({path:path.join(backend,'.env'),quiet:true});delete process.env.VOXCPM_PRESET_PATH;
const {parseTourBlueprintSnapshot}=require('../../src/services/TourBlueprint');
const {audioIdentity,audioDisclosure}=require('../../src/services/AudioProvenance');
const {runLocalVoxCpm}=require('../../src/services/LocalVoxCpmRenderer');
const {WalkingRouteService}=require('../../src/services/WalkingRouteService');
const {loadSpeech,spokenText}=require('./speech_stage.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const uuid=v=>{const h=hash(v);return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
function freeze(f,v){if(fs.existsSync(f))assert.deepEqual(read(f),v,'Frozen artifact changed: '+f);else{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});}}
function save(f,v){fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2)+'\n',{mode:0o600});fs.renameSync(f+'.tmp',f);}
async function assemble(slug){const python=path.join(root,'pods/voxcpm-pod/.venv/bin/python');await new Promise((resolve,reject)=>{const child=spawn(python,[path.join(__dirname,'europe_assemble.py'),slug],{cwd:backend,stdio:'inherit',env:{...process.env,BATCH_STAGE:B}});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Assembly failed: '+code)));});}
async function main(){
 const slug=process.argv[2],manifest=read(path.join(B,'manifest.json')),city=manifest.cities.find(c=>c.slug===slug);assert(city,'Known city required');
 const d=path.join(B,slug),artifact=read(path.join(d,'final/es.json')),inputs=read(path.join(d,'inputs.json')),snapshot=parseTourBlueprintSnapshot(inputs.snapshot);
 const resume=process.argv.includes('--resume');
 if(resume){const locked=read(path.join(d,'text-inputs-lock.json'));assert.equal(hash(JSON.stringify(ordered(inputs))),locked.inputsSha256,'Source inputs changed before resume');assert.equal(hash(fs.readFileSync(path.join(d,'combined-prompt.md'))),locked.promptSha256,'Source prompt changed before resume');}
 assert.equal(snapshot.destination.qid,city.qid);assert.equal(snapshot.destination.countryCode,city.countryCode);assert.equal(snapshot.checkpoint.route.durationMinutes,120);
 assert.equal(artifact.language,'es');assert.equal(artifact.review.status,'SUFFICIENT_IN_REVIEW_SCOPE');assert.equal(artifact.review.humanApproved,false);
 assert.equal(artifact.masterSha256,hash(JSON.stringify(ordered(artifact.pieces))),'Spanish master changed');
 const reviewBytes=fs.readFileSync(artifact.review.artifactPath);assert.equal(hash(reviewBytes),artifact.review.artifactSha256,'Review evidence changed');assert.equal(JSON.parse(reviewBytes).status,'SUFFICIENT_IN_REVIEW_SCOPE');
 const stops=snapshot.checkpoint.route.stops;assert.deepEqual(artifact.pieces.map(p=>p.pieceId),['tour-welcome',...stops.map(s=>s.stopId)]);
 const speech=loadSpeech(d,'es');
 const scope=snapshot.routePlanning?.scope;
 const master={title:city.city+': recorrido histórico'+(scope?' · '+scope:' general'),...(scope?{scope}:{}),city:city.city,country:city.country,language:'es',requestedMinutes:120,estimatedGuidedMinutes:snapshot.geometry.guidedDurationMinutes,durationFit:snapshot.geometry.durationFit,
  editorialStatus:'standard_workflow_reviewed_user_review_pending',sourceMasterSha256:artifact.masterSha256,blueprintFingerprint:snapshot.fingerprint,
  pieces:artifact.pieces.map((p,i)=>{const s=stops[i-1],text=i===0?audioDisclosure('es')+'\n\n'+p.text:p.text;assert(text.trim());const spoken=spokenText(speech,p.pieceId,i,audioDisclosure('es'));return {id:p.pieceId,name:i===0?'Bienvenida':p.name,text,...(spoken?{spokenText:spoken}:{}),audioId:uuid(manifest.runId+'|'+slug+'|'+p.pieceId+'|'+(spoken??text)),...(s?{coordinates:{latitude:s.coordinates.lat,longitude:s.coordinates.lng},qid:s.wikidataId,sources:inputs.materials[i-1].sourceUrls}:{}),review:artifact.review};})};
 const presetFile=path.join(root,'pods/voxcpm-pod/presets/guide-es-a.json'),preset=read(presetFile),identity=audioIdentity(fs.readFileSync(presetFile),fs.readFileSync(path.resolve(path.dirname(presetFile),preset.reference)));
 const input={language:'es',identity,...(speech?{speechVersion:speech.version}:{}),stops:master.pieces.map(p=>({id:p.audioId,text:p.text,...(p.spokenText?{spokenText:p.spokenText}:{})}))};
 freeze(path.join(d,'master.json'),master);freeze(path.join(d,'audio-input.json'),input);freeze(path.join(d,'frozen.json'),{masterSha256:hash(fs.readFileSync(path.join(d,'master.json'))),inputSha256:hash(fs.readFileSync(path.join(d,'audio-input.json')))});
 fs.writeFileSync(path.join(d,'script.txt'),master.title+'\n\n'+master.pieces.map(p=>p.name+'\n\n'+p.text).join('\n\n'));
 fs.writeFileSync(path.join(d,'sources.md'),'# Fuentes y créditos\n\nGuion de DeepSeek con revisión del flujo habitual. Revisión del usuario pendiente.\n\n'+inputs.materials.map(m=>'## '+m.name+'\n\n'+m.sourceUrls.map(s=>'- ['+s.title+']('+s.url+')').join('\n')).join('\n\n')+'\n');
 const routeFile=path.join(d,'walking-route.json');
 if(!fs.existsSync(routeFile))try{save(routeFile,await new WalkingRouteService().getRoute(stops.map(s=>({latitude:s.coordinates.lat,longitude:s.coordinates.lng}))));}catch(e){save(path.join(d,'route-error.json'),{error:e.message});}
 if(process.argv.includes('--prepare-only')){console.log(JSON.stringify({city:slug,chapters:master.pieces.length,requestedMinutes:120,estimatedGuidedMinutes:master.estimatedGuidedMinutes}));return;}
 if(!fs.existsSync(path.join(d,'listening-result.json'))){const progress=path.join(d,'tts-job/progress.json');if(!fs.existsSync(progress)||read(progress).phase!=='rendered'){assert(!fs.existsSync(progress)||resume,'Partial render requires --resume; clips retained');await runLocalVoxCpm(input,path.join(d,'tts-job'),path.join(d,'audio'),{resume});}}
 await assemble(slug);console.log(JSON.stringify({city:slug,phase:'completed',durationSeconds:read(path.join(d,'listening-result.json')).durationSeconds}));
}
main().catch(e=>{console.error(e.message);
 const slug=process.argv[2];
 if(/^[a-z-]+$/.test(slug??'')) save(path.join(B,slug,'audio-result.json'),{stage:'audio',status:'failed',type:'audio_render_failed',message:e.message});
 process.exitCode=1;
});
