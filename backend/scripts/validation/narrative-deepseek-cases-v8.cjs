// Frozen stage comparisons: no network, regeneration, or production configuration changes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv = require('ajv');
const { isDeepStrictEqual } = require('node:util');
const { editorialPromptFingerprintV6 } = require('../../src/services/poi/EditorialStructuredLlmV6');
const { validateCoreAuditOpenRouterV6 } = require('../../src/services/poi/EditorialCoreResolverV6');
const { validateNarrativeArcV8 } = require('../../src/services/poi/NarrativeArcArchitectV8');
const { buildNarrativeEvidenceBoundaryV8 } = require('../../src/services/poi/NarrativeEvidenceBoundaryV8');
const { normalizeNarrativeCuratorOutputV8, buildValidatedDossierV8 } = require('../../src/services/poi/NarrativeDossierV8');
const { segmentCaptureIntoSpansV7 } = require('../../src/services/poi/NarrativeSpansV7');
const { assignNarrativeSentenceIdsV6 } = require('../../src/services/poi/NarrativeEditorialV6');
const { evaluateNarrationDeliveryV8 } = require('../../src/services/poi/NarrativeDurationTargetsV8');
const { compactNarrativeAuditSchemaV8, parseCompactNarrativeAuditV8 } = require('../../src/services/poi/NarrativeCompactVerificationV8');
const { prepareAuthorCanaryMaterialV8 } = require('./narrative-author-canary-material-v8');

