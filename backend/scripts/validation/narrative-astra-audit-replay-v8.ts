import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import { spawn } from 'node:child_process';
import Ajv from 'ajv';
import { checkAuth, runCodex, filterEnv, parseJsonlOutput } from './narrative-codex-author-v8';
import { compactNarrativeAuditSchemaV8, parseCompactNarrativeAuditV8 } from '../../src/services/poi/NarrativeCompactVerificationV8';

interface ReplayCase {
  stopId: string;
  script: Parameters<typeof compactNarrativeAuditSchemaV8>[0];
  input: Record<string, unknown>;
  ids: string[];
  prompt: string;
  baseline: Array<{ sentenceId: string; classification: string; reason: string }>;
}

interface ReplaySnapshot {
  cases: ReplayCase[];
  sourceHashes: Record<string, string>;
}

interface Disagreement {
  sentenceId: string;
  text: string;
  baseline: string;
  candidate: string;
  reason: string;
}

interface Row {
  stopId: string;
  status: string;
  latencyMs: number;
  usage?: unknown;
  findings?: Array<{ sentenceId: string; classification: string; passageIds: string[]; reason: string }>;
  disagreements: Disagreement[];
}

interface Results {
  status: 'running' | 'complete' | 'incomplete';
  error: string | null;
  publicationPassed: boolean;
  model: string;
  reasoning: string;
  billing: string;
  baselineIsGroundTruth: false;
  apiSpendUsd: 0;
  rows: Row[];
}

const MODEL_ALLOWLIST = ['gpt-6-astra', 'gpt-5.6-luna'];

export function modelAuditArgsV8(args: string[], model: string, schemaPath: string, reasoning: string = 'low'): string[] {
  if (!MODEL_ALLOWLIST.includes(model)) throw new Error('Unsupported model: ' + model);
  if (reasoning !== 'low' && reasoning !== 'xhigh') throw new Error('Unsupported reasoning: ' + reasoning);
  const result = [...args];
  let foundModel = false;
  let foundReasoning = false;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === '-m') {
      if (foundModel) throw new Error('Duplicate -m flag');
      if (i + 1 >= result.length || !result[i + 1].trim() || result[i + 1].startsWith('-')) throw new Error('-m flag missing value');
      result[i + 1] = model;
      foundModel = true;
    } else if (result[i] === '-c') {
      if (i + 1 >= result.length || !result[i + 1].trim() || result[i + 1].startsWith('-')) throw new Error('-c flag missing value');
      const value = result[i + 1];
      if (value.startsWith('model_reasoning_effort=')) {
        if (foundReasoning) throw new Error('Duplicate model_reasoning_effort setting');
        result[i + 1] = 'model_reasoning_effort=' + reasoning;
        foundReasoning = true;
      }
    }
  }
  if (!foundModel) throw new Error('Missing -m flag');
  if (!foundReasoning) throw new Error('Missing model_reasoning_effort setting');
  result.push('--output-schema', schemaPath);
  return result;
}

