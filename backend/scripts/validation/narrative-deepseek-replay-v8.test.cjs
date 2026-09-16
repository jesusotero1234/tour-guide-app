const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, estimateCost, parseArgs, parseResponse, requestBody } = require('./narrative-deepseek-replay-v8.cjs');

const at = new Date('2026-09-10T04:01:00Z');
test('thinking requests use the supported auto tool choice and retain strict result parsing', () => {
  const c={phase:'curator',prompt:'Use evidence',input:{},schema:{type:'object'},toolName:'submit'};
  const config={model:'deepseek-flash',thinking:'enabled',maxTokens:6000};
  assert.equal(requestBody(c,config).tool_choice,'auto');
  assert.deepEqual(requestBody(c,{...config,thinking:'disabled'}).tool_choice,{type:'function',function:{name:'submit'}});
});

test('writer output gets an independent audit and auditor disagreements stay visible', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deepseek-audit-test-'));
  const oldKey=process.env.DEEPSEEK_API_KEY,oldExit=process.exitCode;
  const finding={sentenceId:'s1',classification:'supported',reason:'source',passageIds:['p1']};
  const audit={id:'one',phase:'auditor',prompt:'Audit evidence',input:{sentences:[{sentenceId:'s1',text:'Saved text'}]},
    schema:{type:'object'},toolName:'audit',baseline:{model:'historical'},validate:v=>v};
  const writer={id:'one',phase:'writer',prompt:'Write this stop',baseline:{model:'gpt-6-astra',billing:'ChatGPT quota',script:{text:'Saved text'}},
    validate:text=>({text,wordCount:2,delivery:{passed:true}}),audit:text=>({...audit,input:{text}})};
  let auth=0;
  const seen=[];
  const deps={now:()=>at,loadCases:()=>({cases:[writer,audit],sourceHashes:{},verifySources(){}}),
    checkAuth:async()=>{auth++;},
    audit:async config=>{seen.push(config.input);return {status:'valid',value:{findings:[{...finding,classification:'unsupported'}]}};},
    fetch:async(url,opts)=>{
      if(url.endsWith('/models'))return {ok:true,json:async()=>({data:[{id:'deepseek-v4.1-flash'}]})};
      const body=JSON.parse(opts.body);
      return {ok:true,json:async()=>({model:body.model,usage,choices:[body.tools
        ? {finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'audit',arguments:JSON.stringify({findings:[finding]})}}]}}
        : {finish_reason:'stop',message:{content:'Candidate text'}}]})};
    }};
  try {
    process.env.DEEPSEEK_API_KEY='local-test-key';
    const out=path.join(dir,'out');
    await main(['--source='+dir,'--prep='+dir,'--out-dir='+out,'--model=deepseek-v4.1-flash','--execute'],deps);
    const result=JSON.parse(fs.readFileSync(path.join(out,'results.private.json')));
    assert.equal(auth,1);assert.deepEqual(seen,[{text:'Candidate text'},audit.input]);
    assert.equal(result.rows[0].independentAudit.value.findings[0].classification,'unsupported');
    assert.equal(result.rows[1].disagreements.length,1);
    assert.equal(result.replacementApproved,false);
    assert.match(fs.readFileSync(path.join(out,'comparison.md'),'utf8'),/Candidate text/);
  } finally {
    process.exitCode=oldExit;
    if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

const usage = { prompt_tokens: 1000, prompt_cache_hit_tokens: 200, prompt_cache_miss_tokens: 800, completion_tokens: 100 };
test('announced pricing uses UTC windows, cache hits and inclusive reasoning output', () => {
  assert.ok(Math.abs(estimateCost(usage, at) - 0.0001806) < 1e-12);
  assert.ok(Math.abs(estimateCost(usage, new Date('2026-09-10T06:00:00Z')) - 0.0003612) < 1e-12);
  assert.equal(estimateCost(usage, new Date('2026-09-12T06:00:00Z')), estimateCost(usage, at));
  assert.equal(estimateCost(undefined, at), undefined);
  assert.throws(() => estimateCost({ ...usage, prompt_tokens: -1 }, at));
  assert.throws(() => estimateCost({ ...usage, prompt_cache_miss_tokens: 900 }, at));
  assert.throws(() => parseArgs(['--surprise']));
  assert.throws(() => parseResponse({model:'deepseek-test',choices:[{finish_reason:'length',message:{content:'cut'}}]}, {phase:'writer'}, {expectedModel:'deepseek-test'}));
  assert.throws(() => parseResponse({model:'deepseek-test',choices:[{finish_reason:'tool_calls',message:{tool_calls:[]}}]}, {phase:'auditor'}, {expectedModel:'deepseek-test'}));
});
test('offline preparation and paid failures never become successful comparisons', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-replay-test-'));
  const oldExit = process.exitCode;
  const c = { id:'one',phase:'core_audit',prompt:'Return a decision',input:{x:1},
    schema:{type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false},
    toolName:'submit',baseline:{model:'openai/gpt-5.4-mini'},
    validate: value => { assert.equal(value.ok, true); return value; } };
  let calls = 0;
  const deps = { now:()=>at, loadCases:()=>({cases:[c],sourceHashes:{},verifySources(){}}),
    fetch:async()=>{calls++;throw Error('Unexpected network');} };
  const args = out => ['--source='+dir,'--prep='+dir,'--out-dir='+path.join(dir,out),
    '--model=deepseek-v4.1-flash','--phase=preparation','--spend-limit-usd=1'];
  const oldKey = process.env.DEEPSEEK_API_KEY;
  try {
    await main(args('dry'),deps);
    assert.equal(calls,0);assert.equal(fs.existsSync(path.join(dir,'dry')),false);
    await assert.rejects(main([...args('early'),'--execute'],{...deps,now:()=>new Date('2026-09-09T23:00:00Z')}));
    assert.equal(calls,0);
    process.env.DEEPSEEK_API_KEY='local-test-key';
    const fetch = async (url, opts) => {
      calls++;
      if (url.endsWith('/models')) return {ok:true,json:async()=>({data:[{id:'deepseek-v4.1-flash'}]})};
      const body=JSON.parse(opts.body);
      assert.equal(body.model,'deepseek-v4.1-flash');
      return {ok:true,json:async()=>({model:'deepseek-v4.1-flash',usage,choices:[{
        finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'submit',arguments:'{"ok":true}'}}]}
      }]})};
    };
    await main([...args('good'),'--execute'],{...deps,fetch:async(url,opts)=>{
      const response=await fetch(url,opts);
      if(url.endsWith('/models'))return response;
      return {...response,json:async()=>{await new Promise(resolve=>setTimeout(resolve,20));return response.json();}};
    }});
    const good=JSON.parse(fs.readFileSync(path.join(dir,'good','results.private.json')));
    assert.equal(good.status,'complete_needs_review');
    assert.equal(good.publicationPassed,false);assert.equal(good.rows.length,1);
    assert.equal(good.rows[0].status,'valid');
    assert.ok(good.rows[0].latencyMs>=15,'Latency must include reading the complete response body');
    let missingCalls=0;
    await assert.rejects(main([...args('missing'),'--execute'],{...deps,fetch:async()=>{missingCalls++;return {ok:true,json:async()=>({data:[]})};}}));
    assert.equal(missingCalls,1);
    let blockedCalls=0;
    await main([...args('budget').filter(a=>!a.startsWith('--spend-limit-usd=')),'--spend-limit-usd=0.000001','--execute'],
      {...deps,fetch:async(url,opts)=>{blockedCalls++;return fetch(url,opts);}});
    const blocked=JSON.parse(fs.readFileSync(path.join(dir,'budget','results.private.json')));
    assert.equal(blockedCalls,1);assert.equal(blocked.status,'incomplete');assert.equal(blocked.rows[0].status,'failed');
    const mismatch = async (url, opts) => {
      const response=await fetch(url,opts);
      if(url.endsWith('/models'))return response;
      const body=await response.json();return {ok:true,json:async()=>({...body,model:'deepseek-v4-flash'})};
    };
    await main([...args('mismatch'),'--execute'],{...deps,fetch:mismatch});
    const failed=JSON.parse(fs.readFileSync(path.join(dir,'mismatch','results.private.json')));
    assert.equal(failed.status,'incomplete');assert.equal(failed.publicationPassed,false);
    assert.match(failed.error,/model/i);
    await main([...args('timeout'),'--execute'],{...deps,fetch:async(url,opts)=>{
      if(url.endsWith('/models'))return fetch(url,opts);throw Error('Request timed out');
    }});
    const timed=JSON.parse(fs.readFileSync(path.join(dir,'timeout','results.private.json')));
    assert.equal(timed.status,'incomplete');
    assert.ok(timed.budget.runUnverifiedExposureUsd>0);
  } finally {
    process.exitCode=oldExit;
    if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