function checked(schema, semantic) {
  const check = new Ajv({ strict: true, validateFormats: false }).compile(schema);
  return value => {
    if (!check(value)) throw Error('Full schema failed: ' + JSON.stringify(check.errors));
    return semantic(value);
  };
}
function auditCase(material, script) {
  const input = { ...material.frozen.inputs[0].auditInput, sentences: script.sentences };
  const ids = [...new Set([...input.passages, ...input.bridgeEvidence.passages].map(p => p.passageId))];
  const schema = compactNarrativeAuditSchemaV8(script, ids);
  return { id: material.stopId, phase: 'auditor', prompt: material.frozen.auditPrompt,
    input, schema, toolName: 'audit_narrative_v8',
    validate: checked(schema, value => parseCompactNarrativeAuditV8(value, script, ids)) };
}
function loadCases({ source, prep, phase = 'all' }) {
  if (!['all', 'preparation', 'writer', 'auditor'].includes(phase)) throw Error('Invalid phase');
  const sourceHashes = {};
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const read = file => {
    file = path.resolve(file);
    sourceHashes[file] = hash(file);
    return fs.readFileSync(file, 'utf8');
  };
  const json = file => JSON.parse(read(file));
  const checkpointPath = path.resolve(source, 'checkpoint.private.json');
  const checkpoint = json(checkpointPath), cases = [];
  if (phase === 'all' || phase === 'preparation') {
    const snapshot = json(path.join(prep, 'inputs.private.json'));
    if (!snapshot.sourceHashes || snapshot.sourceHashes[checkpointPath] !== sourceHashes[checkpointPath]) {
      throw Error('Preparation snapshot does not match the source checkpoint');
    }
    for (const [file, expected] of Object.entries(snapshot.sourceHashes)) {
      if (hash(file) !== expected) throw Error('Source hash mismatch: ' + file);
      sourceHashes[path.resolve(file)] = expected;
    }
    const boundary = buildNarrativeEvidenceBoundaryV8(checkpoint.route, checkpoint.research);
    if (!boundary.admittedStops) throw Error('Saved evidence boundary failed');
    for (const c of snapshot.cases) {
      let baseline, semantic;
      if (c.phase === 'core_audit') {
        baseline = { ...c.baseline, provenance: 'historical_same_prompt' };
        semantic = value => validateCoreAuditOpenRouterV6(value, c.input);
      } else if (c.phase === 'architect') {
        baseline = { value: c.baseline, provenance: 'historical_not_matched_first_pass', costUsd: null, latencyMs: null };
        semantic = value => validateNarrativeArcV8(value, checkpoint.route, boundary.admittedStops);
      } else if (c.phase === 'curator') {
        if (!/^[A-Za-z0-9_-]+$/.test(c.id)) throw Error('Invalid curator ID');
        baseline = { ...json(path.join(prep, 'curator-' + c.id + '-mini.private.json')), provenance: 'historical_same_prompt' };
        const handoff = checkpoint.research.find(r => r.routeStopId === c.id);
        const stop = checkpoint.route.stops.find(s => s.stopId === c.id);
        if (!handoff || !stop) throw Error('Curator stop missing from checkpoint');
        const captures = handoff.result.captures;
        const spansBySource = new Map(captures.map(capture => [capture.sourceId, segmentCaptureIntoSpansV7(capture).spans]));
        const authorizedIdentityNames = [...new Set([stop.name, ...captures.map(capture => capture.title).filter(Boolean)])];
        semantic = output => {
          const normalized = normalizeNarrativeCuratorOutputV8({ output, captures, spansBySource, authorizedIdentityNames });
          const admission = buildValidatedDossierV8({ stopId: c.id, stopName: stop.name, qid: handoff.entityQid,
            language: checkpoint.route.language, curatorOutput: normalized.output, admissionMode: 'independent',
            captures, spansBySource, authorizedIdentityNames });
          return { normalization: normalized.report, admission, rawCount: output.propositions.length, target: c.packet.narrationTarget };
        };
      } else throw Error('Unknown saved preparation phase');
      if (!c.prompt?.trim() || !c.toolName || !c.input || !c.baseline) throw Error('Incomplete saved preparation case');
      const validate = checked(c.schema, semantic);
      if (c.phase !== 'architect') {
        if (baseline.model !== 'openai/gpt-5.4-mini' || baseline.status !== 'valid'
          || !isDeepStrictEqual(baseline.input, c.input)
          || baseline.promptFingerprint !== editorialPromptFingerprintV6(c.prompt, c.toolName, c.schema)) {
          throw Error('Mini baseline does not match the frozen request');
        }
        baseline.evaluation = validate(JSON.parse(baseline.rawOutput));
      }
      cases.push({ id: c.id, phase: c.phase, prompt: c.prompt, input: c.input, schema: c.schema,
        toolName: c.toolName, baseline, validate });
    }
  }
  if (phase !== 'preparation') {
    const review = json(path.join(source, 'codex-author-review.private.json'));
    if (review.writer?.model !== 'gpt-6-astra') throw Error('Expected a saved Astra writer baseline');
    const assets = process.env.NARRATIVE_AUTHOR_ASSET_ROOT || path.resolve(__dirname, '../../../docs/operations');
    const template = read(path.join(assets, 'narrative-author-context-pack-20260906/malagueta-oneshot.md'));
    const reference = read(path.join(assets, 'narrative-plaza-mayor-reference-20260905.md'));
    const materials = prepareAuthorCanaryMaterialV8(checkpoint, template, reference, 'Q1123493');
    materials.forEach((material, index) => {
      const matches = review.stops.filter(s => s.stopId === material.stopId);
      if (matches.length !== 1 || !matches[0].script?.text?.trim()) throw Error('Missing unique Astra script');
      const saved = matches[0];
      if (phase === 'all' || phase === 'writer') {
        const prompt = read(path.join(source, 'codex-author', (index + 1) + '.prompt.private.md'));
        if (!prompt.trim()) throw Error('Empty saved writer prompt');
        cases.push({ id: material.stopId, phase: 'writer', prompt,
          baseline: { ...review.writer, script: saved.script, usage: saved.usage, provenance: 'historical_same_prompt' },
          validate(text) {
            if (typeof text !== 'string' || !text.trim()) throw Error('Empty narration');
            const wordCount = text.trim().split(/\s+/u).length;
            return { text, wordCount, delivery: evaluateNarrationDeliveryV8([{ targetWords: material.targetWords, actualWords: wordCount }]) };
          },
          audit: text => auditCase(material, assignNarrativeSentenceIdsV6(material.stopId, text, { sentenceBoundaryPolicy: 'v8', preserveParagraphs: true }))
        });
      }
      if (phase === 'all' || phase === 'auditor') {
        cases.push({ ...auditCase(material, saved.script),
          baseline: { model: review.auditor, result: saved.audit, provenance: 'historical_reference_only' } });
      }
    });
  }
  const keys = cases.map(c => c.phase + ':' + c.id);
  if (!cases.length || new Set(keys).size !== keys.length) throw Error('Empty or duplicate cases');
  const verifySources = () => {
    for (const [file, expected] of Object.entries(sourceHashes)) if (hash(file) !== expected) throw Error('Source changed: ' + file);
  };
  verifySources();
  return { cases, sourceHashes, verifySources };
}
module.exports = { loadCases, auditCase };
