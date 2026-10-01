import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync, promises as fs } from 'fs';
import { spawn } from 'child_process';
import { isAbsolute, join, resolve } from 'path';
import { GeocodedCity } from '../../domain/geocoder/GeocoderTypes';
import { RawPoi } from '../../domain/poi/RawPoi';

const DAY_MS = 86_400_000;
const DEFAULT_TTL_MS = 7 * DAY_MS;
const COUNTRY_SOURCES: Record<string, { slug: string; url: string }> = {
  FR: { slug: 'france', url: 'https://download.geofabrik.de/europe/france-latest.osm.pbf' },
  DE: { slug: 'germany', url: 'https://download.geofabrik.de/europe/germany-latest.osm.pbf' },
  IT: { slug: 'italy', url: 'https://download.geofabrik.de/europe/italy-latest.osm.pbf' },
};
// This is an OR-prefilter only. The exact Overpass clauses are applied after
// city extraction, so every key/value used by every supported theme must be
// represented here even though the current European batch is historical.
const BROAD_THEME_FILTERS = [
  'nwr/historic', 'nwr/heritage',
  'nwr/building=cathedral,palace,castle,church,basilica,marketplace,civic,public,government,parliament',
  'nwr/tourism=attraction,museum,gallery,artwork', 'nwr/place=square',
  'nwr/amenity=marketplace,place_of_worship', 'nwr/highway=pedestrian',
  'nwr/man_made=tower,lighthouse,bridge', 'nwr/architect',
  'nwr/shop=bakery,pastry,cheese,wine,greengrocer',
];

interface StaticFallbackInput {
  city: GeocodedCity;
  filters: string[];
  areaLimit: number;
  nodeLimit: number;
  queryHash: string;
}
export interface StaticFallbackResult {
  pois: RawPoi[];
  provenance: Record<string, unknown>;
}
interface CountryMetadata {
  version: 1;
  countryCode: string;
  sourceUrl: string;
  md5: string;
  bytes: number;
  filteredBytes: number;
  fetchedAt: number;
  expiresAt: number;
  pbfFile: string;
  filteredPbfFile: string;
  osmiumVersion: string;
}
interface CityMetadata {
  version: 1;
  countryCode: string;
  countryExtractMd5: string;
  bbox: GeocodedCity['boundingBox'];
  fetchedAt: number;
  expiresAt: number;
  featureFile: string;
  bytes: number;
  featureCount: number;
}
interface GeoJsonFeature {
  type?: unknown;
  properties?: Record<string, unknown>;
  geometry?: { type?: unknown; coordinates?: unknown } | null;
}

function backendRoot(): string {
  let directory = __dirname;
  for (let i = 0; i < 7; i++) {
    if (existsSync(join(directory, 'package.json')) && existsSync(join(directory, 'scripts/admin'))) return directory;
    directory = resolve(directory, '..');
  }
  throw new Error('Cannot locate backend for static OSM fallback');
}

export function staticOsmFallbackDirectory(): string {
  const configured = process.env.STATIC_OSM_FALLBACK_DIR;
  if (configured && !isAbsolute(configured)) throw new Error('STATIC_OSM_FALLBACK_DIR must be absolute');
  return configured || join(backendRoot(), 'tmp/static-osm-fallback');
}

function runProcess(command: string, args: string[], options: { timeoutMs?: number } = {}): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', diagnostic = '';
    child.stdout.on('data', data => { output = (output + data).slice(-64_000); });
    child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-16_000); });
    const timer = options.timeoutMs ? setTimeout(() => child.kill('SIGTERM'), options.timeoutMs) : undefined;
    child.once('error', error => { if (timer) clearTimeout(timer); reject(error); });
    child.once('close', code => {
      if (timer) clearTimeout(timer);
      code === 0 ? accept(output) : reject(new Error(
        `${command} exited ${code}: ${diagnostic.trim() || 'no diagnostic output'}`));
    });
  });
}

async function fileHash(path: string, algorithm: 'md5' | 'sha256'): Promise<string> {
  const hash = createHash(algorithm);
  await new Promise<void>((accept, reject) => {
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', accept);
  });
  return hash.digest('hex');
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = path + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, path);
}

async function commandVersion(): Promise<string> {
  return (await runProcess('osmium', ['--version'])).split('\n')[0].trim();
}

