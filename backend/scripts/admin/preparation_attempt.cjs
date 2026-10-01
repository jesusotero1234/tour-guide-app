// Allocate and persist a fresh canary directory before executing an interrupted phase.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
function allocate(backend,batch,manifest,row){
 const d=path.join(batch,row.slug),file=path.join(d,'prepare-recovery.json');
 let recovery=fs.existsSync(file)?read(file):null;
 const prefix=manifest.runId+'-'+row.slug;
 let runId=prefix+(recovery?'-'+(recovery.runSuffix??'recovery'):'');
 const runs=path.join(backend,'tmp/narrative-v8'),output=path.join(runs,runId);
 if(fs.existsSync(path.join(output,'blueprint.private.json'))) return {recovery,runId,output};
 if(!fs.existsSync(output)||fs.readdirSync(output).length===0) return {recovery,runId,output};
 let exposure=0;const accounting=[];
 for(const name of fs.readdirSync(runs).filter(n=>n===prefix||n.startsWith(prefix+'-'))){
  const budgetFile=path.join(runs,name,'budget.private.json');
  if(!fs.existsSync(budgetFile)) {assert(fs.readdirSync(path.join(runs,name)).length===0,'Unaccounted prior attempt: '+name);continue;}
  const b=read(budgetFile);assert(Number.isFinite(b.spentUsd)&&Number.isFinite(b.reservedUsd),'Unknown prior budget');
  const cost=Math.max(0,b.spentUsd-(b.historicalSpentUsd??0))+b.reservedUsd;
  exposure+=cost;accounting.push({runId:name,budget:b,additionalExposureUsd:cost});
 }
 assert(exposure<=2,'Preparation cumulative budget exhausted');
 let checkpoint=null,phase=null;
 const previousCheckpoint=path.join(output,'checkpoint.private.json');
 if(fs.existsSync(previousCheckpoint)){
  const api=require('../../src/services/poi/NarrativeUserCanaryCheckpointV8');
  const cp=api.validateCheckpointV8(read(previousCheckpoint));
  assert.equal(cp.run.cityQid,row.qid,'checkpoint city differs');
  const phases={candidates:'route',route:'research',research:'arc',arc:'editorial',editorial:'scorecard'};
  phase=phases[cp.completedPhase];assert(phase,'No resumable incomplete checkpoint');
  api.assertCheckpointSupportsResumeV8(cp,phase);checkpoint=previousCheckpoint;
 }
 const suffix='reliability-'+crypto.randomUUID();
 const next={runSuffix:suffix,priorSpendUsd:Math.max(exposure,recovery?.priorSpendUsd??0),previousRunId:runId,
  ...(checkpoint?{checkpoint,phase}:{}),reason:'resume valid checkpoint or fresh attempt; prior artifacts retained',accounting};
 const history=path.join(d,'preparation-attempts');fs.mkdirSync(history,{recursive:true});
 save(path.join(history,suffix+'.json'),{previousRecovery:recovery,...next,transitionAt:new Date().toISOString()});
 save(file,next);runId=prefix+'-'+suffix;return {recovery:next,runId,output:path.join(runs,runId)};
}
module.exports={allocate};
