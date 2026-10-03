import { readFileSync } from 'fs';
import { join } from 'path';
import { audioDisclosure } from '../../AudioProvenance';
import { stopsInOrder } from '../legsPlan';
import { cueDefinitions, cueKey, placeName, type ManifestTour } from '../plan';
import { canonicalJson, crossCheck, manifestFromDump, manifestSha256, type CatalogDump, type PublicTour } from '../manifest';
import type { NeutralPieceIn, NeutralPieceOut } from '../py';
import { sha256 } from '../stage';
import { regenUuid } from '../ids';
import { manifestOf, requireSampleApproved, selectRetriable, selectTours, type Ctx } from './context';

/* ---------------------------------------------------------------- snapshot */

export interface SnapshotOptions { dump: CatalogDump; source: 'production' | 'local'; api?: Record<string, PublicTour | null>; skipCrossCheck?: boolean; runId?: string }

/** Closes the manifest. In production the snapshot must agree with the public API or nothing is built on it (plan 04 section 4). */
export function snapshotPhase(ctx: Ctx, options: SnapshotOptions) {
  const { stage } = ctx;
  const runId = options.runId ?? regenUuid('run', options.dump.createdAt, options.source);
  const manifest = manifestFromDump(options.dump, runId, options.source, ctx.deps.now());
  let crossChecked = false;
  if (options.api) {
    const problems = crossCheck(manifest, options.api);
    if (problems.length) throw new Error('The snapshot does not match the public API:\n' + problems.slice(0, 20).join('\n') + (problems.length > 20 ? `\n... and ${problems.length - 20} more` : ''));
    crossChecked = true;
  } else if (options.source === 'production' && !options.skipCrossCheck) {
    throw new Error('A production snapshot must be cross-checked against the public API (--api <base url>)');
  }
  const wanted = manifestSha256(manifest);
  if (stage.exists('manifest.json')) {
    if (manifestSha256(manifestOf(stage)) !== wanted) throw new Error('This run already has a different manifest; use a new stage directory');
  } else {
    stage.writeOnce(manifest, 'manifest.json');
    stage.write({ version: 1, manifestSha256: wanted, excluded: {} }, 'state.json');
    stage.writeOnce(options.dump, 'snapshot.json');
  }
  const counts = { tours: manifest.tours.length, stops: manifest.tours.reduce((n, t) => n + t.places.length, 0), notAdmitted: options.dump.notAdmitted.length };
  ctx.deps.log(`snapshot: ${counts.tours} tours, ${counts.stops} stops, ${counts.notAdmitted} not admitted${crossChecked ? ', cross-checked with the API' : ''}`);
  stage.writeReceipt('snapshot', [stage.path('manifest.json'), stage.path('snapshot.json')], { ...counts, crossChecked, source: options.source });
  return { manifest, counts, crossChecked };
}

/* --------------------------------------------------------------- neutralize */

export const neutralInput = (tour: ManifestTour): NeutralPieceIn[] => [
  { kind: 'introduction', pieceId: 'introduction', text: tour.introduction },
  ...stopsInOrder(tour.places).map(p => ({ kind: 'stop' as const, pieceId: p.placeId, name: placeName(p), text: p.description })),
];

export interface NeutralFile {
  tourId: string; language: string; inputSha: string; source: 'no-findings' | 'model'; excluded: boolean;
  bodies: { introduction: string; places: Record<string, string> }; pieces: NeutralPieceOut[];
}