export function parseGeofabrikChecksum(text: string, resolvedUrl: string): string {
  const match = text.trim().match(/^([a-fA-F0-9]{32})\s+\*?([^\s/]+)$/);
  const expectedName = new URL(resolvedUrl).pathname.split('/').pop();
  if (!match || !expectedName || match[2] !== expectedName) {
    throw new Error(`Geofabrik checksum does not identify ${expectedName ?? 'the resolved extract'}`);
  }
  return match[1].toLowerCase();
}

async function resolveCountryUrl(url: string, slug: string): Promise<string> {
  const resolvedUrl = (await runProcess('curl', ['--fail', '--location', '--silent', '--show-error',
    '--head', '--output', '/dev/null', '--write-out', '%{url_effective}', url], { timeoutMs: 120_000 })).trim();
  const parsed = new URL(resolvedUrl);
  if (parsed.protocol !== 'https:' || !new RegExp(`/${slug}-(?:latest|\\d{6})\\.osm\\.pbf$`).test(parsed.pathname)) {
    throw new Error(`Geofabrik resolved ${slug} to an unexpected URL`);
  }
  return resolvedUrl;
}

async function readMetadata(path: string): Promise<CountryMetadata | null> {
  try {
    const value = JSON.parse(await fs.readFile(path, 'utf8')) as CountryMetadata;
    if (value.version !== 1 || !COUNTRY_SOURCES[value.countryCode] || !/^[a-f0-9]{32}$/.test(value.md5)
      || !Number.isFinite(value.fetchedAt) || !Number.isFinite(value.expiresAt)
      || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
      || !Number.isSafeInteger(value.filteredBytes) || value.filteredBytes <= 0) return null;
    return value;
  } catch { return null; }
}

async function validCountryCache(metadata: CountryMetadata | null, now: number): Promise<boolean> {
  if (!metadata || metadata.expiresAt <= now) return false;
  try {
    const [source, filtered] = await Promise.all([fs.stat(metadata.pbfFile), fs.stat(metadata.filteredPbfFile)]);
    return source.isFile() && filtered.isFile() && source.size === metadata.bytes && filtered.size === metadata.filteredBytes;
  } catch { return false; }
}

async function removeExpiredFiles(directory: string, now: number): Promise<void> {
  const names = await fs.readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of names) {
    const path = join(directory, name);
    if (name.endsWith('.metadata.json')) {
      const metadata = await readMetadata(path);
      if (!metadata || metadata.expiresAt <= now) {
        await Promise.all([
          metadata?.pbfFile ? fs.rm(metadata.pbfFile, { force: true }) : Promise.resolve(),
          metadata?.filteredPbfFile ? fs.rm(metadata.filteredPbfFile, { force: true }) : Promise.resolve(),
          fs.rm(path, { force: true }),
        ]);
      }
    } else if (name.includes('.tmp') || name.endsWith('.part')) {
      const stat = await fs.stat(path).catch(() => null);
      if (stat && now - stat.mtimeMs > DEFAULT_TTL_MS) await fs.rm(path, { recursive: true, force: true });
    }
  }
}

async function readCityMetadata(path: string): Promise<CityMetadata | null> {
  try {
    const value = JSON.parse(await fs.readFile(path, 'utf8')) as CityMetadata;
    if (value.version !== 1 || !COUNTRY_SOURCES[value.countryCode] || !/^[a-f0-9]{32}$/.test(value.countryExtractMd5)
      || !Number.isFinite(value.fetchedAt) || !Number.isFinite(value.expiresAt)
      || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
      || !Number.isSafeInteger(value.featureCount) || value.featureCount < 0) return null;
    return value;
  } catch { return null; }
}

async function cleanupCityCache(directory: string, now: number): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith('.metadata.json')) continue;
    const path = join(directory, name);
    const metadata = await readCityMetadata(path);
    if (!metadata || metadata.expiresAt <= now) {
      if (metadata?.featureFile) await fs.rm(metadata.featureFile, { force: true });
      await fs.rm(path, { force: true });
    }
  }
}

