// Independent Astra check of admitted curator claims against their source passages.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {checkAuth}=require('./narrative-codex-author-v8');
const {requestCodexAuditV8}=require('./narrative-codex-auditor-v8');
const {assignNarrativeSentenceIdsV6}=require('../../src/services/poi/NarrativeEditorialV6');
const {NARRATIVE_COMPACT_AUDIT_PROMPT_V8,compactNarrativeAuditSchemaV8,parseCompactNarrativeAuditV8}=require('../../src/services/poi/NarrativeCompactVerificationV8');
async function main(){
  const [sourceArg,outArg,execute]=process.argv.slice(2);
  if(!sourceArg||!outArg||execute!=='--execute'||process.argv.length!==5)throw Error('Usage: RESULTS_JSON NEW_OUTPUT_DIRECTORY --execute');
  const source=path.resolve(sourceArg),out=path.resolve(outArg),bytes=fs.readFileSync(source);
  const fingerprint=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const sourceHash=crypto.createHash('sha256').update(bytes).digest('hex'),data=JSON.parse(bytes);
  if(data.status!=='complete_needs_review'||fs.existsSync(out))throw Error('Require completed curation and a new output directory');
  await checkAuth();fs.mkdirSync(out,{recursive:true,mode:0o700});
  const results={status:'running',scope:'audit-admitted-curator-propositions',source,sourceHash,model:'gpt-6-astra',billing:'ChatGPT quota',publicationPassed:false,rows:[]};
  const save=()=>fs.writeFileSync(path.join(out,'results.private.json'),JSON.stringify(results,null,2)+'\n',{mode:0o600});
  try{
    for(const row of data.rows){
      const round=row.rounds.find(r=>r.number===row.finalRound),dossier=round?.admission?.value?.dossier;
      if(!dossier)throw Error('No admitted dossier for '+row.stopId);
      const script=assignNarrativeSentenceIdsV6(row.stopId,dossier.propositions.map(p=>p.text).join('\n\n'),{sentenceBoundaryPolicy:'v8',preserveParagraphs:true});
      const ids=dossier.passages.map(p=>p.passageId);
      const input={sentences:script.sentences,language:dossier.language,propositions:dossier.propositions,
        passages:dossier.passages,discrepancies:dossier.discrepancies,limits:dossier.limits,bridgeEvidence:{propositions:[],passages:[]}};
      const audit=await requestCodexAuditV8({callId:'barcelona-curation-audit-'+data.provider+'-'+row.stopId,input,
        systemPrompt:NARRATIVE_COMPACT_AUDIT_PROMPT_V8,schema:compactNarrativeAuditSchemaV8(script,ids),
        validate:value=>parseCompactNarrativeAuditV8(value,script,ids),signal:AbortSignal.timeout(180000)});
      if(audit.status!=='valid')throw Error('Astra audit failed');
      results.rows.push({stopId:row.stopId,name:row.name,finalRound:row.finalRound,script,audit});save();
      console.log(JSON.stringify({stop:row.name,findings:audit.value.findings.filter(f=>!['supported','authorized_inference'].includes(f.classification)).length}));
    }
    results.status='complete_needs_review';
  }catch(error){results.status='incomplete';results.error=String(error.message);process.exitCode=1;}
  finally{if(fingerprint()!==sourceHash){results.status='incomplete';results.error='Curation results changed during audit';process.exitCode=1;}save();}
  console.log(JSON.stringify({status:results.status,stops:results.rows.length}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