/** Without --execute only the estimate runs (free). Tours with nothing to remove are completed without any call. */
export function neutralizePhase(ctx: Ctx, options: { execute: boolean }) {
  const { stage, deps } = ctx;
  stage.require('neutralize');
  const todo = selectRetriable(ctx, 'neutralize');
  const summary = { done: 0, skippedUnchanged: 0, noFindings: 0, pending: 0, requests: 0, usd: 0, excluded: 0 };
  for (const tour of todo) {
    const pieces = neutralInput(tour), inputSha = sha256(canonicalJson(pieces));
    const file = ['neutral', tour.tourId + '.json'];
    const existing = stage.readOr<NeutralFile | null>(null, ...file);
    if (existing && existing.inputSha === inputSha && !existing.excluded) { summary.skippedUnchanged++; continue; }   // a failed tour is tried again
    const estimate = deps.python.neutralizeEstimate(tour.language, { tourId: tour.tourId, pieces });
    let result: NeutralFile;
    if (!estimate.requests) {
      result = { tourId: tour.tourId, language: tour.language, inputSha, source: 'no-findings', excluded: false,
        bodies: { introduction: tour.introduction, places: Object.fromEntries(tour.places.map(p => [p.placeId, p.description])) },
        pieces: pieces.map(p => ({ pieceId: p.pieceId, role: p.kind, original: p.text, body: p.text, edits: [], findingsBefore: [], status: 'ok' as const, attempts: 0 })) };
      summary.noFindings++;
    } else if (!options.execute) {
      summary.pending++; summary.requests += estimate.requests; summary.usd += estimate.worstCaseUsd;
      continue;
    } else {
      requireSampleApproved(ctx, tour, 'Neutralizing (billable)');
      // One budget ledger per tour: the guard of the editorial budget (0.50 USD) is per ledger, and a tour costs a few cents.
      const out = deps.python.neutralize(tour.language, { tourId: tour.tourId, pieces }, stage.path('neutralize-work', tour.tourId), true);
      const by = new Map(out.pieces.map(p => [p.pieceId, p]));
      result = { tourId: tour.tourId, language: tour.language, inputSha, source: 'model', excluded: out.excluded,
        bodies: { introduction: by.get('introduction')?.body ?? tour.introduction, places: Object.fromEntries(tour.places.map(p => [p.placeId, by.get(p.placeId)?.body ?? p.description])) }, pieces: out.pieces };
      stage.include(tour.tourId, 'neutralize');
      if (out.excluded) { stage.exclude(tour.tourId, 'neutralize', 'a piece stayed in needs_manual: ' + out.pieces.filter(p => p.status === 'needs_manual').map(p => p.pieceId).join(', ')); summary.excluded++; }
    }
    stage.write(result, ...file);
    summary.done++;
  }
  deps.log(`neutralize: ${JSON.stringify({ ...summary, usd: Math.round(summary.usd * 100) / 100 })}`);
  if (stage.list('neutral').length) stage.writeReceipt('neutralize', stage.list('neutral'), { ...summary, selectedTours: todo.length });
  return summary;
}

/* --------------------------------------------------------------------- cues */

export interface CueFile { tourId: string; language: string; templatesSha: string; cues: Array<{ key: string; kind: string; placeId?: string; text: string }> }
const TEMPLATES = join(__dirname, '../../tour-cue-templates.json');
export const templatesSha = () => sha256(readFileSync(TEMPLATES));

export function cuesPhase(ctx: Ctx) {
  const { stage, deps } = ctx;
  stage.require('cues');
  const tours = selectTours(ctx);
  for (const tour of tours) {
    const file: CueFile = { tourId: tour.tourId, language: tour.language, templatesSha: templatesSha(),
      cues: cueDefinitions(tour).map(c => ({ key: cueKey(c), kind: c.kind, ...(c.placeId ? { placeId: c.placeId } : {}), text: c.text })) };
    if (file.cues.length !== tour.places.length * 2 + 1 || file.cues.some(c => !c.text.trim() || c.text.includes('{'))) throw new Error('Incomplete link clips for ' + tour.tourId);
    stage.write(file, 'cues', tour.tourId + '.json');
  }
  deps.log(`cues: ${tours.length} tours, ${tours.reduce((n, t) => n + t.places.length * 2 + 1, 0)} link clips`);
  if (stage.list('cues').length) stage.writeReceipt('cues', stage.list('cues'), { templatesSha: templatesSha() });
  return { tours: tours.length };
}

/* ------------------------------------------------------------------- speech */

export interface SpeechPiece { pieceId: string; spokenText: string; changes: string[][]; status: 'clean' | 'residue' | 'repaired' | 'needs_manual'; violations: Array<Record<string, unknown>>; llmRepairs?: unknown[] }
export interface SpeechFile {
  tourId: string; language: string; speechVersion: string; inputSha: string; ready: boolean;
  introductionSpokenText: string; places: Record<string, string>; cues: Record<string, string>; pieces: SpeechPiece[];
}

const cueSpeechId = (key: string) => 'cue:' + key;

