import { PrismaClient } from '@prisma/client';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { runLocalVoxCpm, tourProjectRoot } from '../LocalVoxCpmRenderer';
import { rollbackTourUpdate, type UpdateClient } from './applyUpdate';
import { assertDisposableDatabase } from './guard';
import { dumpCatalog, type CatalogDump, type PublicTour } from './manifest';
import { Stage, PHASES, type Phase } from './stage';
import { pythonBinary, realPython } from './py';
import { imagesPhase, packagePhase, stageLocalPhase } from './phases/finish';
import { legsPhase, publicRouter } from './phases/legs';
import { cuesPhase, neutralizePhase, snapshotPhase, speechPhase } from './phases/prepare';
import { renderPhase } from './phases/render';
import { reviewPackPhase } from './phases/review';
import { verifyPhase } from './phases/verify';
import type { Ctx, Deps } from './phases/context';
import type { CatalogUpdatePackage } from './types';

export const USAGE = `catalog-regeneration <command> [options]

Commands, in order: snapshot, neutralize, cues, speech, legs, review-pack, render, images, stage-local, package, verify, publish; also status and rollback.
Options:
  --stage DIR            working directory (default $REGEN_STAGE or ~/.local/share/tour-guide/nomuvia/regeneracion-20261001)
  --tours ID,ID  --languages es,fr  --cities Valencia      work on a subset (the Valencia sample first)
  --sample-cities LIST   cities of the first lot (default Valencia)
  snapshot:      --from-dump FILE (production dump from remote-snapshot.cjs) | --from-db (DATABASE_URL), --api BASE, --no-cross-check
  neutralize / speech:  --execute / --repair spend money (DeepSeek); without them only the estimate runs
  render:        --execute starts the GPU; --max-hours N stops between jobs once N estimated hours are used; --limit-jobs N
  stage-local / verify:  --storage DIR (audio of the disposable database copy; default $AUDIO_STORAGE_PATH)
  rollback:      --package FILE   puts back the previous block in the disposable database
Nothing here writes approvals.json: those are the user's decisions.`;

export interface Parsed { command: string; flags: Record<string, string | boolean>; selection: { tours?: string[]; languages?: string[]; cities?: string[] } }

