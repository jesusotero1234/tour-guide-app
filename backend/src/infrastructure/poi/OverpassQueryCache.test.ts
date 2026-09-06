import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OverpassQueryCache } from './OverpassQueryCache';
import { RawPoi } from '../../domain/poi/RawPoi';

const DAY = 86400000;
const pois: RawPoi[] = [{ osmType: 'node', osmId: 1, name: 'Museum', lat: 40, lng: -3, tags: {} }];
describe('persistent Overpass query cache', () => {
  let dir: string, now: number, cache: OverpassQueryCache;
  beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'osm-cache-test-')); now = 100 * DAY; cache = new OverpassQueryCache(dir, 7 * DAY, () => now); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  it('persists across instances and isolates cities and complete query text', async () => {
    const load = jest.fn(async () => pois);
    await cache.getOrFetch('Q2807', 'bbox1', load);
    const other = new OverpassQueryCache(dir, 7 * DAY, () => now);
    expect(await other.getOrFetch('Q2807', 'bbox1', load)).toEqual(pois);
    expect(load).toHaveBeenCalledTimes(1);
    await other.getOrFetch('Q2807', 'bbox2', load);
    await other.getOrFetch('Q90', 'bbox1', load);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('refreshes at expiry and caches a genuinely empty response', async () => {
    const load = jest.fn(async () => []);
    await cache.getOrFetch('Q2807', 'q', load);
    now += 7 * DAY - 1;
    await cache.getOrFetch('Q2807', 'q', load);
    expect(load).toHaveBeenCalledTimes(1);
    now++;
    await cache.getOrFetch('Q2807', 'q', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('expires only one city and preserves the old copy on failed refresh', async () => {
    await cache.getOrFetch('Q2807', 'q', async () => pois);
    await cache.getOrFetch('Q90', 'q', async () => pois);
    expect(await cache.expireCity('Q2807')).toBe(1);
    const files = (await fs.readdir(dir)).sort();
    const before = await Promise.all(files.map(f => fs.readFile(join(dir, f), 'utf8')));
    await expect(cache.getOrFetch('Q2807', 'q', async () => { throw new Error('429'); })).rejects.toThrow('429');
    expect(await Promise.all(files.map(f => fs.readFile(join(dir, f), 'utf8')))).toEqual(before);
    const load = jest.fn(async () => []);
    await cache.getOrFetch('Q90', 'q', load);
    expect(load).not.toHaveBeenCalled();
    expect(await cache.getOrFetch('Q2807', 'q', async () => [])).toEqual([]);
  });
  it('shares concurrent requests and clears failed in-flight work', async () => {
    const load = jest.fn(async () => pois);
    await Promise.all([cache.getOrFetch('Q1', 'q', load), cache.getOrFetch('Q1', 'q', load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(cache.getOrFetch('Q2', 'q', async () => { throw new Error('failed'); })).rejects.toThrow();
    expect(await cache.getOrFetch('Q2', 'q', load)).toEqual(pois);
  });
  it('replaces malformed data after a successful download', async () => {
    await cache.getOrFetch('Q1', 'q', async () => pois);
    const file = join(dir, (await fs.readdir(dir))[0]);
    await fs.writeFile(file, '{broken');
    expect(await cache.getOrFetch('Q1', 'q', async () => [])).toEqual([]);
    expect(JSON.parse(await fs.readFile(file, 'utf8')).pois).toEqual([]);
  });
  it('cleans old entries while retaining recent ones and unrelated files', async () => {
    await cache.getOrFetch('Q1', 'q', async () => pois);
    now += 31 * DAY;
    const recent = new OverpassQueryCache(dir, 7 * DAY, () => now);
    await fs.writeFile(join(dir, 'keep.txt'), 'keep');
    expect(await recent.cleanup()).toBe(1);
    await recent.getOrFetch('Q2', 'q', async () => pois);
    expect(await recent.cleanup()).toBe(0);
    expect(await fs.readFile(join(dir, 'keep.txt'), 'utf8')).toBe('keep');
  });
  it('rejects invalid TTL and blank identities', async () => {
    expect(() => new OverpassQueryCache(dir, NaN)).toThrow();
    await expect(cache.expireCity(' ')).rejects.toThrow();
  });
});
