// Requires a production build; CADDY_BIN points to a local Caddy executable.
// Uses loopback-only temporary servers, fake credentials and a mock backend; no real database/provider calls.
const assert = require('node:assert/strict');
const { createServer, request: httpRequest } = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { once } = require('node:events');
const frontend = resolve(__dirname,'..'), root = resolve(frontend,'..');
async function port() { const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p; }
(async()=>{
  if(!process.env.CADDY_BIN) throw Error('Set CADDY_BIN to a verified Caddy executable');
  const directory=await mkdtemp(join(tmpdir(),'pilot-access-')), children=[];
  const seen=[], apiKey='test-pilot-api-key-at-least-32-characters', proxyToken='test-proxy-token-at-least-32-characters';
  const backend=createServer((req,res)=>{seen.push({url:req.url,key:req.headers['x-api-key'],method:req.method});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:{tours:[],total:0}}));});
  const launch=(bin,args,env)=>{const child=spawn(bin,args,{cwd:frontend,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});children.push(child);let output='';child.stdout.on('data',b=>{output=(output+b).slice(-2000)});child.stderr.on('data',b=>{output=(output+b).slice(-2000)});child.failure=()=>output;return child;};
  async function wait(url,child,headers={}) { for(let i=0;i<120;i++){if(child.exitCode!==null) throw Error(child.failure());try {const r=await fetch(url,{headers});if(r.status<500)return;}catch{}await delay(250);}throw Error('Server did not start: '+child.failure()); }
  try {
    backend.listen(0,'127.0.0.1');await once(backend,'listening');
    const originPort=await port(), entryPort=await port();
    const origin='http://127.0.0.1:'+originPort, entry='http://127.0.0.1:'+entryPort;
    const next=launch(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(originPort)],{
      NODE_ENV:'production',PILOT_MODE:'true',PILOT_API_KEY:apiKey,PILOT_PROXY_TOKEN:proxyToken,
      API_URL:'http://127.0.0.1:'+backend.address().port+'/api',API_KEY:'STAFF-KEY-MUST-NOT-BE-USED',
      ENABLE_NARRATIVE_PILOT:'true',ENABLE_EDITORIAL_PREVIEW:'true',PILOT_NOTICE_FILE:join(directory,'missing.json')
    });
    await wait(origin+'/about',next);
    const hash=execFileSync(process.env.CADDY_BIN,['hash-password','--plaintext','test-invitation-password'],{encoding:'utf8'}).trim();
    const template=await readFile(join(root,'deployment/pilot/Caddyfile'),'utf8');
    const config='{\n admin off\n}\n'+template.replace('127.0.0.1:3000','127.0.0.1:'+originPort);
    const configPath=join(directory,'Caddyfile');await writeFile(configPath,config);
    const caddyEnv={PILOT_HOST:entry,PILOT_USER:'tester',PILOT_PASSWORD_HASH:hash,PILOT_PROXY_TOKEN:proxyToken};
    execFileSync(process.env.CADDY_BIN,['validate','--config',configPath,'--adapter','caddyfile'],{env:{...process.env,...caddyEnv},stdio:'pipe'});
    const caddy=launch(process.env.CADDY_BIN,['run','--config',configPath,'--adapter','caddyfile'],caddyEnv);
    await wait(entry+'/about',caddy);
    const auth={Authorization:'Basic '+Buffer.from('tester:test-invitation-password').toString('base64')};
    const publicRedirect = await new Promise((resolve,reject) => {
      const req = httpRequest(origin+'/', {headers:{Host:'nomuvia.example','X-Pilot-Proxy-Token':proxyToken}}, response => { response.resume(); resolve(response.headers.location); });
      req.on('error',reject); req.end();
    });
    assert.equal(publicRedirect,'http://nomuvia.example/tours','Public host must not inherit the internal port');
    for (const path of ['/', '/passes', '/passes/example']) {
      const response = await fetch(entry + path, {headers:auth, redirect:'manual'});
      assert.equal(response.status,307);
      assert.equal(new URL(response.headers.get('location'),entry).href,entry+'/tours','Redirect must stay on the public origin');
    }
    for(const path of ['/about','/tours','/api/backend/tours','/api/backend/tours/11111111-1111-4111-8111-111111111111/audio/22222222-2222-4222-8222-222222222222']) {
      assert.equal((await fetch(entry+path)).status,401);
      assert.equal((await fetch(entry+path,{headers:{'X-Pilot-Proxy-Token':proxyToken,'X-Middleware-Subrequest':'middleware:middleware:middleware:middleware:middleware',Range:'bytes=0-3'}})).status,401);
      assert.equal((await fetch(origin+path)).status,401);
    }
    assert.equal((await fetch(entry+'/about',{headers:auth})).status,200);
    assert.equal((await fetch(entry+'/api/backend/tours',{headers:{...auth,'X-API-Key':'attacker','X-Pilot-Proxy-Token':'attacker'}})).status,200);
    assert.equal(seen.length,1);assert.equal(seen[0].key,apiKey);assert.equal(seen[0].url,'/api/v1/pilot/tours');
    for(const [path,method] of [['/api/backend/generation-jobs','POST'],['/api/backend/tours/generate','POST'],['/api/backend/tours/11111111-1111-4111-8111-111111111111/audio','POST'],['/api/geocoding/cities?q=Sevilla','GET'],['/api/audio/legacy.wav','GET'],['/dev/tour-preview','GET'],['/pilot/madrid-history','GET']]) {
      const res=await fetch(entry+path,{method,headers:{...auth,'X-Middleware-Subrequest':'middleware:middleware:middleware:middleware:middleware'}});
      assert.ok([403,404,405].includes(res.status),path+': '+res.status);
    }
    assert.equal(seen.length,1,'Blocked operations must not reach backend');
    console.log('PASS: Caddy invitation, spoofed headers, private Next origin, participant key, legacy routes and read-only proxy. Local HTTP test; live HTTPS/domain remains deployment verification.');
  } finally {
    for(const child of children.reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),delay(3000)]);if(child.exitCode===null)child.kill('SIGKILL');}}
    await new Promise(r=>backend.close(r));await rm(directory,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
