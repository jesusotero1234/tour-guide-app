import { spawn, ChildProcess } from 'child_process';
import { createServer, Server } from 'http';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { initialState } from './OverpassCoordinatorPolicy';

jest.setTimeout(35_000);
describe('Overpass coordination across real processes', () => {
  let base: string, server: Server, endpoints: string[], children: ChildProcess[];
  let active: number, peak: number;
  let requests: { path: string; query: string; start: number; end?: number }[];
  let respond: (path: string, query: string) => { status?: number; body?: unknown; headers?: Record<string, string>; delay?: number };
  beforeEach(async () => {
    const temporaryRoot = resolve(__dirname, '../../../tmp');
    await fs.mkdir(temporaryRoot, { recursive: true });
    base = await fs.mkdtemp(join(temporaryRoot, 'overpass-process-test-'));
    // Compile just the real worker dependencies. Independent tsc checks validate
    // types; subprocesses execute ordinary Node with no ts-node startup overhead.
    for (const name of ['OverpassCoordinator', 'OverpassRequestWorker', 'OverpassCoordinatorPolicy', 'OverpassQueryCache', 'SourceAcquisition']) {
      const source = await fs.readFile(join(__dirname, name + '.ts'), 'utf8');
      await fs.writeFile(join(base, name + '.js'), transpileModule(source, {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText);
    }
    await fs.mkdir(join(base, 'control'));
    active = 0; peak = 0; requests = []; children = [];
    respond = () => ({ body: { elements: [{ type: 'node', id: 1, lat: 40, lon: -3, tags: { name: 'Museum' } }] }, delay: 60 });
    server = createServer((req, res) => {
      let query = '';
      req.on('data', chunk => { query += chunk; });
      req.on('end', () => {
        const row = { path: req.url!, query, start: Date.now(), end: undefined as number | undefined };
        requests.push(row); active++; peak = Math.max(peak, active);
        const result = respond(req.url!, query);
        setTimeout(() => {
          active--; row.end = Date.now();
          res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json', ...result.headers });
          res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? { elements: [] }));
        }, result.delay ?? 5);
      });
    });
    await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
    const address = server.address() as { port: number };
    endpoints = ['/primary', '/fallback'].map(p => `http://127.0.0.1:${address.port}${p}`);
  });
  afterEach(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await Promise.all(children.filter(c => c.exitCode === null && c.signalCode === null)
      .map(c => new Promise<void>(accept => c.once('close', () => accept()))));
    await new Promise<void>(accept => server.close(() => accept()));
    while (active > 0) await new Promise(resolve => setTimeout(resolve, 10));
    await fs.rm(base, { recursive: true, force: true });
  });
  function launch(query = 'same-query', cache = 'cache', cityKey = 'Q1') {
    const child = spawn('flock', ['--exclusive', '--wait', '15', '--no-fork', join(base, 'control/request.lock'),
      process.execPath, join(base, 'OverpassRequestWorker.js')], { stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SOURCE_ACQUISITION_DIR: '' } });
    children.push(child);
    const result = new Promise<any>((accept, reject) => {
      let output = '', errors = '';
      child.stdout!.on('data', d => { output += d; }); child.stderr!.on('data', d => { errors += d; });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (signal) return accept({ signal });
        if (code !== 0) return reject(new Error('Worker failed: ' + errors));
        try { accept(JSON.parse(output)); } catch { reject(new Error('Invalid result: ' + output + errors)); }
      });
    });
    child.stdin!.end(JSON.stringify({ directory: join(base, 'control'), cityKey, query, endpoints,
      cacheDirectory: join(base, cache), ttlMs: 604800000, timeoutMs: 2000 }));
    return { child, result };
  }
  const stateFile = () => join(base, 'control/state.json');
  async function state() { return JSON.parse(await fs.readFile(stateFile(), 'utf8')); }
  async function advanceRecovery() {
    const saved = await state();
    saved.nextRequestAt = 0;
    for (const provider of Object.values(saved.providers) as any[]) provider.retryAt = 0;
    if (saved.incident) saved.incident.retryAt = 0;
    await fs.writeFile(stateFile(), JSON.stringify(saved));
  }
  it('coalesces 30 simultaneous cold requests into one download and durable cache', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => launch().result));
    expect(results.every(result => result.status === 'ok')).toBe(true);
    expect(results.filter(result => !result.cacheHit)).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(peak).toBe(1);
    expect((await state()).metrics).toEqual({ requests: 1, cacheHits: 29 });
  });
  it('serializes different cities and cold-cache directories with the completion gap', async () => {
    const results = await Promise.all([launch('a', 'cold-a', 'Q1').result, launch('b', 'cold-b', 'Q2').result]);
    expect(results.every(r => r.status === 'ok')).toBe(true);
    expect(peak).toBe(1);
    expect(requests[1].start - requests[0].end!).toBeGreaterThanOrEqual(2990);
  });
  it('honors shared Retry-After immediately while permitting a healthy fallback', async () => {
    respond = path => path === '/primary' ? { status: 429, headers: { 'Retry-After': '3600' } } : { body: { elements: [] } };
    const first = await launch('a').result;
    expect(first.status).toBe('waiting');
    const before = await state();
    expect(before.providers[endpoints[0]].retryAt - Date.now()).toBeGreaterThan(3_590_000);
    expect((await launch('b').result).status).toBe('ok');
    expect(requests.map(r => r.path)).toEqual(['/primary', '/fallback']);
    expect((await state()).queries).toHaveProperty('Q1/' + require('crypto').createHash('sha256').update('a').digest('hex'));
  });
  it('shares exactly three recovery probes across cities, including restarts and queued jobs', async () => {
    respond = () => ({ status: 503 });
    expect((await launch('a').result).status).toBe('waiting');
    expect((await launch('b').result).status).toBe('waiting');
    expect((await state()).incident.windowsUsed).toBe(0);
    expect((await launch('waiting-does-not-consume').result).status).toBe('waiting');
    expect(requests).toHaveLength(2);
    for (let i = 0; i < 3; i++) {
      await advanceRecovery(); // Advance durable deadlines, not the retry counters.
      const result = await launch('new-city-' + i).result;
      expect(result.status).toBe(i === 2 ? 'error' : 'waiting');
      expect((await state()).incident.windowsUsed).toBe(i + 1);
    }
    expect((await launch('another-city').result).type).toBe('source_recovery_exhausted');
    expect(requests).toHaveLength(5);
  });
  it('does not publish partial or malformed responses as cached success', async () => {
    respond = () => ({ body: { elements: [{ type: 'node', id: 1, lat: 40, lon: -3 }], remark: 'runtime error: Query timed out' } });
    expect((await launch().result).status).toBe('waiting');
    expect(await fs.readdir(join(base, 'cache')).catch(() => [])).toEqual([]);
    respond = () => ({ body: { unexpected: true } });
    const second = await launch('malformed').result;
    expect(second.type).toBe('query_failed');
    expect((await launch('malformed').result).type).toBe('query_failed');
    expect(requests).toHaveLength(2);
  });
  it('returns cached sources during a provider outage without sending HTTP', async () => {
    await launch().result;
    const saved = await state();
    saved.incident = { id: 'outage', retryAt: Date.now() + 300000, windowsUsed: 3, exhausted: true };
    await fs.writeFile(stateFile(), JSON.stringify(saved));
    expect((await launch().result).status).toBe('ok');
    expect((await launch('missing').result).type).toBe('source_recovery_exhausted');
    expect(requests).toHaveLength(1);
  });
  it('quarantines a killed owner without losing its attempt or leaking the OS lock', async () => {
    respond = () => ({ delay: 500, body: { elements: [] } });
    const running = launch();
    while (!requests.length) await new Promise(resolve => setTimeout(resolve, 10));
    running.child.kill('SIGKILL');
    expect((await running.result).signal).toBe('SIGKILL');
    const saved = await state();
    expect(saved.active).not.toBeNull();
    expect(saved.metrics.requests).toBe(1);
    const next = await launch('new-city').result;
    expect(next.status).toBe('waiting');
    expect(Date.parse(next.retryNotBefore)).toBe(saved.active.until);
    expect(requests).toHaveLength(1);
    expect(peak).toBe(1);
  });
  it('fails closed for corrupted state and permanent access restrictions', async () => {
    await fs.writeFile(stateFile(), '{corrupt');
    expect((await launch().result).type).toBe('coordinator_invalid_state');
    expect(requests).toHaveLength(0);
    await fs.writeFile(stateFile(), JSON.stringify(initialState(endpoints)));
    respond = () => ({ status: 403 });
    expect((await launch().result).type).toBe('service_restricted');
    expect((await launch().result).type).toBe('service_restricted');
    expect(requests).toHaveLength(1);
  });
  it('the application client uses the same worker and returns a structured shared wait', async () => {
    respond = () => ({ status: 503 });
    const script = 'const c=require(process.argv[1]); c.requestOverpass(JSON.parse(process.argv[2]))'
      + '.then(r=>process.stdout.write(JSON.stringify(r))).catch(e=>process.stdout.write(JSON.stringify(e.result||{error:e.message})));';
    const payload = { cityKey: 'Q1', query: 'client', cacheDirectory: join(base, 'cache'), ttlMs: 604800000, endpoints, timeoutMs: 2000 };
    const child = spawn(process.execPath, ['-e', script, join(base, 'OverpassCoordinator.js'), JSON.stringify(payload)], {
      env: { ...process.env, SOURCE_ACQUISITION_DIR: '', OVERPASS_COORDINATOR_DIR: join(base, 'control') },
    });
    children.push(child);
    const result = await new Promise<any>((accept, reject) => {
      let output = '', errors = '';
      child.stdout!.on('data', d => { output += d; }); child.stderr!.on('data', d => { errors += d; });
      child.on('error', reject);
      child.on('close', code => { try { if (code) throw new Error(errors); accept(JSON.parse(output)); } catch (error) { reject(error); } });
    });
    expect(result).toMatchObject({ status: 'waiting', coordinated: true, type: 'source_wait', attempts: 1 });
    expect(requests).toHaveLength(1);
  });
});
