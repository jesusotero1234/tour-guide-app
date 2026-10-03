import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

export const PHASES = ['snapshot', 'neutralize', 'cues', 'speech', 'legs', 'review-pack', 'render', 'images', 'stage-local', 'package', 'verify', 'publish'] as const;
export type Phase = typeof PHASES[number];

/** Which receipts must be valid before a phase may run (plan 04 section 3). */
export const REQUIRES: Record<Phase, Phase[]> = {
  snapshot: [], neutralize: ['snapshot'], cues: ['snapshot'], speech: ['neutralize', 'cues'], legs: ['snapshot'], 'review-pack': ['speech', 'legs'],
  render: ['speech'], images: ['neutralize'], 'stage-local': ['render', 'images', 'legs'], package: ['stage-local'], verify: ['package'], publish: ['verify'],
};

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export interface Approval { scope: 'sample-valencia' | 'full-catalog' | 'cue-templates' | 'publish'; tours?: string[]; decision: 'approved' | 'rejected' | 'changes-requested'; notes?: string; authorizationReference?: string; at?: string }

export interface State { version: 1; manifestSha256: string; excluded: Record<string, { phase: string; reason: string }> }

export interface Receipt { version: 1; phase: Phase; stage: string; at: string; files: Record<string, string>; requires: Partial<Record<Phase, string>>; extra?: Record<string, unknown> }

/** The working directory of a run: closed manifest, state bound to its hash, per-tour files and content-bound receipts. */
export class Stage {
  readonly dir: string;
  constructor(dir: string) { this.dir = resolve(dir); }

  path(...parts: string[]) { return join(this.dir, ...parts); }
  exists(...parts: string[]) { return existsSync(this.path(...parts)); }
  read<T>(...parts: string[]): T { return JSON.parse(readFileSync(this.path(...parts), 'utf8')) as T; }
  readOr<T>(fallback: T, ...parts: string[]): T { return this.exists(...parts) ? this.read<T>(...parts) : fallback; }

  /** Atomic replace; files hold per-tour results that a resumed run overwrites with identical bytes. */
  write(value: unknown, ...parts: string[]): string {
    const target = this.path(...parts);
    mkdirSync(dirname(target), { recursive: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(value, null, 1) + '\n', { mode: 0o600 });
    renameSync(temporary, target);
    return target;
  }

  /** The manifest and the snapshot are opened with `wx`: a second run never overwrites what the first one was built on. */
  writeOnce(value: unknown, ...parts: string[]): string {
    const target = this.path(...parts);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(value, null, 1) + '\n', { flag: 'wx', mode: 0o600 });
    return target;
  }

  /** The JSON files directly inside a folder of the stage (not its subfolders), as absolute paths. */
  list(...parts: string[]): string[] {
    return existsSync(this.path(...parts)) ? readdirSync(this.path(...parts), { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.json')).map(e => this.path(...parts, e.name)).sort() : [];
  }

  fileSha(...parts: string[]) { return sha256(readFileSync(this.path(...parts))); }

  state(): State {
    if (!this.exists('state.json')) throw new Error('There is no state.json: run snapshot first');
    return this.read<State>('state.json');
  }
  saveState(state: State) { this.write(state, 'state.json'); }

  /** Marks a tour as out of this regeneration: it keeps its current content, valid and with fixed order. */
  exclude(tourId: string, phase: string, reason: string) {
    const state = this.state();
    state.excluded[tourId] = { phase, reason };
    this.saveState(state);
  }
  /** Takes back an exclusion that a phase recorded, because that phase has now succeeded for the tour. */
  include(tourId: string, phase: string) {
    const state = this.state();
    if (state.excluded[tourId]?.phase === phase) { delete state.excluded[tourId]; this.saveState(state); }
  }
  isExcluded(tourId: string) { return !!this.state().excluded[tourId]; }

  /** A receipt binds a phase to the bytes of its outputs and to the receipts it was built on. */
  writeReceipt(phase: Phase, files: string[], extra?: Record<string, unknown>): Receipt {
    const requires: Receipt['requires'] = {};
    for (const needed of REQUIRES[phase]) requires[needed] = this.fileSha('receipts', needed + '.json');
    const receipt: Receipt = { version: 1, phase, stage: this.dir, at: new Date().toISOString(), requires,
      files: Object.fromEntries([...new Set(files)].sort().map(file => [relative(this.dir, resolve(file)), sha256(readFileSync(resolve(file)))])), ...(extra ? { extra } : {}) };
    this.write(receipt, 'receipts', phase + '.json');
    return receipt;
  }

  /** Returns why a receipt is not valid, or null when every file and every receipt it depends on is unchanged. */
  receiptProblem(phase: Phase): string | null {
    if (!this.exists('receipts', phase + '.json')) return `the ${phase} phase has not run`;
    const receipt = this.read<Receipt>('receipts', phase + '.json');
    if (receipt.version !== 1 || receipt.phase !== phase || receipt.stage !== this.dir) return `the receipt of ${phase} belongs to another run`;
    for (const [file, digest] of Object.entries(receipt.files)) {
      if (!existsSync(this.path(file)) || sha256(readFileSync(this.path(file))) !== digest) return `${file} changed after ${phase} ran`;
    }
    for (const [needed, digest] of Object.entries(receipt.requires)) {
      if (!existsSync(this.path('receipts', needed + '.json')) || this.fileSha('receipts', needed + '.json') !== digest) return `${phase} was built on a different ${needed}`;
      const upstream = this.receiptProblem(needed as Phase);          // a stale link anywhere up the chain makes this one stale
      if (upstream) return `${phase} was built on ${needed}, which is stale: ${upstream}`;
    }
    return null;
  }

  /** Refuses to run a phase when the receipt of a previous one does not match. */
  require(phase: Phase) {
    for (const needed of REQUIRES[phase]) {
      const problem = this.receiptProblem(needed);
      if (problem) throw new Error(`Cannot run ${phase}: ${problem}`);
    }
  }

  approvals(): Approval[] {
    return this.exists('approvals.json') ? this.read<{ approvals: Approval[] }>('approvals.json').approvals ?? [] : [];
  }

  /** The user's decisions only: this tool never writes an approval. */
  approved(scope: Approval['scope'], tourId?: string): Approval | undefined {
    return this.approvals().filter(a => a.scope === scope && a.decision === 'approved' && (!a.tours?.length || !tourId || a.tours.includes(tourId))).pop();
  }
}
