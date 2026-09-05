import { readFileSync } from 'fs';
import { resolve } from 'path';
import { strict as assert } from 'assert';
import { buildValidatedDossierV8, normalizeNarrativeCuratorOutputV8, classifyEvidenceTierV8, NarrativeCuratorOutputV8 } from '../../src/services/poi/NarrativeDossierV8';
import { segmentCaptureIntoSpansV7 } from '../../src/services/poi/NarrativeSpansV7';
import { NarrativeCapturedSourceV8 } from '../../src/services/poi/NarrativeSourcesV7';

// Offline regression against saved raw curator outputs; no model or network calls.
const directory = resolve(process.argv[2] ?? 'tmp/narrative-v8/madrid-v8-integrity-20260905-1');
const read = (name: string) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const diagnostics = read('diagnostics.private.json');
const review = read('review.json');
const events = readFileSync(resolve(directory, 'progress.private.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  .filter(event => event.event === 'attempt_finished' && event.phase === 'curator');
const results = [];
for (const research of diagnostics.research) {
  const captures = research.result.captures as NarrativeCapturedSourceV8[];
  const stop = review.route.stops.find((entry: { wikidataId: string }) => entry.wikidataId === research.entityQid);
  assert(stop, 'saved route must identify the research stop');
  const spansBySource = new Map(captures.map(capture => [capture.sourceId, segmentCaptureIntoSpansV7(capture).spans]));
  // Full identity aliases were not recorded: use the saved route name for both arms.
  const authorizedIdentityNames = [stop.name];
  for (const event of events.filter(event => event.callId.endsWith(research.entityQid))) {
    const output = JSON.parse(event.diagnostic.rawOutput) as NarrativeCuratorOutputV8;
    const normalized = normalizeNarrativeCuratorOutputV8({ output, captures, spansBySource, authorizedIdentityNames });
    const input = { stopId: research.entityQid, stopName: stop.name, qid: research.entityQid,
      language: review.request.language, curatorOutput: normalized.output, captures, spansBySource, authorizedIdentityNames };
    const before = JSON.stringify(normalized.output);
    const strict = buildValidatedDossierV8(input);
    const independent = buildValidatedDossierV8({ ...input, admissionMode: 'independent' });
    assert.equal(JSON.stringify(normalized.output), before, 'admission must not mutate curator output');
    assert.equal(strict.status, 'curator_contract_failed', 'saved failing round should reproduce a strict failure');
    assert.equal(independent.status, 'ok', 'independent round must retain a valid dossier');
    if (independent.status !== 'ok') continue;
    assert(independent.admission && independent.admission.rejectedPropositions.length > 0);
    const admittedIds = new Set(independent.value.dossier.propositions.flatMap(proposition => proposition.passageIds));
    assert(independent.value.dossier.passages.every(passage => admittedIds.has(passage.passageId)), 'no rejected-only passages');
    results.push({ stopId: research.entityQid, at: event.at,
      strictFailure: strict.status === 'curator_contract_failed' ? strict.reason : null,
      admission: independent.admission, gates: independent.value.gates,
      tier: classifyEvidenceTierV8(independent.value.dossier, independent.value.gates, captures),
      normalization: normalized.report });
  }
}
assert.equal(results.length, events.length, 'all saved curator calls must be covered');
assert(results.length > 0, 'no saved calls');
console.log(JSON.stringify({ mode: 'offline', identityCaveat: 'Both arms use saved route names; original full alias lists were not persisted.',
  rounds: results.length, results }, null, 2));
