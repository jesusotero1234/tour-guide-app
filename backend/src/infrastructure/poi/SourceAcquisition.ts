import { mkdirSync, writeFileSync, renameSync, appendFileSync } from 'fs';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { Agent } from 'https';
import { connect } from 'tls';

export const sourceHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function sourceRecord(name: string, value: unknown): void {
  const directory = process.env.SOURCE_ACQUISITION_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const target = join(directory, name + '.json');
  const temporary = target + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, target);
}
export function sourceEvent(value: unknown): void {
  const directory = process.env.SOURCE_ACQUISITION_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  appendFileSync(join(directory, 'events.jsonl'), JSON.stringify(value) + '\n', { mode: 0o600 });
}
export class SourceTimingAgent extends Agent {
  readonly timings: Record<string, number | null> = { dnsMs: null, connectMs: null, tlsMs: null };
  private started = Date.now();
  createConnection(options: any): any {
    const socket = connect(options);
    socket?.once('lookup', () => { this.timings.dnsMs = Date.now() - this.started; });
    socket?.once('connect', () => { this.timings.connectMs = Date.now() - this.started; });
    socket?.once('secureConnect', () => { this.timings.tlsMs = Date.now() - this.started; });
    return socket;
  }
}