async function downloadCountry(countryCode: string, directory: string): Promise<CountryMetadata> {
  const source = COUNTRY_SOURCES[countryCode];
  const metadataFile = join(directory, source.slug + '.metadata.json');
  const now = Date.now();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await removeExpiredFiles(directory, now);
  const existing = await readMetadata(metadataFile);
  if (await validCountryCache(existing, now)) return existing!;

  const pbfFile = join(directory, source.slug + '-latest.osm.pbf');
  const partFile = pbfFile + '.part';
  const md5File = join(directory, source.slug + '.md5.' + randomUUID() + '.tmp');
  const filteredPbfFile = join(directory, source.slug + '-history.osm.pbf');
  const filteredTemporary = filteredPbfFile + '.' + randomUUID() + '.tmp';
  try {
    // Pin the data and checksum to the same dated object. The two "latest"
    // aliases can briefly point at different days on independent mirrors.
    const resolvedUrl = await resolveCountryUrl(source.url, source.slug);
    await runProcess('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3',
      '--retry-delay', '5', '--output', md5File, resolvedUrl + '.md5'], { timeoutMs: 120_000 });
    const md5Text = await fs.readFile(md5File, 'utf8');
    const expectedMd5 = parseGeofabrikChecksum(md5Text, resolvedUrl);

    if (existsSync(pbfFile) && await fileHash(pbfFile, 'md5') !== expectedMd5) await fs.rm(pbfFile, { force: true });
    if (!existsSync(pbfFile)) {
      try {
        await runProcess('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '4',
          '--retry-delay', '10', '--continue-at', '-', '--output', partFile, resolvedUrl], { timeoutMs: 6 * 3600_000 });
      } catch (error) {
        // Some mirrors reject ranges. Preserve normal interrupted downloads, but
        // retry a completed-looking incompatible partial once from byte zero.
        const message = error instanceof Error ? error.message : String(error);
        if (!/range|resume|33/i.test(message)) throw error;
        await fs.rm(partFile, { force: true });
        await runProcess('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '4',
          '--retry-delay', '10', '--output', partFile, resolvedUrl], { timeoutMs: 6 * 3600_000 });
      }
      const actualMd5 = await fileHash(partFile, 'md5');
      if (actualMd5 !== expectedMd5) {
        await fs.rm(partFile, { force: true });
        throw new Error(`Geofabrik MD5 mismatch for ${countryCode}: expected ${expectedMd5}, got ${actualMd5}`);
      }
      await fs.rename(partFile, pbfFile);
    }
    const actualMd5 = await fileHash(pbfFile, 'md5');
    if (actualMd5 !== expectedMd5) throw new Error(`Cached Geofabrik MD5 mismatch for ${countryCode}`);

    await fs.rm(filteredPbfFile, { force: true });
    await runProcess('osmium', ['tags-filter', '--no-progress', '--overwrite', '--output-format', 'pbf', '--output', filteredTemporary,
      pbfFile, ...BROAD_THEME_FILTERS], { timeoutMs: 3 * 3600_000 });
    await fs.rename(filteredTemporary, filteredPbfFile);
    const [sourceStat, filteredStat, osmiumVersion] = await Promise.all([
      fs.stat(pbfFile), fs.stat(filteredPbfFile), commandVersion(),
    ]);
    const fetchedAt = Date.now();
    const metadata: CountryMetadata = {
      version: 1, countryCode, sourceUrl: resolvedUrl, md5: expectedMd5,
      bytes: sourceStat.size, filteredBytes: filteredStat.size,
      fetchedAt, expiresAt: fetchedAt + DEFAULT_TTL_MS,
      pbfFile, filteredPbfFile, osmiumVersion,
    };
    await atomicJson(metadataFile, metadata);
    return metadata;
  } finally {
    await Promise.all([fs.rm(md5File, { force: true }), fs.rm(filteredTemporary, { force: true })]);
  }
}

interface ParsedFilter { osmType: RawPoi['osmType']; clauses: Array<{ key: string; pattern?: RegExp; value?: string }> }
export function parseOverpassFilter(filter: string): ParsedFilter {
  const head = filter.match(/^(node|way|relation)/);
  if (!head) throw new Error('Unsupported Overpass filter type: ' + filter);
  const clauses: ParsedFilter['clauses'] = [];
  const clausePattern = /\["([^"]+)"(?:(=|~)"([^"]*)")?\]/g;
  let match: RegExpExecArray | null;
  while ((match = clausePattern.exec(filter)) !== null) {
    clauses.push({ key: match[1], ...(match[2] === '=' ? { value: match[3] }
      : match[2] === '~' ? { pattern: new RegExp(match[3]) } : {}) });
  }
  if (!clauses.length || head[0].length + clauses.reduce((sum, clause) => {
    const original = clause.pattern ? `["${clause.key}"~"${clause.pattern.source}"]`
      : clause.value !== undefined ? `["${clause.key}"="${clause.value}"]` : `["${clause.key}"]`;
    return sum + original.length;
  }, 0) !== filter.length) throw new Error('Unsupported Overpass filter syntax: ' + filter);
  return { osmType: head[1] as RawPoi['osmType'], clauses };
}

