// Controlled two-round curation on frozen sources. No discovery or production changes.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv = require('ajv');
const llm = require('../../src/services/poi/EditorialStructuredLlmV6');
const { curatorServiceV8 } = require('./narrative-user-canary-v8');
const { buildCuratorPacketV8 } = require('../../src/services/poi/NarrativeResearchV8');
const { segmentCaptureIntoSpansV7 } = require('../../src/services/poi/NarrativeSpansV7');
const { normalizeNarrativeCuratorOutputV8, buildValidatedDossierV8, classifyEvidenceTierV8 } = require('../../src/services/poi/NarrativeDossierV8');
const { evaluateNarrativeRichnessV8 } = require('../../src/services/poi/NarrativeRichnessV8');
const { NarrativeSpendLedgerV6 } = require('../../src/services/poi/NarrativeSpendLedgerV6');
const { requestBody, parseResponse, estimateCost } = require('./narrative-deepseek-replay-v8.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const empty = () => ({ propositions: [], authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [] });
function miniCost(usage) {
  if (!usage) return undefined;
  if (usage.cost !== undefined) {
    if (!Number.isFinite(usage.cost) || usage.cost < 0) throw Error('Invalid Mini cost');
    return usage.cost;
  }
  const input=usage.prompt_tokens, output=usage.completion_tokens, cached=usage.prompt_tokens_details?.cached_tokens ?? 0;
  if (input === undefined || output === undefined) return undefined;
  if (![input,output,cached].every(n => Number.isSafeInteger(n) && n>=0) || cached>input) throw Error('Invalid Mini usage');
  return ((input-cached)*0.75+cached*0.075+output*4.5)/1e6;
}
function rank(round) {
  const v=round?.admission?.value;
  return v ? [Number(v.gates.minimumEvidenceReady),Number(v.gates.writerReady),Number(round.richness.richnessReady),
    v.dossier.propositions.length,-v.gates.missingWriterRoles.length,{D:0,C:1,B:2,A:3}[round.tier]]
    : [-1,-1,-1,-1,-1,-1];
}
function better(candidate,current) {
  const a=rank(candidate),b=rank(current);
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]>b[i];
  return false;
}
async function main(argv=process.argv.slice(2),deps={}) {
  const [sourceArg,outArg,provider,...flags]=argv;
  if(!sourceArg || !outArg || !['deepseek','mini'].includes(provider) || flags.some(f=>f!=='--execute') || flags.length>1)
    throw Error('Usage: sources.json NEW_OUTPUT_DIRECTORY deepseek|mini [--execute]');
  const execute=flags.includes('--execute'), sourcePath=path.resolve(sourceArg),out=path.resolve(outArg);
  const rawSource=fs.readFileSync(sourcePath), sourceHash=hash(rawSource), source=JSON.parse(rawSource);
  if(source.status!=='complete' || source.stops?.length!==6 || new Set(source.stops.map(s=>s.qid)).size!==6)
    throw Error('Expected six complete unique source stops');
  for(const s of source.stops) {
    if(!/^Q\d+$/.test(s.qid) || hash(s.capture.content)!==s.contentSha256 || !s.identity || !s.target)
      throw Error('Invalid or changed source stop');
  }
  if(execute && fs.existsSync(out)) throw Error('Output directory must be new');
  const model=provider==='deepseek'?'deepseek-flash':'openai/gpt-5.4-mini';
  const api=provider==='deepseek'?'https://api.deepseek.com':'https://openrouter.ai/api/v1';
  const key=process.env[provider==='deepseek'?'DEEPSEEK_API_KEY':'OPENROUTER_API_KEY'];
  const redact=value=>String(value?.message??value).split(key||'__NO_KEY__').join('[redacted]');
  const fetcher=deps.fetch??fetch, headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
  if(execute && !key) throw Error('Missing '+provider+' API key');
  if(execute && provider==='deepseek') {
    const res=await fetcher(api+'/models',{headers,signal:AbortSignal.timeout(15000)});
    if(!res.ok || !(await res.json()).data?.some(m=>m.id===model)) throw Error('DeepSeek model unavailable');
  }
  if(execute) fs.mkdirSync(out,{recursive:true,mode:0o700});
  const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
  const ledger=execute?new NarrativeSpendLedgerV6({limitUsd:1,historicalSpendUsd:deps.priorSpendUsd??0,path:path.join(out,'spend.private.jsonl')}):null;
  const result={status:execute?'running':'dry_run',scope:'frozen-source-two-round-curation',provider,model,
    sourcePath,sourceHash,publicationPassed:false,replacementApproved:false,rows:[],calls:[],budget:null};
  const persist=()=>{if(execute){result.budget=ledger.snapshot();save('results.private.json',result);}};
  const original=llm.requestEditorialStructuredV6;
  llm.requestEditorialStructuredV6=async config=>{
    if(JSON.stringify(config.input).length>config.inputCharacterLimit || JSON.stringify(config.schema).length>config.schemaCharacterLimit)
      throw Error('Existing curator request size limit exceeded');
    if(!execute) { result.calls.push({stopId:config.input.stopId,inputCharacters:JSON.stringify(config.input).length});return {status:'valid',value:empty()}; }
    const c={phase:'curator',prompt:config.systemPrompt,input:config.input,schema:config.schema,toolName:config.toolName};
    const settings={model,expectedModel:model,thinking:'disabled',maxTokens:6000};
    const body=requestBody(c,settings);
    if(provider==='mini'){
      delete body.thinking;delete body.temperature;delete body.tools;delete body.tool_choice;
      body.reasoning={effort:'none'};
      body.provider={require_parameters:true,allow_fallbacks:false,data_collection:'deny'};
      body.response_format={type:'json_schema',json_schema:{name:config.toolName,strict:true,schema:config.schema}};
    }
    const prefix=String(result.calls.length+1).padStart(2,'0');
    const call={stopId:config.input.stopId,status:'running',input:config.input,prompt:config.systemPrompt,schema:config.schema,
      toolName:config.toolName,requestFingerprint:hash(JSON.stringify(c))};
    result.calls.push(call);save(prefix+'-request.private.json',body);persist();
    const started=Date.now();let reservation=null;
    try{
      reservation=ledger.reserve((Buffer.byteLength(JSON.stringify(body))+4096)*(provider==='mini'?1.5:0.3)/1e6+6000*(provider==='mini'?9:1.2)/1e6);
      const res=await fetcher(api+'/chat/completions',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
      if(!res.ok){const detail=redact(await res.text());save(prefix+'-error.private.json',{status:res.status,detail});throw Error('HTTP '+res.status+': '+detail.slice(0,500));}
      const data=await res.json();call.latencyMs=Date.now()-started;save(prefix+'-response.private.json',data);
      call.actualModel=data.model;call.usage=data.usage;
      call.costUsd=provider==='deepseek'?estimateCost(data.usage,Number.isFinite(data.created)?new Date(data.created*1000):new Date()):miniCost(data.usage);
      ledger.settle(reservation,call.costUsd);reservation=null;
      if(call.costUsd===undefined) throw Error('Missing usage; reserved maximum retained');
      if(provider==='mini' && ![model,'openai/gpt-5.4-mini-20260317'].includes(data.model)) throw Error('Mini model mismatch');
      let raw;
      if(provider==='mini'){
        if(data.choices?.length!==1 || data.choices[0].finish_reason!=='stop' || typeof data.choices[0].message?.content!=='string')
          throw Error('Incomplete Mini structured response');
        raw=JSON.parse(data.choices[0].message.content);
      }else raw=parseResponse(data,c,settings);
      const check=new Ajv({strict:true,validateFormats:false}).compile(config.schema);
      if(!check(raw)) throw Error('Schema failed: '+JSON.stringify(check.errors));
      const value=config.validate(raw);
      call.status='valid';call.rawOutput=raw;
      return {status:'valid',value};
    }catch(error){call.status='failed';call.error=redact(error);if(reservation)ledger.settle(reservation);throw error;}
    finally{call.latencyMs??=Date.now()-started;persist();}
  };
  try{
    const curate=await curatorServiceV8({apiKey:'captured-by-test',openRouterApiKey:'captured-by-test',profile:'deepseek_control',runId:'barcelona-frozen',maxTokens:6000});
    for(const stop of source.stops){
      const captures=[stop.capture],spansBySource=new Map(captures.map(c=>[c.sourceId,segmentCaptureIntoSpansV7(c).spans]));
      const authorizedIdentityNames=[...new Set([...stop.identity.labels,...stop.identity.aliases])];
      const row={stopId:stop.qid,name:stop.name,target:stop.target,rounds:[],finalRound:null};result.rows.push(row);
      let selected=null,priorities=[];
      for(let number=1;number<=(execute?2:1);number++){
        const packet=buildCuratorPacketV8({stopId:stop.qid,stopName:stop.name,language:source.language,captures,spansBySource,
          aliases:stop.identity.aliases,priorityRoles:priorities,narrationTarget:stop.target});
        const output=await curate(packet);
        if(!execute)break;
        const normalized=normalizeNarrativeCuratorOutputV8({output,captures,spansBySource,authorizedIdentityNames});
        const admission=buildValidatedDossierV8({stopId:stop.qid,stopName:stop.name,qid:stop.qid,language:source.language,
          curatorOutput:normalized.output,admissionMode:'independent',captures,spansBySource,authorizedIdentityNames});
        const v=admission.value;
        const round={number,packet,rawOutput:output,normalization:normalized.report,admission,
          richness:v?evaluateNarrativeRichnessV8(v.dossier,stop.target,{writerReady:v.gates.writerReady}):null,
          tier:v?classifyEvidenceTierV8(v.dossier,v.gates,captures):'D'};
        row.rounds.push(round);if(!selected||better(round,selected))selected=round;
        row.finalRound=selected.number;persist();
        console.log(JSON.stringify({provider,stop:stop.name,round:number,admitted:v?.dossier.propositions.length??0,
          writerReady:v?.gates.writerReady??false,richnessReady:round.richness?.richnessReady??false}));
        const best=selected.admission.value;
        if(best?.gates.writerReady && selected.richness.richnessReady)break;
        priorities=[...(best?.gates.missingWriterRoles??[])];
        const visual=best?.dossier.propositions.filter(p=>['visible_observation','distinctive_trait'].includes(p.role)).length??0;
        if(visual<stop.target.minVisualAnchors)priorities=[...new Set([...priorities,'visible_observation','distinctive_trait'])];
      }
    }
    if(hash(fs.readFileSync(sourcePath))!==sourceHash)throw Error('Source file changed during execution');
    if(execute){ledger.assertSettled();result.status='complete_needs_review';}
  }catch(error){result.status='incomplete';result.error=redact(error);}
  finally{llm.requestEditorialStructuredV6=original;persist();}
  console.log(JSON.stringify({status:result.status,provider,rows:result.rows.length,calls:result.calls.length,budget:result.budget}));
  return result;
}
module.exports={main,miniCost,rank,better};
if(require.main===module)main().then(r=>{if(r.status==='incomplete')process.exitCode=1;}).catch(error=>{
  console.error(String(error.message).split(process.env.DEEPSEEK_API_KEY||'__NO_KEY__').join('[redacted]')
    .split(process.env.OPENROUTER_API_KEY||'__NO_KEY__').join('[redacted]'));process.exitCode=1;
});