function parseArgs(argv: string[]): { inputs: string; outDir: string; execute: boolean; stopId?: string; model: string; reasoning: string } {
  const allowed = ['--inputs', '--out-dir', '--stop-id', '--model', '--reasoning'];
  const executeCount = argv.filter(a => a === '--execute').length;
  if (executeCount > 1) throw new Error('Duplicate argument: --execute');
  for (const arg of argv) {
    if (arg === '--execute') continue;
    if (!arg.includes('=')) throw new Error('Argument must use name=value form: ' + arg);
    const key = arg.split('=')[0];
    if (!allowed.includes(key)) throw new Error('Unknown argument: ' + arg);
  }
  const option = (name: string): string | undefined => {
    const values = argv.filter(a => a.startsWith(name + '='));
    if (values.length > 1) throw new Error('Duplicate argument: ' + name);
    return values[0]?.slice(name.length + 1);
  };
  const required = (name: string): string => {
    const value = option(name);
    if (!value?.trim()) throw new Error(name + ' required');
    return value;
  };
  const inputs = resolve(required('--inputs'));
  const outDir = resolve(required('--out-dir'));
  const execute = argv.includes('--execute');
  const rawStopId = option('--stop-id');
  if (rawStopId !== undefined && !rawStopId.trim()) throw new Error('Empty --stop-id');
  const stopId = rawStopId?.trim();
  if (stopId !== undefined && !/^[A-Za-z0-9_-]+$/.test(stopId)) throw new Error('Invalid --stop-id: ' + stopId);
  const rawModel = option('--model');
  const model = rawModel === undefined ? 'gpt-6-astra' : rawModel.trim();
  if (!model) throw new Error('Empty --model');
  if (!MODEL_ALLOWLIST.includes(model)) throw new Error('Unsupported model: ' + model);
  const rawReasoning = option('--reasoning');
  const reasoning = rawReasoning === undefined ? 'low' : rawReasoning.trim();
  if (!reasoning) throw new Error('Empty --reasoning');
  if (reasoning !== 'low' && reasoning !== 'xhigh') throw new Error('Unsupported reasoning: ' + reasoning);
  return { inputs, outDir, execute, stopId, model, reasoning };
}

function validateSnapshot(snapshot: ReplaySnapshot, stopId?: string): ReplayCase[] {
  if (!Array.isArray(snapshot.cases) || snapshot.cases.length === 0) throw new Error('Empty cases');
  if (!snapshot.sourceHashes || typeof snapshot.sourceHashes !== 'object' || Array.isArray(snapshot.sourceHashes) || Object.keys(snapshot.sourceHashes).length === 0) throw new Error('Nonempty sourceHashes required');
  const seen = new Set<string>();
  for (const c of snapshot.cases) {
    if (!c.stopId || typeof c.stopId !== 'string') throw new Error('Missing stopId');
    if (!/^[A-Za-z0-9_-]+$/.test(c.stopId)) throw new Error('Invalid stopId');
    if (seen.has(c.stopId)) throw new Error('Duplicate stopId: ' + c.stopId);
    seen.add(c.stopId);
    if (!c.script || typeof c.script !== 'object' || Array.isArray(c.script)) throw new Error('Script must be object: ' + c.stopId);
    if (c.script.stopId !== c.stopId) throw new Error('Script stopId mismatch: ' + c.stopId);
    if (typeof c.script.text !== 'string' || !c.script.text.trim() || typeof c.script.fingerprint !== 'string' || !c.script.fingerprint.trim()) throw new Error('Missing script text/fingerprint');
    if (!Array.isArray(c.script.sentences) || c.script.sentences.length === 0) throw new Error('Nonempty script sentences required: ' + c.stopId);
    for (const s of c.script.sentences) {
      if (!s || typeof s.sentenceId !== 'string' || !s.sentenceId.trim() || typeof s.text !== 'string' || !s.text.trim()) throw new Error('Nonempty sentence ID and text required: ' + c.stopId);
    }
    const scriptIds = new Set(c.script.sentences.map(s => s.sentenceId));
    if (scriptIds.size !== c.script.sentences.length) throw new Error('Duplicate sentence IDs in script: ' + c.stopId);
    if (!Array.isArray(c.baseline)) throw new Error('Missing baseline findings');
    if (!c.ids || !Array.isArray(c.ids) || c.ids.length === 0) throw new Error('Nonempty ids required: ' + c.stopId);
    if (!c.prompt || typeof c.prompt !== 'string' || !c.prompt.trim()) throw new Error('Prompt nonblank required: ' + c.stopId);
    if (!c.input || typeof c.input !== 'object' || Array.isArray(c.input)) throw new Error('Input must be object: ' + c.stopId);
    const inputSentences = (c.input as Record<string, unknown>).sentences;
    if (!Array.isArray(inputSentences) || inputSentences.length !== c.script.sentences.length) throw new Error('Input sentences must match script: ' + c.stopId);
    for (let i = 0; i < c.script.sentences.length; i++) {
      const s = inputSentences[i] as { sentenceId?: string; text?: string };
      if (!s || s.sentenceId !== c.script.sentences[i].sentenceId || s.text !== c.script.sentences[i].text) throw new Error('Input sentence mismatch at index ' + i + ': ' + c.stopId);
    }
  }
  if (stopId && !seen.has(stopId)) throw new Error('No saved stop matches --stop-id: ' + stopId);
  return stopId ? snapshot.cases.filter(c => c.stopId === stopId) : snapshot.cases;
}

