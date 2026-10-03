import { spawnSync } from 'child_process';
import { join, resolve } from 'path';
import { tourProjectRoot } from '../LocalVoxCpmRenderer';

export interface NormalizedPiece { pieceId: string; spokenText: string; changes: string[][]; violations: Array<Record<string, unknown>>; warnings: unknown[]; fixedPoint: boolean }
export interface NormalizeResult { speechVersion: string; pieces: NormalizedPiece[] }
export interface CheckedPiece { pieceId: string; violations: Array<Record<string, unknown>>; warnings: unknown[]; fixedPoint: boolean }

export interface NeutralPieceIn { kind: 'introduction' | 'stop'; pieceId: string; name?: string; text: string }
export interface NeutralPieceOut { pieceId: string; role: string; original: string; body: string; edits: unknown[]; findingsBefore: unknown[]; status: 'ok' | 'needs_manual'; attempts: number; reasons?: string[] }
export interface NeutralTourOut { language: string; pieces: NeutralPieceOut[]; excluded: boolean }
export interface Estimate { requests?: number; pieces?: number; piecesWithResidue?: number; sentences?: number; approxInputTokens: number; approxOutputTokens: number; worstCaseUsd: number }
export interface RepairedPiece { pieceId: string; spokenText: string; status: 'ok' | 'needs_manual' | 'clean'; llmRepairs: unknown[]; violations: Array<Record<string, unknown>>; attempts: number; reasons: string[] }

/**
 * The Python tools of this run. Every method that spends money takes `billable: true` explicitly: the estimate is free and is
 * the default. The user's authorisation is needed before anything is run with it (plan 04 section 3).
 */
export interface PythonBridge {
  normalize(language: string, country: string, pieces: Array<{ pieceId: string; text: string }>): NormalizeResult;
  check(language: string, pieces: Array<{ pieceId: string; spokenText: string }>): CheckedPiece[];
  neutralizeEstimate(language: string, tour: { tourId: string; pieces: NeutralPieceIn[] }): Estimate;
  neutralize(language: string, tour: { tourId: string; pieces: NeutralPieceIn[] }, stageDir: string, billable: true): NeutralTourOut;
  repairEstimate(language: string, pieces: Array<{ pieceId: string; spokenText: string }>): Estimate;
  repair(language: string, pieces: Array<{ pieceId: string; spokenText: string }>, stageDir: string, billable: true): RepairedPiece[];
}

export const pythonBinary = () => process.env.VOXCPM_PYTHON || join(tourProjectRoot(), 'pods/voxcpm-pod/.venv/bin/python');

function run(script: string, args: string[], input?: string, expectOk = true): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(pythonBinary(), [script, ...args], { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, cwd: resolve(script, '..') });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.stderr.trim()) console.error(`[${script.split('/').pop()}] ${result.stderr.trim().split('\n').slice(-12).join('\n')}`);   // a failed helper must not be silent
  if (expectOk && result.status !== 0) throw new Error(`${script} ${args.join(' ')} failed (${result.status}): ${result.stderr.slice(-2000)}`);
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

function withTemp<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'regen-py-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function realPython(): PythonBridge {
  const root = tourProjectRoot();
  const normalizer = join(root, 'pods/voxcpm-pod/scripts/speech-normalize.py');
  const neutralizer = process.env.REGEN_NEUTRALIZE_SCRIPT || join(root, 'backend/scripts/admin/neutralize.py');
  const repairer = process.env.REGEN_REPAIR_SCRIPT || join(root, 'backend/scripts/admin/speech_repair.py');
  return {
    normalize: (language, country, pieces) => JSON.parse(run(normalizer, ['--lang', language, '--country', country], JSON.stringify({ pieces })).stdout),
    check: (language, pieces) => JSON.parse(run(normalizer, ['--check', '--lang', language], JSON.stringify({ pieces }), false).stdout).pieces,
    neutralizeEstimate: (language, tour) => withTemp(dir => {
      writeFileSync(join(dir, 'in.json'), JSON.stringify(tour));
      return JSON.parse(run(neutralizer, ['--lang', language, '--in', join(dir, 'in.json'), '--estimate']).stdout);
    }),
    neutralize: (language, tour, stageDir) => withTemp(dir => {
      writeFileSync(join(dir, 'in.json'), JSON.stringify(tour));
      run(neutralizer, ['--lang', language, '--in', join(dir, 'in.json'), '--out', join(dir, 'out.json'), '--stage', stageDir, '--execute'], undefined, false);
      return JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')).tours[0];
    }),
    repairEstimate: (language, pieces) => withTemp(dir => {
      writeFileSync(join(dir, 'in.json'), JSON.stringify({ pieces }));
      return JSON.parse(run(repairer, ['--lang', language, '--in', join(dir, 'in.json'), '--estimate']).stdout);
    }),
    repair: (language, pieces, stageDir) => withTemp(dir => {
      writeFileSync(join(dir, 'in.json'), JSON.stringify({ pieces }));
      run(repairer, ['--lang', language, '--in', join(dir, 'in.json'), '--out', join(dir, 'out.json'), '--stage', stageDir, '--execute'], undefined, false);
      return JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')).pieces;
    }),
  };
}
