import fs from 'fs';
import path from 'path';
import assert from 'node:assert/strict';
import { NarrativeEditVersionV8, decideNarrativeEditV8 } from '../../src/services/poi/NarrativeEditDecisionV8';
import { resolveNarrativeSentenceTargetsV8, assertNarrativeSentenceScopeV8 } from '../../src/services/poi/NarrativeSentenceEditV8';
import { NarrativeWriterPlanV8 } from '../../src/services/poi/NarrativeWriterContractV8';

// Offline only: inspect archived versions; never resume them under a different policy.
const directory = process.argv[2];
if (!directory) throw new Error('Usage: ts-node narrative-editorial-nonregression-replay-v8.ts <archived-run-directory>');
const checkpoint = JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.private.json'), 'utf8'));
const diagnostics = JSON.parse(fs.readFileSync(path.join(directory, 'diagnostics.private.json'), 'utf8'));
const rows = checkpoint.editorial.stageState.stops.map((stop: {
  stopId: string; editComparison?: { before: NarrativeEditVersionV8; candidate: NarrativeEditVersionV8; decision: string };
}) => {
  const comp = stop.editComparison;
  assert(comp, 'fixture requires a before/candidate pair');
  const writer = diagnostics.privateDiagnostics.find((d: { input?: { writerPlan?: NarrativeWriterPlanV8 } }) =>
    d.input?.writerPlan?.routeStopId === stop.stopId);
  assert(writer, 'fixture requires original writer plan');
  const plan: NarrativeWriterPlanV8 = writer.input.writerPlan;
  const targets = comp.before.verification!.report.findings.filter(f =>
    !['supported', 'authorized_inference'].includes(f.classification)).map(f => f.sentenceId);
  let mappingError: string | null = null;
  let scopeError: string | null = null;
  if (targets.length) {
    try { resolveNarrativeSentenceTargetsV8(stop.stopId, comp.before.draft, targets); }
    catch (error) { mappingError = (error as Error).message; }
    try { assertNarrativeSentenceScopeV8(stop.stopId, comp.before.draft, comp.candidate.draft, targets); }
    catch (error) { scopeError = (error as Error).message; }
  }
  const decision = decideNarrativeEditV8(comp.before, comp.candidate, plan.narrationTarget.targetWords);
  const initialWords = comp.before.script.text.split(/\s+/u).length;
  const candidateWords = comp.candidate.script.text.split(/\s+/u).length;
  if (comp.decision === 'accepted' && candidateWords < initialWords) {
    assert.equal(decision.decision, 'rejected', 'archived destructive accepted edit must no longer win');
  }
  return { stopId: stop.stopId, initialWords, candidateWords, originalDecision: comp.decision,
    newDurationDecision: decision, targetCount: targets.length, mappingError, scopeError };
});
assert.equal(rows.length, 7, 'Madrid regression fixture must contain seven pairs');
const palace = rows.find((row: { stopId: string }) => row.stopId === 'Q171517');
assert(palace && palace.initialWords === 550 && palace.candidateWords === 185);
assert.equal(palace.newDurationDecision.decision, 'rejected');
console.log(JSON.stringify({ mode: 'offline-archived-response-replay', paidCalls: 0, rows }, null, 2));