function matchesFilter(poi: RawPoi, filter: ParsedFilter): boolean {
  return poi.osmType === filter.osmType && filter.clauses.every(clause => {
    const value = poi.tags[clause.key];
    if (typeof value !== 'string') return false;
    if (clause.value !== undefined) return value === clause.value;
    return clause.pattern ? clause.pattern.test(value) : true;
  });
}

function coordinateBounds(value: unknown, bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity }): typeof bounds {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    bounds.minLng = Math.min(bounds.minLng, value[0]); bounds.maxLng = Math.max(bounds.maxLng, value[0]);
    bounds.minLat = Math.min(bounds.minLat, value[1]); bounds.maxLat = Math.max(bounds.maxLat, value[1]);
  } else if (Array.isArray(value)) for (const item of value) coordinateBounds(item, bounds);
  return bounds;
}

export function featureToRawPoi(feature: GeoJsonFeature): RawPoi | null {
  if (feature.type !== 'Feature' || !feature.properties || !feature.geometry) return null;
  const osmType = feature.properties['@type'];
  const osmId = feature.properties['@id'];
  if (!['node', 'way', 'relation'].includes(String(osmType)) || !Number.isSafeInteger(osmId)) return null;
  const bounds = coordinateBounds(feature.geometry.coordinates);
  if (![bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng].every(Number.isFinite)) return null;
  const tags = Object.fromEntries(Object.entries(feature.properties)
    .filter(([key, value]) => !key.startsWith('@') && typeof value === 'string')) as RawPoi['tags'];
  return { osmType: osmType as RawPoi['osmType'], osmId: osmId as number,
    name: tags.name ?? '', lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2, tags };
}

