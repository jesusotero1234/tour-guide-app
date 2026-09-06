/* Experimental Mini/Nano preparation comparison; never invokes writer/auditor. */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv');
const llm = require('../../src/services/poi/EditorialStructuredLlmV6');
const { curatorServiceV8 } = require('./narrative-user-canary-v8');
const { buildCuratorPacketV8 } = require('../../src/services/poi/NarrativeResearchV8');
const { segmentCaptureIntoSpansV7 } = require('../../src/services/poi/NarrativeSpansV7');
const { normalizeNarrativeCuratorOutputV8, buildValidatedDossierV8 } = require('../../src/services/poi/NarrativeDossierV8');
const { buildNarrativeEvidenceBoundaryV8 } = require('../../src/services/poi/NarrativeEvidenceBoundaryV8');
const { createNarrativeArcArchitectV8 } = require('../../src/services/poi/NarrativeArcArchitectV8');
const core = require('../../src/services/poi/EditorialCoreResolverV6');
const { NarrativeProgressSpendGuardV6 } = require('../../src/services/poi/NarrativeProgressSpendGuardV6');
const MINI = 'openai/gpt-5.4-mini', NANO = 'openai/gpt-5.4-nano';
const realRequest = llm.requestEditorialStructuredV6;

async function captureRequest(invoke) {
  let config;
  const sentinel = new Error('capture-only');
  llm.requestEditorialStructuredV6 = async value => { config = value; throw sentinel; };
  try { await invoke(); } catch (error) { if (error !== sentinel) throw error; }
  finally { llm.requestEditorialStructuredV6 = realRequest; }
  if (!config) throw new Error('No request captured');
  return config;
}
async function main(args = process.argv.slice(2)) {
  const allowed = ['--source', '--out-dir', '--prior-spend-usd', '--spend-limit-usd'];
  for (const arg of args) if (arg !== '--execute' && !allowed.some(k => arg.startsWith(k + '='))) throw Error('Unknown argument');
  if (args.filter(a => a === '--execute').length > 1) throw Error('Duplicate execute');
  const get = key => { const a = args.filter(v => v.startsWith(key + '=')); if (a.length !== 1 || !a[0].slice(key.length + 1).trim()) throw Error('Required unique ' + key); return a[0].slice(key.length + 1); };
  const source = path.resolve(get('--source')), out = path.resolve(get('--out-dir'));
  const prior = Number(get('--prior-spend-usd')), limit = Number(get('--spend-limit-usd'));
  if (!Number.isFinite(prior) || prior < 0 || !Number.isFinite(limit) || limit <= prior) throw Error('Invalid budget');
  if (fs.existsSync(out)) throw Error('Output already exists');
  const read = f => JSON.parse(fs.readFileSync(path.join(source, f), 'utf8'));
  const checkpoint = read('checkpoint.private.json'), savedCore = read('core.private.json').resolution;
  const hashes = Object.fromEntries(['checkpoint.private.json','core.private.json'].map(f => [path.join(source,f), crypto.createHash('sha256').update(fs.readFileSync(path.join(source,f))).digest('hex')]));
  const cases = [];
  for (const saved of savedCore.runs) {
    const input = saved.input;
    let prompt = core.CORE_RESOLVER_SYSTEM_PROMPT_V6;
    if (input.candidates.some(c => c.signals.wikivoyageSee === null)) prompt += '\nA null wikivoyageSee signal means the city guide is unavailable because its page does not exist. It is unknown, not a negative signal of historical or visitor importance. Use the remaining supplied signals and candidate-owned support; never invent a Wikivoyage mention or citation.';
    const schema = core.coreAuditOpenRouterResponseSchemaV6(input);
    const toolName = 'submit_canonical_core_audit_v6';
    if (llm.editorialPromptFingerprintV6(prompt, toolName, schema) !== saved.promptFingerprint) throw Error('Historical core prompt mismatch');
    cases.push({ id: input.candidatePermutationSeed, phase: 'core_audit', models: [NANO], baseline: saved,
      config: { input, systemPrompt: prompt, schema, toolName, toolDescription: 'Classify every supplied canonical candidate exactly once as required or optional.',
        inputCharacterLimit: core.CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6, schemaCharacterLimit: core.CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6,
        validate: v => core.validateCoreAuditOpenRouterV6(v, input) } });
  }
  const curate = await curatorServiceV8({ apiKey: '', openRouterApiKey: '', profile: 'qwen38_hybrid', runId: 'prep-ab-capture' });
  for (const handoff of checkpoint.research) {
    const stop = checkpoint.route.stops.find(s => s.stopId === handoff.routeStopId);
    const captures = handoff.result.captures;
    const spansBySource = new Map(captures.map(c => [c.sourceId, segmentCaptureIntoSpansV7(c).spans]));
    const identityNames = [...new Set([stop.name, ...captures.map(c => c.title).filter(Boolean)])];
    const packet = buildCuratorPacketV8({ stopId: stop.stopId, stopName: stop.name, language: checkpoint.route.language,
      captures, spansBySource, aliases: [], priorityRoles: [], narrationTarget: checkpoint.narrationTargets.find(t => t.stopId === stop.stopId) });
    if (!packet.spans.length || captures.some(c => c.sourceKind === 'historical_corpus')) throw Error('Unsupported empty/historical fixture');
    const config = await captureRequest(() => curate(packet));
    cases.push({ id: stop.stopId, phase: 'curator', models: [MINI,NANO], config, packet, baseline: handoff.result.dossier,
      evaluate(output) {
        const normalized = normalizeNarrativeCuratorOutputV8({ output, captures, spansBySource, authorizedIdentityNames: identityNames });
        const admission = buildValidatedDossierV8({ stopId: stop.stopId, stopName: stop.name, qid: handoff.entityQid,
          language: checkpoint.route.language, curatorOutput: normalized.output, admissionMode: 'independent',
          captures, spansBySource, authorizedIdentityNames: identityNames });
        return { normalization: normalized.report, admission,
          rawCount: output.propositions.length, target: packet.narrationTarget };
      } });
  }
  const boundary = buildNarrativeEvidenceBoundaryV8(checkpoint.route, checkpoint.research);
  if (!boundary.admittedStops) throw Error('Saved research boundary failed');
  const architect = createNarrativeArcArchitectV8({ profile: 'qwen38_hybrid', runId: 'prep-ab-capture' });
  const arcConfig = await captureRequest(() => architect.build({ route: checkpoint.route, admittedStops: boundary.admittedStops, manifest: boundary.manifest }));
  cases.push({ id: 'route-arc', phase: 'architect', models: [MINI,NANO], config: arcConfig, baseline: checkpoint.arc });
  const serialCases = cases.map(c => ({ id:c.id, phase:c.phase, models:c.models, input:c.config.input, prompt:c.config.systemPrompt,
    schema:c.config.schema, toolName:c.config.toolName, packet:c.packet, baseline:c.baseline }));
  if (!args.includes('--execute')) { console.log(JSON.stringify({ dryRun:true,cases:cases.length,calls:cases.reduce((n,c)=>n+c.models.length,0),source,out,remaining:limit-prior })); return; }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw Error('OpenRouter key missing');
  const catalogResponse = await fetch('https://openrouter.ai/api/v1/models');
  if (!catalogResponse.ok) throw Error('Catalog unavailable');
  const catalog = await catalogResponse.json(), pricing = {}, aliases = {};
  for (const model of [MINI,NANO]) {
    const found = catalog.data.find(m=>m.id===model);
    if (!found) throw Error('Model unavailable');
    const endpointResponse = await fetch('https://openrouter.ai/api/v1/models/'+model+'/endpoints');
    if (!endpointResponse.ok) throw Error('Endpoints unavailable');
    const endpointData = await endpointResponse.json();
    aliases[model] = [...new Set(endpointData.data.endpoints.map(e=>e.name.split('|').pop().trim()).filter(id=>id.startsWith(model)))];
    if (!aliases[model].length) throw Error('Missing dated endpoint aliases');
    const pp = [found.pricing, ...endpointData.data.endpoints.map(e=>e.pricing)];
    const max = k => Math.max(...pp.map(p=>Number(p[k]||0)));
    pricing[model] = {inputUsdPerToken:max('prompt'),outputUsdPerToken:max('completion'),requestUsd:max('request')};
    if (!(pricing[model].inputUsdPerToken>0) || !(pricing[model].outputUsdPerToken>0)) throw Error('Missing pricing');
  }
  fs.mkdirSync(out,{mode:0o700});
  const save=(f,v)=>fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{mode:0o600});
  save('inputs.private.json',{sourceHashes:hashes,cases:serialCases,pricing,aliases,reasoning:'none',maxTokens:6000,
    design:'isolated stages; curator first pass on saved captures, fresh Mini/Nano; core historical matched prompt; arc fixed Mini dossier inputs'});
  const guard = new NarrativeProgressSpendGuardV6({limitUsd:limit,historicalSpendUsd:prior,path:path.join(out,'spend.private.jsonl')});
  const controller = new AbortController(), interrupt=()=>controller.abort();
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const rows=[];let status='running',error=null;
  const persist=()=>save('results.private.json',{status,error,publicationPassed:false,rows,budget:guard.snapshot()});
  const progress=e=>{guard.record(e);fs.appendFileSync(path.join(out,'progress.private.jsonl'),JSON.stringify(e)+'\n',{mode:0o600});};
  persist();
  try {
    for (const c of cases) {
      controller.signal.throwIfAborted();
      // Models run in parallel only within one fixed case, under the SAME budget guard.
      const settled = await Promise.allSettled(c.models.map(async model=>{
        console.log('Preparing '+c.phase+' '+c.id+' '+model);
        const validateSchema=new Ajv({strict:true,validateFormats:false}).compile(c.config.schema);
        const result=await realRequest({...c.config,callId:'prep-'+c.phase+'-'+c.id+'-'+model,
          provider:{kind:'openrouter',model,acceptedModels:aliases[model]},
          options:{openRouterApiKey:key,pricing:pricing[model],reasoning:'none',maxTokens:6000,
            requestAttempts:1,rateLimitAttempts:1,requestTimeoutMs:180000,includePreviousResponseOnSemanticRetry:false,
            runId:'mini-nano-prep',phase:c.phase,stopId:c.id,signal:controller.signal,onProgress:progress},
          validate:v=>{if(!validateSchema(v))throw Error('Full schema failed: '+JSON.stringify(validateSchema.errors));return c.config.validate(v);}
        });
        const label=model.endsWith('nano')?'nano':'mini';
        save(c.phase+'-'+c.id+'-'+label+'.private.json',result);
        const row={id:c.id,phase:c.phase,model,status:result.status,costUsd:result.usage?.costUsd??null,
          latencyMs:result.attempts.reduce((n,a)=>n+a.latencyMs,0),value:result.value};
        if(result.status==='valid'&&result.value&&c.evaluate)row.evaluation=c.evaluate(result.value);
        rows.push(row);persist();
      }));
      const rejected = settled.find(r=>r.status==='rejected');
      if (rejected) throw rejected.reason;
      const protocolFailure = rows.filter(r=>r.id===c.id).find(r=>r.status==='semantic_error' && !r.value);
      if (protocolFailure) throw Error('Preparation returned semantic_error; stop and inspect artifacts before continuing');
    }
    guard.assertSettled();status=rows.every(r=>r.status==='valid')?'complete':'complete_with_failures';
  } catch(e) {status='incomplete';error=String(e.message).split(key).join('[redacted]');process.exitCode=1;}
  finally {persist();process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
  for(const [p,h]of Object.entries(hashes))if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==h)throw Error('Source changed');
  console.log(JSON.stringify({status,error,rows:rows.length,budget:guard.snapshot(),out}));
}
module.exports={main,captureRequest};
if(require.main===module)main().catch(e=>{console.error('Preparation replay failed: '+String(e.message).split(process.env.OPENROUTER_API_KEY||'__NO_KEY__').join('[redacted]'));process.exitCode=1;});