const BOOLEAN = new Set(['execute', 'repair', 'from-db', 'no-cross-check', 'confirm-production', 'help']);
export function parseArgs(argv: string[]): Parsed {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) throw new Error('Unexpected argument ' + arg);
    const name = arg.slice(2);
    if (BOOLEAN.has(name)) flags[name] = true;
    else { const value = rest[++i]; if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`); flags[name] = value; }
  }
  const list = (name: string) => (typeof flags[name] === 'string' ? (flags[name] as string).split(',').map(s => s.trim()).filter(Boolean) : undefined);
  return { command, flags, selection: { tours: list('tours'), languages: list('languages'), cities: list('cities') } };
}

export const defaultStage = () => process.env.REGEN_STAGE || join(homedir(), '.local/share/tour-guide/nomuvia/regeneracion-20261001');

function decodeWithPython(file: string): number {
  const code = 'import sys,soundfile as sf,numpy as np; a,r=sf.read(sys.argv[1],dtype="float32"); assert a.size and r>0 and np.isfinite(a).all() and np.max(np.abs(a))>1e-4; print(len(a)/r)';
  const seconds = Number(execFileSync(pythonBinary(), ['-c', code, file], { encoding: 'utf8', timeout: 60_000 }));
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid decoded audio duration');
  return seconds;
}

export function realDeps(): Deps {
  let client: PrismaClient | undefined;
  return {
    python: realPython(), render: runLocalVoxCpm, router: publicRouter(), decode: decodeWithPython,
    prisma: () => (client ??= new PrismaClient()),
    fetchJson: async url => { const r = await fetch(url, { headers: process.env.REGEN_API_KEY ? { 'X-API-Key': process.env.REGEN_API_KEY } : {} }); if (!r.ok) throw new Error(`${url} answered ${r.status}`); return r.json(); },
    now: () => new Date(), log: message => console.log(message),
  };
}

/** Runs one command. It returns the exit code and never calls process.exit, so a rehearsal can drive it with test doubles. */
export async function runCommand(parsed: Parsed, deps: Deps = realDeps()): Promise<number> {
  const { command, flags, selection } = parsed;
  if (command === 'help' || flags.help) { console.log(USAGE); return 0; }
  const stage = new Stage(typeof flags.stage === 'string' ? flags.stage : defaultStage());
  const ctx: Ctx = { stage, deps, selection, flags };
  const storage = () => { const dir = (flags.storage as string) || process.env.AUDIO_STORAGE_PATH; if (!dir) throw new Error('--storage (or AUDIO_STORAGE_PATH) is required'); return resolve(dir); };
  switch (command as Phase | 'status' | 'rollback') {
    case 'snapshot': {
      let dump: CatalogDump, source: 'production' | 'local';
      if (typeof flags['from-dump'] === 'string') { dump = JSON.parse(readFileSync(flags['from-dump'], 'utf8')); source = 'production'; }
      else if (flags['from-db']) { dump = await dumpCatalog(deps.prisma!(), 'local database', undefined, selection.tours); source = 'local'; }
      else throw new Error('snapshot needs --from-dump FILE or --from-db');
      let api: Record<string, PublicTour | null> | undefined;
      if (typeof flags.api === 'string') {
        api = {};
        for (const row of dump.tours) {
          api[row.tour.id] = await deps.fetchJson!(`${(flags.api as string).replace(/\/$/, '')}/api/backend/tours/${row.tour.id}`).catch(() => null) as PublicTour | null;
          await new Promise(done => setTimeout(done, 150));   // a public server: ask politely
        }
      }
      snapshotPhase(ctx, { dump, source, api, skipCrossCheck: !!flags['no-cross-check'] });
      return 0;
    }
    case 'neutralize': neutralizePhase(ctx, { execute: !!flags.execute }); return 0;
    case 'cues': cuesPhase(ctx); return 0;
    case 'speech': speechPhase(ctx, { repair: !!flags.repair }); return 0;
    case 'legs': await legsPhase(ctx); return 0;
    case 'review-pack': reviewPackPhase(ctx); return 0;
    case 'render': {
      const result = await renderPhase(ctx, { execute: !!flags.execute, maxHours: flags['max-hours'] ? Number(flags['max-hours']) : undefined, limitJobs: flags['limit-jobs'] ? Number(flags['limit-jobs']) : undefined });
      return result.failedPieces.length ? 1 : 0;
    }
    case 'images': imagesPhase(ctx); return 0;
    case 'stage-local': { const s = await stageLocalPhase(ctx, { storageDir: storage() }); return s.failed || s.excluded ? 1 : 0; }
    case 'package': packagePhase(ctx); return 0;
    case 'verify': return (await verifyPhase(ctx, { storageDir: storage() })).ok ? 0 : 1;
    case 'publish': return publish(ctx);
    case 'rollback': {
      assertDisposableDatabase(process.env.DATABASE_URL);
      if (typeof flags.package !== 'string') throw new Error('rollback needs --package FILE');
      const pkg = JSON.parse(readFileSync(flags.package, 'utf8')) as CatalogUpdatePackage;
      let failed = 0;
      for (const entry of pkg.tours) {
        const outcome = await rollbackTourUpdate(deps.prisma!() as unknown as UpdateClient, entry);
        if (outcome.status === 'failed') failed++;
        deps.log(`${entry.tourId}: ${outcome.status}${outcome.reason ? ' ' + outcome.reason : ''}`);
      }
      return failed ? 1 : 0;
    }
    case 'status': console.log(JSON.stringify(status(stage), null, 2)); return 0;
    default: console.error(`Unknown command ${command}\n\n${USAGE}`); return 2;
  }
}

/** Production is reached only by the scripts in deployment/pilot/catalog, with the user's explicit authorisation. */
function publish(ctx: Ctx): number {
  const { stage, flags, deps } = ctx;
  stage.require('publish');
  const approval = stage.approved('publish');
  if (!approval?.authorizationReference?.trim()) throw new Error('publish needs the user\'s "publish" approval in approvals.json');
  const report = stage.read<{ ok: boolean }>('verify', 'report.json');
  if (!report.ok) throw new Error('verify did not pass; nothing is published');
  const script = join(tourProjectRoot(), 'deployment/pilot/catalog/update-transfer.sh');
  if (!flags['confirm-production']) {
    deps.log(`Ready to publish. Authorised by: ${approval.authorizationReference}\nTo upload the package and install it, run again with --confirm-production, or run:\n  ${script} ${stage.path('package')}`);
    return 0;
  }
  const result = spawnSync('bash', [script, stage.path('package')], { stdio: 'inherit' });
  return result.status ?? 1;
}

export function status(stage: Stage) {
  if (!stage.exists('state.json')) return { stage: stage.dir, started: false };
  const state = stage.state();
  const phases = Object.fromEntries(PHASES.map(phase => [phase, stage.exists('receipts', phase + '.json') ? (stage.receiptProblem(phase) ?? 'ok') : 'not run']));
  const count = (dir: string) => { try { return readdirSync(stage.path(dir)).filter(f => f.endsWith('.json') && !f.startsWith('base-') && f !== 'baseline.json').length; } catch { return 0; } };
  return { stage: stage.dir, started: true, tours: stage.read<{ tours: unknown[] }>('manifest.json').tours.length, phases,
    perTour: { neutral: count('neutral'), cues: count('cues'), speech: count('speech'), legs: count('legs'), rendered: count('render'), images: count('images'), stagedLocal: count('stage-local') },
    excluded: state.excluded, approvals: stage.approvals().map(a => `${a.scope}:${a.decision}`) };
}

/**
 * The locks a command takes (plan 04 section 3). Two runs never write the same stage, but the render lasts hours and legs/images write
 * files of their own (legs/, images/, their receipt) that the render never reads, so those two may run beside it:
 *  - render takes run.lock; legs and images take side.lock; every other command takes both, so it waits for either to finish.
 */
export function locksFor(command: string): string[] {
  if (command === 'render') return ['run.lock'];
  if (command === 'legs' || command === 'images') return ['side.lock'];
  return ['run.lock', 'side.lock'];
}

/** Entry point: runs under `flock` so two runs never write the same stage. */
export async function main(argv: string[], script = process.argv[1]): Promise<number> {
  const parsed = parseArgs(argv);
  const readOnly = ['help', 'status'].includes(parsed.command);
  if (!readOnly && !process.env.REGEN_LOCKED) {
    const stage = new Stage(typeof parsed.flags.stage === 'string' ? parsed.flags.stage : defaultStage());
    mkdirSync(stage.dir, { recursive: true });
    let command = [process.execPath, ...process.execArgv, script, ...argv];
    for (const lock of locksFor(parsed.command).reverse()) command = ['flock', '-n', '-E', '75', stage.path(lock), ...command];
    const child = spawnSync(command[0], command.slice(1), { stdio: 'inherit', env: { ...process.env, REGEN_LOCKED: '1' } });
    if (child.status === 75) console.error('Another run holds a lock of ' + stage.dir + ' (run.lock / side.lock)');
    return child.status ?? 1;
  }
  return runCommand(parsed);
}