/** Normalises every text of a tour (introduction, stops, link clips), checks the gate, and with --repair fixes residues. */
export function speechPhase(ctx: Ctx, options: { repair: boolean }) {
  const { stage, deps } = ctx;
  stage.require('speech');
  const summary = { tours: 0, ready: 0, withResidue: 0, repaired: 0, excluded: 0, waitingForNeutral: 0, estimate: { pieces: 0, usd: 0 } };
  const residueByLanguage = new Map<string, Array<{ tourId: string; pieceId: string; spokenText: string }>>();
  for (const tour of selectRetriable(ctx, 'speech')) {
    if (!stage.exists('neutral', tour.tourId + '.json') || stage.state().excluded[tour.tourId]?.phase === 'neutralize') { summary.waitingForNeutral++; continue; }
    const neutral = stage.read<NeutralFile>('neutral', tour.tourId + '.json');
    const cues = stage.read<CueFile>('cues', tour.tourId + '.json');
    const texts = [{ pieceId: 'introduction', text: neutral.bodies.introduction },
      ...stopsInOrder(tour.places).map(p => ({ pieceId: p.placeId, text: neutral.bodies.places[p.placeId] })), ...cues.cues.map(c => ({ pieceId: cueSpeechId(c.key), text: c.text }))];
    const inputSha = sha256(canonicalJson({ texts, country: tour.countryCode, templates: cues.templatesSha }));
    const file = ['speech', tour.tourId + '.json'];
    const existing = stage.readOr<SpeechFile | null>(null, ...file);
    // A file that is not ready is rebuilt: the rules or the lexicon may have changed since, and repaired pieces come back from their saved calls.
    let result = existing && existing.inputSha === inputSha && existing.ready ? existing : null;
    if (!result) {
      const normalized = deps.python.normalize(tour.language, tour.countryCode, texts);
      const pieces: SpeechPiece[] = normalized.pieces.map(p => ({ pieceId: p.pieceId, spokenText: p.spokenText, changes: p.changes,
        status: p.violations.length || !p.fixedPoint ? 'residue' : 'clean', violations: p.violations }));
      result = assembleSpeech(tour, pieces, normalized.speechVersion, inputSha);
      // The introduction is spoken after the AI-voice notice: the whole text must still be a fixed point of the sanitizer and pass the gate.
      const full = deps.python.check(tour.language, [{ pieceId: 'introduction-with-notice', spokenText: audioDisclosure(tour.language) + '\n\n' + result.introductionSpokenText }])[0];
      if (full.violations.length || !full.fixedPoint) markResidue(result, 'introduction', full.violations);
    }
    if (options.repair) result = repairResidues(ctx, tour, result, summary);
    stage.write(result, ...file);
    summary.tours++;
    if (result.ready) { summary.ready++; stage.include(tour.tourId, 'speech'); }
    else {
      summary.withResidue++;
      const residue = result.pieces.filter(p => p.status === 'residue').map(p => ({ tourId: tour.tourId, pieceId: p.pieceId, spokenText: p.spokenText }));
      residueByLanguage.set(tour.language, [...(residueByLanguage.get(tour.language) ?? []), ...residue]);
    }
  }
  for (const [language, pieces] of residueByLanguage) {
    if (!pieces.length) continue;
    const estimate = deps.python.repairEstimate(language, pieces.map((p, i) => ({ pieceId: `${p.tourId}:${p.pieceId}`, spokenText: p.spokenText })));
    summary.estimate.pieces += estimate.piecesWithResidue ?? 0; summary.estimate.usd += estimate.worstCaseUsd;
  }
  summary.estimate.usd = Math.round(summary.estimate.usd * 10000) / 10000;
  deps.log(`speech: ${JSON.stringify(summary)}`);
  if (stage.list('speech').length) stage.writeReceipt('speech', stage.list('speech'), { ...summary });
  return summary;
}

function assembleSpeech(tour: ManifestTour, pieces: SpeechPiece[], speechVersion: string, inputSha: string): SpeechFile {
  const by = new Map(pieces.map(p => [p.pieceId, p]));
  return { tourId: tour.tourId, language: tour.language, speechVersion, inputSha, ready: pieces.every(p => p.status === 'clean' || p.status === 'repaired'),
    introductionSpokenText: by.get('introduction')!.spokenText,
    places: Object.fromEntries(tour.places.map(p => [p.placeId, by.get(p.placeId)!.spokenText])),
    cues: Object.fromEntries(pieces.filter(p => p.pieceId.startsWith('cue:')).map(p => [p.pieceId.slice(4), p.spokenText])), pieces };
}

function markResidue(file: SpeechFile, pieceId: string, violations: Array<Record<string, unknown>>) {
  const piece = file.pieces.find(p => p.pieceId === pieceId)!;
  piece.status = 'residue'; piece.violations = violations;
  file.ready = false;
}

function repairResidues(ctx: Ctx, tour: ManifestTour, file: SpeechFile, summary: { repaired: number; excluded: number }): SpeechFile {
  const residue = file.pieces.filter(p => p.status === 'residue');
  if (!residue.length) return file;
  requireSampleApproved(ctx, tour, 'Repairing spoken text (billable)');
  const repaired = ctx.deps.python.repair(tour.language, residue.map(p => ({ pieceId: p.pieceId, spokenText: p.spokenText })), ctx.stage.path('speech-work', tour.tourId), true);
  const by = new Map(repaired.map(r => [r.pieceId, r]));
  const pieces = file.pieces.map(p => {
    const r = by.get(p.pieceId);
    if (!r || p.status !== 'residue') return p;
    return { ...p, spokenText: r.spokenText, status: r.status === 'needs_manual' ? 'needs_manual' as const : 'repaired' as const, violations: r.violations, llmRepairs: r.llmRepairs };
  });
  const next = assembleSpeech(tour, pieces, file.speechVersion, file.inputSha);
  summary.repaired += pieces.filter(p => p.status === 'repaired').length;
  if (pieces.some(p => p.status === 'needs_manual')) {
    ctx.stage.exclude(tour.tourId, 'speech', 'unresolved spoken text: ' + pieces.filter(p => p.status === 'needs_manual').map(p => p.pieceId).join(', '));
    summary.excluded++;
  }
  return next;
}
