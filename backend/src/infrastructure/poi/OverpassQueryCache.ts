import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { RawPoi } from '../../domain/poi/RawPoi';

const DAY = 86400000;
interface Entry { version: 1; cityKey: string; queryHash: string; fetchedAt: number; expiresAt: number; pois: RawPoi[] }
export class OverpassQueryCache {
  private pending = new Map<string, Promise<RawPoi[]>>();
  private lastCleanup = -Infinity;
  constructor(readonly directory: string, readonly ttlMs = 7 * DAY, private now = Date.now) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid Overpass cache TTL');
  }
  private async read(key: string): Promise<Entry | null> {
    try {
      const e = JSON.parse(await fs.readFile(join(this.directory, key + '.json'), 'utf8'));
      if (e.version !== 1 || typeof e.cityKey !== 'string' || typeof e.queryHash !== 'string'
        || !Number.isFinite(e.fetchedAt) || !Number.isFinite(e.expiresAt) || !Array.isArray(e.pois)
        || !e.pois.every((p: RawPoi) => p && ['node', 'way', 'relation'].includes(p.osmType)
          && Number.isFinite(p.osmId) && Number.isFinite(p.lat) && Number.isFinite(p.lng)
          && typeof p.name === 'string' && p.tags && typeof p.tags === 'object')) return null;
      return e;
    } catch { return null; }
  }
  private async write(key: string, entry: Entry): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, key + '.' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
      await fs.rename(temporary, join(this.directory, key + '.json'));
    } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  async getOrFetch(cityKey: string, query: string, load: () => Promise<RawPoi[]>): Promise<RawPoi[]> {
    if (!cityKey.trim()) throw new Error('Missing cache city identity');
    const queryHash = createHash('sha256').update(query).digest('hex');
    const key = createHash('sha256').update(JSON.stringify([1, cityKey, queryHash])).digest('hex');
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = (async () => {
      const entry = await this.read(key);
      if (entry && entry.cityKey === cityKey && entry.queryHash === queryHash && entry.expiresAt > this.now()) {
        console.log(`[OverpassCache] hit city=${cityKey} pois=${entry.pois.length}`);
        return entry.pois;
      }
      const pois = await load(); // Failure preserves the previous entry and propagates.
      const fetchedAt = this.now();
      await this.write(key, { version: 1, cityKey, queryHash, fetchedAt, expiresAt: fetchedAt + this.ttlMs, pois })
        .catch(error => console.warn('[OverpassCache] Could not persist response:', error.message));
      return pois;
    })();
    this.pending.set(key, operation);
    try {
      const result = await operation;
      if (this.now() - this.lastCleanup >= DAY) {
        this.lastCleanup = this.now();
        await this.cleanup().catch(error => console.warn('[OverpassCache] Cleanup failed:', error.message));
      }
      return result;
    } finally { this.pending.delete(key); }
  }
  private async keys(): Promise<string[]> {
    const names = await fs.readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return names.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => name.slice(0, -5));
  }
  async expireCity(cityKey: string): Promise<number> {
    if (!cityKey.trim()) throw new Error('Missing cache city identity');
    let count = 0;
    for (const key of await this.keys()) {
      const entry = await this.read(key);
      if (entry?.cityKey === cityKey) { await this.write(key, { ...entry, expiresAt: 0 }); count++; }
    }
    return count;
  }
  async cleanup(): Promise<number> {
    let count = 0;
    for (const key of await this.keys()) {
      if (this.pending.has(key)) continue;
      const entry = await this.read(key);
      if (entry && this.now() - entry.fetchedAt > Math.max(30 * DAY, this.ttlMs * 2)) {
        try { await fs.unlink(join(this.directory, key + '.json')); count++; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    }
    return count;
  }
}
const ttlDays = Number(process.env.OVERPASS_CACHE_TTL_DAYS ?? 7);
export const overpassQueryCache = new OverpassQueryCache(
  process.env.OVERPASS_CACHE_DIR || resolve(process.cwd(), 'tmp/osm-cache'), ttlDays * DAY,
);
