// Opt-in launch replay. Run with node -r ts-node/register; default is entirely offline.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const { loadCases } = require('./narrative-deepseek-cases-v8.cjs');
const { NarrativeSpendLedgerV6 } = require('../../src/services/poi/NarrativeSpendLedgerV6');
const { requestCodexAuditV8 } = require('./narrative-codex-auditor-v8');
const { checkAuth } = require('./narrative-codex-author-v8');
const EFFECTIVE = Date.parse('2026-09-10T04:00:00Z');
const API = 'https://api.deepseek.com';

function parseArgs(argv) {
  const allowed = ['source','prep','out-dir','model','expected-model','phase','thinking','max-tokens','prior-spend-usd','spend-limit-usd'];
  const values = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!match || (match[1] !== 'execute' && !allowed.includes(match[1]))) throw Error('Unknown argument: ' + arg);
    const [, key, value] = match;
    if (Object.hasOwn(values, key)) throw Error('Duplicate argument: ' + key);
    if (key === 'execute' ? value !== undefined : !value?.trim()) throw Error('Invalid argument: ' + key);
    values[key] = key === 'execute' ? true : value;
  }
  for (const key of ['source','prep','out-dir','model']) if (!values[key]) throw Error('Required --' + key);
  const config = { source:path.resolve(values.source),prep:path.resolve(values.prep),out:path.resolve(values['out-dir']),
    model:values.model,expectedModel:values['expected-model'] ?? values.model,phase:values.phase ?? 'all',
    thinking:values.thinking ?? 'enabled',maxTokens:Number(values['max-tokens'] ?? 6000),
    prior:Number(values['prior-spend-usd'] ?? 0),limit:Number(values['spend-limit-usd'] ?? 2),execute:values.execute === true };
  if (![config.model,config.expectedModel].every(m => /^deepseek-[A-Za-z0-9._-]+$/.test(m))) throw Error('Invalid model');
  if (!['all','preparation','writer','auditor'].includes(config.phase)) throw Error('Invalid phase');
  if (!['enabled','disabled'].includes(config.thinking)) throw Error('Invalid thinking mode');
  if (!Number.isInteger(config.maxTokens) || config.maxTokens < 256 || config.maxTokens > 16000) throw Error('Invalid max tokens');
  if (!Number.isFinite(config.prior) || config.prior < 0 || !Number.isFinite(config.limit) || config.limit <= config.prior) throw Error('Invalid budget');
  return config;
}
function estimateCost(usage, at) {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime()) || at.getTime() < EFFECTIVE) throw Error('Announced pricing is not effective');
  if (!usage || usage.prompt_tokens === undefined || usage.completion_tokens === undefined) return undefined;
  const input = usage.prompt_tokens, output = usage.completion_tokens;
  const hit = usage.prompt_cache_hit_tokens ?? 0, miss = usage.prompt_cache_miss_tokens ?? input - hit;
  if (![input,output,hit,miss].every(n => Number.isSafeInteger(n) && n >= 0) || hit + miss !== input) throw Error('Invalid token usage');
  const minute = at.getUTCHours()*60 + at.getUTCMinutes();
  const peak = at.getUTCDay() >= 1 && at.getUTCDay() <= 5 && ((minute >= 60 && minute < 240) || (minute >= 360 && minute < 600));
  // completion_tokens already includes reasoning; rates come from the user's launch email.
  return (hit * (peak ? 0.006 : 0.003) + miss * (peak ? 0.3 : 0.15) + output * (peak ? 1.2 : 0.6)) / 1e6;
}
function requestBody(c, config) {
  return { model:config.model,stream:false,max_tokens:config.maxTokens,thinking:{type:config.thinking},
    ...(config.thinking === 'enabled' ? {reasoning_effort:'low'} : {temperature:0}),
    messages:c.phase === 'writer' ? [{role:'user',content:c.prompt}]
      : [{role:'system',content:c.prompt},{role:'user',content:JSON.stringify(c.input)}],
    ...(c.schema ? {tools:[{type:'function',function:{name:c.toolName,parameters:c.schema,strict:false}}],
      tool_choice:config.thinking === 'enabled' ? 'auto' : {type:'function',function:{name:c.toolName}}} : {}) };
}
function parseResponse(data, c, config) {
  if (data.model !== config.expectedModel) throw Error('Returned model mismatch: ' + String(data.model));
  if (!Array.isArray(data.choices) || data.choices.length !== 1) throw Error('Expected one choice');
  const choice = data.choices[0];
  if (c.phase === 'writer') {
    if (choice.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim()) throw Error('Incomplete writer response');
    return choice.message.content;
  }
  const calls = choice.message?.tool_calls;
  if (choice.finish_reason !== 'tool_calls' || !Array.isArray(calls) || calls.length !== 1 || calls[0].function?.name !== c.toolName) throw Error('Incomplete or incorrect tool response');
  return JSON.parse(calls[0].function.arguments);
}
function render(results) {
  const lines = ['# DeepSeek frente a Mini y Astra','',
    'Estado: ' + results.status + '. Requiere revisión; no autoriza sustitución ni publicación.',
    'Costes DeepSeek estimados con el correo del 9/9; Astra consume cuota ChatGPT. Modelo/versión de lanzamiento pendiente de verificación externa.',
    'Los controles de estructura y los desacuerdos entre modelos no certifican verdad factual. Comparación por etapas con entradas congeladas.',
    '', '| Fase | Caso | Estado | ms DeepSeek | USD estimados | Base histórica | ms base | USD base |',
    '|---|---|---|---:|---:|---|---:|---:|'];
  for (const row of results.rows) {
    const baseMs = row.baseline?.attempts?.reduce((sum,a) => sum+a.latencyMs,0);
    const baseUsd = row.baseline?.billing === 'ChatGPT quota' ? 'cuota' : row.baseline?.usage?.costUsd ?? 'desconocido';
    lines.push('| ' + [row.phase,row.id,row.status,row.latencyMs ?? '',row.estimatedCostUsd ?? '',
      row.baseline?.model ?? row.baseline?.provenance ?? '',baseMs ?? 'desconocido',baseUsd].join(' | ') + ' |');
  }
  for (const row of results.rows) {
    if (row.phase === 'writer' && row.value) {
      lines.push('', '## ' + row.id, '', '### Astra guardado', '', row.baseline.script.text,
        '', '### DeepSeek', '', row.value.text, '',
        'Palabras: ' + row.value.wordCount + '. Duración: ' + (row.value.delivery.localPassed ? 'dentro de tolerancia' : 'fuera de tolerancia') + '.');
    }
    if (row.independentAudit?.value?.findings) {
      const objections = row.independentAudit.value.findings.filter(f => !['supported','authorized_inference'].includes(f.classification));
      lines.push('', 'Auditoría Astra · ' + row.phase + ' ' + row.id + ': ' + objections.length + ' hallazgos a revisar.');
      for (const f of objections) lines.push('- ' + f.sentenceId + ': ' + f.classification + ' — ' + f.reason);
    }
    for (const d of row.disagreements ?? []) lines.push('- ' + row.id + ' / ' + d.sentenceId + ': Astra ' + d.astra + '; DeepSeek ' + d.deepseek);
  }
  if (results.error) lines.push('', 'Error: ' + results.error);
  return lines.join('\n') + '\n';
}
async function main(argv = process.argv.slice(2), deps = {}) {
  const config = parseArgs(argv), now = deps.now ?? (() => new Date()), fetcher = deps.fetch ?? fetch;
  if (fs.existsSync(config.out)) throw Error('Output must be a new directory');
  const loaded = (deps.loadCases ?? loadCases)(config);
  const astraAuditCalls = loaded.cases.filter(c => c.phase === 'writer' || c.phase === 'auditor').length;
  if (!config.execute) {
    const plan = {dryRun:true,cases:loaded.cases.length,deepseekCalls:loaded.cases.length,astraAuditCalls,...config};
    console.log(JSON.stringify(plan)); return plan;
  }
  if (now().getTime() < EFFECTIVE) throw Error('Launch test starts after 2026-09-10 04:00 UTC; confirm release first');
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw Error('DEEPSEEK_API_KEY is required');
  const redact = error => String(error?.message ?? error).split(key).join('[redacted]');
  const headers = {Authorization:'Bearer ' + key,'Content-Type':'application/json'};
  const catalogResponse = await fetcher(API + '/models',{headers,signal:AbortSignal.timeout(15000)});
  if (!catalogResponse.ok) throw Error('DeepSeek model catalog HTTP ' + catalogResponse.status);
  const catalog = await catalogResponse.json();
  if (!catalog.data?.some(m => m.id === config.model)) throw Error('Requested model is not available in DeepSeek catalog');
  if (astraAuditCalls) await (deps.checkAuth ?? checkAuth)();
  loaded.verifySources();
  fs.mkdirSync(path.dirname(config.out),{recursive:true,mode:0o700});
  fs.mkdirSync(config.out,{mode:0o700});
  const save = (name,value) => fs.writeFileSync(path.join(config.out,name), typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const ledger = new NarrativeSpendLedgerV6({limitUsd:config.limit,historicalSpendUsd:config.prior,path:path.join(config.out,'spend.private.jsonl')});
  const results = {status:'running',error:null,publicationPassed:false,replacementApproved:false,baselineIsGroundTruth:false,
    releaseVersionVerified:false,config,pricingSource:'user announcement 2026-09-09; estimated, not invoice',
    astraBilling:'ChatGPT quota',rows:[],budget:ledger.snapshot()};
  save('inputs.private.json',{...results,sourceHashes:loaded.sourceHashes,cases:loaded.cases,catalog});
  const persist = () => {results.budget=ledger.snapshot();save('results.private.json',results);save('comparison.md',render(results));};
  const controller = new AbortController(), interrupt = () => controller.abort(new Error('Replay interrupted'));
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  persist();
  try {
    for (const [index,c] of loaded.cases.entries()) {
      controller.signal.throwIfAborted();loaded.verifySources();
      const body = requestBody(c,config), prefix = String(index+1).padStart(2,'0');
      const row = {id:c.id,phase:c.phase,status:'running',requestedModel:config.model,baseline:c.baseline};
      results.rows.push(row);save(prefix+'-request.private.json',body);persist();
      // Conservative UTF-8 byte reserve at announced peak rates, with protocol overhead.
      let reservation = null;
      const started = Date.now();
      try {
        reservation = ledger.reserve((Buffer.byteLength(JSON.stringify(body))+4096)*0.3/1e6 + config.maxTokens*1.2/1e6,
          {phase:c.phase,model:config.model,attempt:1});
        console.log('[deepseek-replay] ' + c.phase + ' ' + c.id);
        const response = await fetcher(API+'/chat/completions',{method:'POST',headers,body:JSON.stringify(body),
          signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});
        if (!response.ok) {
          const detail = redact(await response.text());
          save(prefix+'-error.private.txt',detail);
          throw Error('DeepSeek HTTP ' + response.status + ': ' + detail.slice(0,2000));
        }
        const data = await response.json();
        row.latencyMs=Date.now()-started;
        save(prefix+'-response.private.json',data);
        row.actualModel=data.model;row.usage=data.usage;row.finishReason=data.choices?.[0]?.finish_reason;
        const billedAt = Number.isFinite(data.created) ? new Date(data.created*1000) : now();
        row.estimatedCostUsd=estimateCost(data.usage,billedAt);
        ledger.settle(reservation,row.estimatedCostUsd);reservation=null;
        if (row.estimatedCostUsd === undefined) throw Error('Missing usage; reserved maximum retained');
        const output=parseResponse(data,c,config);
        row.value=c.validate(output);row.status='valid';persist();
        if (c.phase === 'writer' || c.phase === 'auditor') {
          controller.signal.throwIfAborted();
          const audit = c.phase === 'writer' ? c.audit(output) : c;
          row.independentAudit = await (deps.audit ?? requestCodexAuditV8)({callId:'deepseek-review-'+prefix,
            input:audit.input,systemPrompt:audit.prompt,schema:audit.schema,validate:audit.validate,signal:controller.signal});
          if (row.independentAudit.status !== 'valid' || !row.independentAudit.value) throw Error('Independent Astra audit failed');
          if (c.phase === 'auditor') {
            row.disagreements=row.value.findings.flatMap(f => {
              const reference=row.independentAudit.value.findings.find(a => a.sentenceId === f.sentenceId);
              return !reference || reference.classification !== f.classification
                ? [{sentenceId:f.sentenceId,astra:reference?.classification ?? 'missing',deepseek:f.classification}] : [];
            });
          }
        }
      } catch (error) {
        row.latencyMs ??= Date.now()-started;
        row.status='failed';row.error=redact(error);
        if (reservation) ledger.settle(reservation);
        throw error;
      } finally {persist();}
    }
    ledger.assertSettled();
    results.status='complete_needs_review';
  } catch (error) {
    results.status='incomplete';results.error=redact(error);process.exitCode=1;
  } finally {
    try {loaded.verifySources();} catch(error) {results.status='incomplete';results.error=redact(error);process.exitCode=1;}
    persist();process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  }
  console.log(JSON.stringify({status:results.status,out:config.out,budget:results.budget}));
  return results;
}
module.exports = { main,parseArgs,estimateCost,requestBody,parseResponse };
if (require.main === module) main().catch(error => {
  console.error(String(error?.message ?? error).split(process.env.DEEPSEEK_API_KEY || '__NO_KEY__').join('[redacted]'));
  process.exitCode=1;
});
