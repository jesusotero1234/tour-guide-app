import { spawn } from 'child_process';
import { closeSync, openSync } from 'fs';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

export interface AudioRenderInput {
  language: string;
  stops: Array<{ id: string; text: string }>;
}
export interface AudioRenderProgress {
  phase: string;
  completedStops: number;
  totalStops: number;
  currentStopId?: string;
  completedChunks?: number;
  totalChunks?: number;
  results: Array<{ id: string; filename: string; durationSeconds: number }>;
  error?: string;
}

export const tourProjectRoot = () => resolve(process.env.TOUR_PROJECT_ROOT || join(__dirname, '../../..'));

export async function readRenderProgress(jobDir: string): Promise<AudioRenderProgress | null> {
  try {
    return JSON.parse(await readFile(join(jobDir, 'progress.json'), 'utf8')) as AudioRenderProgress;
  } catch {
    return null;
  }
}

async function run(command: string, args: string[], cwd: string, logPath: string, timeoutMs: number): Promise<void> {
  const log = openSync(logPath, 'a');
  try {
    await new Promise<void>((accept, reject) => {
      const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', log, log] });
      let timedOut = false;
      let forceKill: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Give the supervisor time to stop TTS and restore Qwen.
        forceKill = setTimeout(() => child.kill('SIGKILL'), 300_000);
      }, timeoutMs);
      const clear = () => {
        clearTimeout(timeout);
        if (forceKill) clearTimeout(forceKill);
      };
      child.once('error', (error) => { clear(); reject(error); });
      child.once('close', (code) => {
        clear();
        if (code === 0 && !timedOut) accept();
        else reject(new Error(timedOut ? 'Audio batch timed out' : 'Audio batch failed; see render.log'));
      });
    });
  } finally {
    closeSync(log);
  }
}

export async function runLocalVoxCpm(
  input: AudioRenderInput, jobDir: string, outputDir: string,
): Promise<AudioRenderProgress> {
  const root = tourProjectRoot();
  const python = process.env.VOXCPM_PYTHON || join(root, 'pods/voxcpm-pod/.venv/bin/python');
  const script = join(root, 'pods/voxcpm-pod/scripts/render-tour.py');
  const supervisor = join(root, 'scripts/with-tts-gpu.py');
  await Promise.all([access(python), access(script), access(supervisor), mkdir(jobDir, { recursive: true }),
    mkdir(outputDir, { recursive: true })]);
  const inputPath = join(jobDir, 'input.json');
  await writeFile(inputPath, JSON.stringify(input), 'utf8');
  const args = [script, '--input', inputPath, '--output', outputDir, '--progress', join(jobDir, 'progress.json')];
  const log = join(jobDir, 'render.log');
  await run(python, [...args, '--prepare-only'], root, log, 30_000);
  const seconds = Number(process.env.VOXCPM_BATCH_TIMEOUT_SECONDS || 7200);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 43200) throw new Error('Invalid audio timeout');
  await run('python3', [supervisor, '--report', join(jobDir, 'gpu-handoff.json'),
    '--timeout', String(seconds), '--parent-pid', String(process.pid), '--', python, ...args],
  root, log, (seconds + 600) * 1000);
  const progress = await readRenderProgress(jobDir);
  if (progress?.phase !== 'rendered' || progress.results?.length !== input.stops.length) {
    throw new Error('Audio batch did not finish all stops');
  }
  return progress;
}