export function selectStaticPois(features: GeoJsonFeature[], filters: string[], areaLimit: number, nodeLimit: number): RawPoi[] {
  const parsed = filters.map(parseOverpassFilter);
  const seen = new Set<string>(), areas: RawPoi[] = [], nodes: RawPoi[] = [];
  for (const feature of features) {
    const poi = featureToRawPoi(feature);
    if (!poi || !parsed.some(filter => matchesFilter(poi, filter))) continue;
    const key = `${poi.osmType}:${poi.osmId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (poi.osmType === 'node' ? nodes : areas).push(poi);
  }
  return [...areas.slice(0, areaLimit), ...nodes.slice(0, nodeLimit)];
}

async function readFeatures(path: string): Promise<GeoJsonFeature[]> {
  const features: GeoJsonFeature[] = [];
  for (const row of (await fs.readFile(path, 'utf8')).split('\n')) {
    const trimmed = row.replace(/^\x1e/, '').trim();
    if (trimmed) features.push(JSON.parse(trimmed));
  }
  return features;
}

async function cityFeatures(metadata: CountryMetadata, city: GeocodedCity, directory: string): Promise<{
  features: GeoJsonFeature[]; metadata: CityMetadata; cacheHit: boolean;
}> {
  const key = createHash('sha256').update(JSON.stringify([
    metadata.countryCode, metadata.md5, city.boundingBox,
  ])).digest('hex');
  const citiesDirectory = join(directory, 'cities', metadata.countryCode.toLowerCase());
  await cleanupCityCache(citiesDirectory, Date.now());
  const metadataFile = join(citiesDirectory, key + '.metadata.json');
  const existing = await readCityMetadata(metadataFile);
  if (existing && existing.expiresAt > Date.now() && existing.countryExtractMd5 === metadata.md5) {
    const stat = await fs.stat(existing.featureFile).catch(() => null);
    if (stat?.isFile() && stat.size === existing.bytes) {
      return { features: await readFeatures(existing.featureFile), metadata: existing, cacheHit: true };
    }
  }

  const runDirectory = join(directory, 'runs', key + '-' + process.pid + '-' + randomUUID());
  const cityPbf = join(runDirectory, 'city.osm.pbf');
  const temporaryFeatures = join(runDirectory, 'city.geojsonseq');
  const featureFile = join(citiesDirectory, key + '.geojsonseq');
  await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
  try {
    const box = city.boundingBox;
    const bbox = [box.minLng, box.minLat, box.maxLng, box.maxLat].join(',');
    await runProcess('osmium', ['extract', '--strategy', 'smart', '--option', 'types=any',
      '--set-bounds', '--bbox', bbox, '--overwrite', '--output', cityPbf, metadata.filteredPbfFile],
    { timeoutMs: 45 * 60_000 });
    await runProcess('osmium', ['export', '--no-progress', '--output-format', 'geojsonseq',
      '--attributes', 'type,id', '--overwrite', '--output', temporaryFeatures, cityPbf], { timeoutMs: 45 * 60_000 });
    const features = await readFeatures(temporaryFeatures);
    await fs.rename(temporaryFeatures, featureFile);
    const stat = await fs.stat(featureFile);
    const fetchedAt = Date.now();
    const saved: CityMetadata = { version: 1, countryCode: metadata.countryCode,
      countryExtractMd5: metadata.md5, bbox: city.boundingBox, fetchedAt,
      expiresAt: Math.min(metadata.expiresAt, fetchedAt + DEFAULT_TTL_MS),
      featureFile, bytes: stat.size, featureCount: features.length };
    await atomicJson(metadataFile, saved);
    return { features, metadata: saved, cacheHit: false };
  } finally { await fs.rm(runDirectory, { recursive: true, force: true }); }
}

async function runWorker(input: StaticFallbackInput): Promise<StaticFallbackResult> {
  const countryCode = input.city.countryCode?.toUpperCase();
  if (!countryCode || !COUNTRY_SOURCES[countryCode]) throw new Error(`Static OSM fallback does not support country ${countryCode ?? 'unknown'}`);
  if (!input.filters.length || !Number.isSafeInteger(input.areaLimit) || input.areaLimit < 0
    || !Number.isSafeInteger(input.nodeLimit) || input.nodeLimit < 0 || !/^[a-f0-9]{64}$/.test(input.queryHash)) {
    throw new Error('Invalid static OSM fallback request');
  }
  const box = input.city.boundingBox;
  if (![box.minLng, box.minLat, box.maxLng, box.maxLat].every(Number.isFinite)
    || box.minLng >= box.maxLng || box.minLat >= box.maxLat) throw new Error('Invalid city bounding box');
  const directory = staticOsmFallbackDirectory();
  const countries = join(directory, 'countries');
  const metadata = await downloadCountry(countryCode, countries);
  const cityResult = await cityFeatures(metadata, input.city, directory);
  const pois = selectStaticPois(cityResult.features, input.filters, input.areaLimit, input.nodeLimit);
  return { pois, provenance: {
    source: 'geofabrik-static', endpoint: metadata.sourceUrl, countryCode,
    countryExtractMd5: metadata.md5, countryExtractBytes: metadata.bytes,
    countryExtractFetchedAt: new Date(metadata.fetchedAt).toISOString(),
    countryExtractExpiresAt: new Date(metadata.expiresAt).toISOString(),
    cityExtractFetchedAt: new Date(cityResult.metadata.fetchedAt).toISOString(),
    cityExtractExpiresAt: new Date(cityResult.metadata.expiresAt).toISOString(),
    cityExtractCacheHit: cityResult.cacheHit,
    osmiumVersion: metadata.osmiumVersion, queryHash: input.queryHash,
    bbox: input.city.boundingBox, exportedFeatureCount: cityResult.features.length,
    poiCount: pois.length, coordinated: true, fallbackAfterOverpassExhaustion: true,
  } };
}

export async function fetchStaticOsmPois(input: StaticFallbackInput): Promise<StaticFallbackResult> {
  if (process.env.STATIC_OSM_FALLBACK === '0') throw new Error('Static OSM fallback is disabled');
  const directory = staticOsmFallbackDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const compiled = join(__dirname, 'StaticOsmPoiFallback.js');
  const workerArgs = existsSync(compiled) ? [compiled, '--worker']
    : ['-r', require.resolve('ts-node/register/transpile-only'), join(__dirname, 'StaticOsmPoiFallback.ts'), '--worker'];
  return new Promise((accept, reject) => {
    const child = spawn('flock', ['--exclusive', '--wait', '21600', '--conflict-exit-code', '75',
      '--no-fork', join(directory, 'fallback.lock'), process.execPath, ...workerArgs],
    { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let output = '', diagnostic = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-16_000); });
    child.stdin.on('error', () => undefined);
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) return reject(new Error(`Static OSM fallback exited ${code}: ${diagnostic}`));
      try {
        const parsed = JSON.parse(output) as StaticFallbackResult;
        if (!Array.isArray(parsed.pois) || !parsed.provenance) throw new Error('Invalid static OSM response');
        accept(parsed);
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

if (require.main === module && process.argv.includes('--worker')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => runWorker(JSON.parse(input)).then(result => process.stdout.write(JSON.stringify(result)))
    .catch(error => { process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n'); process.exitCode = 1; }));
}