function verifySourceHashes(sourceHashes: Record<string, string>): void {
  for (const [filePath, expectedHash] of Object.entries(sourceHashes)) {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) throw new Error('Source file missing: ' + resolved);
    const actual = createHash('sha256').update(readFileSync(resolved)).digest('hex');
    if (actual !== expectedHash) throw new Error('Source hash mismatch: ' + resolved);
  }
}

function buildPrompt(caseItem: ReplayCase): string {
  return caseItem.prompt + ' Output only valid JSON. Do not use external knowledge or tools. Input: ' + JSON.stringify(caseItem.input);
}

export async function main(argv: string[]): Promise<void> {
  const config = parseArgs(argv);
  const snapshotPath = config.inputs;
  if (!existsSync(snapshotPath)) throw new Error('Inputs file not found: ' + snapshotPath);
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ReplaySnapshot;
  const selectedCases = validateSnapshot(snapshot, config.stopId);
  if (config.outDir === snapshotPath || existsSync(config.outDir)) throw new Error('Output must be a new directory');

  verifySourceHashes(snapshot.sourceHashes);

  if (!config.execute) {
    console.log(JSON.stringify({ dryRun: true, inputs: snapshotPath, outDir: config.outDir, model: config.model, reasoning: config.reasoning, stopId: config.stopId ?? null, cases: selectedCases.length }));
    return;
  }

  await checkAuth();

  mkdirSync(dirname(config.outDir), { recursive: true, mode: 0o700 });
  mkdirSync(config.outDir, { mode: 0o700 });

  const save = (name: string, value: string) => writeFileSync(resolve(config.outDir, name), value, { mode: 0o600 });
  const saveJson = (name: string, value: unknown) => save(name, JSON.stringify(value, null, 2) + '\n');
  const stopSave = (stopId: string, name: string, value: string) => writeFileSync(resolve(config.outDir, stopId, name), value, { mode: 0o600 });
  const stopSaveJson = (stopId: string, name: string, value: unknown) => stopSave(stopId, name, JSON.stringify(value, null, 2) + '\n');

  saveJson('inputs.private.json', snapshot);

  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Replay interrupted'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  const rows: Row[] = [];
  let status: 'running' | 'complete' | 'incomplete' = 'running';
  let error: string | null = null;

  const persist = () => {
    const results: Results = { status, error, publicationPassed: false, model: config.model, reasoning: config.reasoning, billing: 'ChatGPT quota', baselineIsGroundTruth: false, apiSpendUsd: 0, rows };
    saveJson('results.private.json', results);
    const lines: string[] = ['# Comparación de auditores ' + config.model + ' (' + config.reasoning + ')', '', 'Estado: ' + status, '', 'API spend: 0 (ChatGPT quota)', '', 'La comparación valida la estructura del esquema, no la corrección factual.', '', '| Stop | Estado | Tiempo ms | Desacuerdos |', '|---|---|---:|---:|'];
    for (const row of rows) {
      lines.push(`| ${row.stopId} | ${row.status} | ${row.latencyMs} | ${row.disagreements.length} |`);
    }
    for (const row of rows) {
      for (const d of row.disagreements) {
        lines.push('', `## ${row.stopId} · ${d.sentenceId}`, '', d.text, '', `${d.baseline} → ${d.candidate}: ${d.reason}`);
      }
    }
    if (error) lines.push('', 'Error: ' + error);
    save('comparison.md', lines.join('\n') + '\n');
  };

  persist();

  try {
    for (const item of selectedCases) {
      controller.signal.throwIfAborted();
      const stopDir = resolve(config.outDir, item.stopId);
      mkdirSync(stopDir, { mode: 0o700 });

      const fullSchema = compactNarrativeAuditSchemaV8(item.script, item.ids);
      const schemaPath = resolve(stopDir, 'schema.private.json');
      stopSaveJson(item.stopId, 'schema.private.json', fullSchema);

      const prompt = buildPrompt(item);
      stopSave(item.stopId, 'prompt.private.txt', prompt);

      const started = Date.now();
      const env = filterEnv(process.env);
      const output = await runCodex(prompt, stopDir, env, {
        timeoutMs: 180000,
        signal: controller.signal,
        spawnProcess: ((cmd: string, args: string[], opts: import('node:child_process').SpawnOptions) => spawn(cmd, modelAuditArgsV8(args, config.model, schemaPath, config.reasoning), opts)) as typeof spawn,
      });
      const latencyMs = Date.now() - started;

      stopSave(item.stopId, 'events.private.jsonl', output.stdout);
      stopSave(item.stopId, 'stderr.private.txt', output.stderr);

      if (output.error || output.exitCode !== 0) {
        const row: Row = { stopId: item.stopId, status: 'failed', latencyMs, disagreements: [] };
        rows.push(row);
        persist();
        throw new Error('Codex process failed for ' + item.stopId + ': ' + (output.error ?? 'exit ' + output.exitCode));
      }

      const parsed = parseJsonlOutput(output.stdout);
      if (!parsed.success) {
        const row: Row = { stopId: item.stopId, status: 'failed', latencyMs, disagreements: [] };
        rows.push(row);
        persist();
        throw new Error('JSONL parse failed for ' + item.stopId + ': ' + parsed.error);
      }

      let agentValue: unknown;
      try {
        agentValue = JSON.parse(parsed.agentMessage);
      } catch {
        const row: Row = { stopId: item.stopId, status: 'failed', latencyMs, disagreements: [] };
        rows.push(row);
        persist();
        throw new Error('Agent message is not valid JSON for ' + item.stopId);
      }

      const ajv = new Ajv({ strict: true, validateFormats: false });
      const validate = ajv.compile(fullSchema);
      if (!validate(agentValue)) {
        const row: Row = { stopId: item.stopId, status: 'failed', latencyMs, disagreements: [] };
        rows.push(row);
        persist();
        throw new Error('Schema validation failed for ' + item.stopId + ': ' + JSON.stringify(validate.errors));
      }

      let report;
      try {
        report = parseCompactNarrativeAuditV8(agentValue, item.script, item.ids);
      } catch (e) {
        const row: Row = { stopId: item.stopId, status: 'failed', latencyMs, disagreements: [] };
        rows.push(row);
        persist();
        throw new Error('Parse compact audit failed for ' + item.stopId + ': ' + (e instanceof Error ? e.message : String(e)));
      }

      const findings = report.findings.map(f => ({ sentenceId: f.sentenceId, classification: f.classification, passageIds: f.passageIds ?? [], reason: f.reason }));
      const disagreements: Disagreement[] = findings.flatMap(f => {
        const baseline = item.baseline.find(b => b.sentenceId === f.sentenceId);
        if (!baseline || baseline.classification === f.classification) return [];
        const sentence = item.script.sentences.find(s => s.sentenceId === f.sentenceId);
        return [{ sentenceId: f.sentenceId, text: sentence?.text ?? '', baseline: baseline.classification, candidate: f.classification, reason: f.reason }];
      });

      const row: Row = { stopId: item.stopId, status: 'valid', latencyMs, usage: parsed.usage, findings, disagreements };
      rows.push(row);
      persist();
    }
    status = 'complete';
  } catch (cause) {
    status = 'incomplete';
    error = cause instanceof Error ? cause.message : String(cause);
    process.exitCode = 1;
  } finally {
    persist();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }

  console.log(JSON.stringify({ status, error, outDir: config.outDir, billing: 'ChatGPT quota', apiSpendUsd: 0, baselineIsGroundTruth: false }));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Replay preflight failed; check arguments, inputs and model availability.');
    process.exitCode = 1;
  });
}
