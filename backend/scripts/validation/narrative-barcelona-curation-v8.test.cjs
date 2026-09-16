const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {main,miniCost,better}=require('./narrative-barcelona-curation-v8.cjs');
const {narrationTargetForSecondsV8}=require('../../src/services/poi/NarrativeDurationTargetsV8');
const llm=require('../../src/services/poi/EditorialStructuredLlmV6');
test('frozen curation is offline by default, preserves failed-call exposure and never selects a worse repair',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'barcelona-curation-test-')),file=path.join(dir,'sources.json');
  const previousKey=process.env.DEEPSEEK_API_KEY,original=llm.requestEditorialStructuredV6;
  const content='La fachada del edificio tiene ventanas amplias y una puerta que da acceso al patio central.';
  const source={status:'complete',language:'es',stops:Array.from({length:6},(_,i)=>{
    const qid='Q'+(i+1),name='Edificio '+(i+1);
    return {qid,name,target:narrationTargetForSecondsV8(qid,300),identity:{labels:[name],aliases:[]},
      capture:{sourceId:'source-wiki-es',content,finalUrl:'https://es.wikipedia.org/wiki/Edificio',authority:{tier:'established_source',publisherKey:'wikimedia',rule:'test'}},
      contentSha256:crypto.createHash('sha256').update(content).digest('hex')};
  })};
  fs.writeFileSync(file,JSON.stringify(source));
  try{
    const dry=await main([file,path.join(dir,'dry'),'deepseek'],{fetch:()=>{throw Error('Unexpected network');}});
    assert.equal(dry.status,'dry_run');assert.equal(dry.calls.length,6);assert.equal(fs.existsSync(path.join(dir,'dry')),false);
    process.env.DEEPSEEK_API_KEY='test-secret';
    let posts=0;
    const failed=await main([file,path.join(dir,'failure'),'deepseek','--execute'],{fetch:async(url,options)=>{
      assert.equal(new URL(url).origin,'https://api.deepseek.com');
      if(url.endsWith('/models'))return {ok:true,json:async()=>({data:[{id:'deepseek-flash'}]})};
      posts++;const body=JSON.parse(options.body);
      assert.equal(body.thinking.type,'disabled');assert.equal(body.tool_choice.function.name,'curate_narrative_evidence');
      throw Error('transport failed test-secret');
    }});
    assert.equal(failed.status,'incomplete');assert.equal(posts,1);
    assert.ok(failed.budget.runUnverifiedExposureUsd>0);assert.equal(failed.budget.reservedUsd,0);
    assert.ok(!JSON.stringify(failed).includes('test-secret'));
    assert.equal(llm.requestEditorialStructuredV6,original);
    const previousMiniKey=process.env.OPENROUTER_API_KEY;
    let miniBody;
    try{
      process.env.OPENROUTER_API_KEY='test-mini-secret';
      const mini=await main([file,path.join(dir,'mini'),'mini','--execute'],{priorSpendUsd:0.06240375,fetch:async(url,options)=>{
        assert.equal(new URL(url).origin,'https://openrouter.ai');
        miniBody=JSON.parse(options.body);
        return {ok:true,json:async()=>({model:'openai/gpt-5.4-mini',usage:{cost:0.001},
          choices:[{finish_reason:'stop',message:{content:'{}'}}]})};
      }});
      assert.equal(miniBody.temperature,undefined);
      assert.equal(miniBody.thinking,undefined);
      assert.equal(miniBody.tools,undefined);
      assert.equal(miniBody.response_format.type,'json_schema');
      assert.equal(miniBody.response_format.json_schema.strict,true);
      assert.equal(miniBody.provider.allow_fallbacks,false);
      assert.equal(miniBody.reasoning.effort,'none');
      assert.equal(mini.status,'incomplete');
      assert.match(mini.error,/Schema failed/);
      assert.equal(mini.budget.historicalSpentUsd,0.06240375);
      assert.equal(mini.budget.runReportedCostUsd,0.001);
    }finally{
      if(previousMiniKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previousMiniKey;
    }
    assert.equal(miniCost({prompt_tokens:1000,completion_tokens:100,prompt_tokens_details:{cached_tokens:200}}),0.001065);
    assert.throws(()=>miniCost({cost:NaN}));assert.throws(()=>miniCost({prompt_tokens:1,completion_tokens:1,prompt_tokens_details:{cached_tokens:2}}));
    const round=(ready,count)=>({admission:{value:{gates:{minimumEvidenceReady:true,writerReady:ready,missingWriterRoles:ready?[]:['tension_or_contrast']},dossier:{propositions:Array(count).fill({})}}},richness:{richnessReady:ready},tier:'C'});
    assert.equal(better(round(false,16),round(true,10)),false);
    assert.equal(better(round(true,10),round(false,16)),true);
  }finally{
    if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
