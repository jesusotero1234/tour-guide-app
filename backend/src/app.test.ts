import type { AddressInfo } from 'net';
import type { Server } from 'http';

const LEGACY_MODULES = [
  './services/orchestrationService',
  './services/cityIntelligence/ConceptDiscoveryService',
  './services/generationJobServiceInstance',
];

describe('createApp', () => {
  const saved = { ...process.env };
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>(done => server ? server.close(() => done()) : done());
    server = undefined;
    process.env = { ...saved };
    jest.resetModules();
    jest.dontMock('./services/orchestrationService');
    jest.dontMock('./services/cityIntelligence/ConceptDiscoveryService');
    jest.dontMock('./services/generationJobServiceInstance');
  });

  async function boot(): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
    const { createApp } = require('./app') as typeof import('./app');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(done => server!.once('listening', () => done()));
    const { port } = server.address() as AddressInfo;
    return (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init);
  }

  test('read-only pilot does not mount or even load the legacy generation API', async () => {
    process.env.PILOT_MODE = 'true';
    process.env.PILOT_API_KEY = 'p'.repeat(40);
    process.env.API_KEYS = 'staff-key';
    // These modules build heavy singletons at load time: requiring any of them in pilot mode is a failure.
    for (const name of LEGACY_MODULES) {
      jest.doMock(name, () => { throw new Error(`legacy module loaded in pilot mode: ${name}`); });
    }
    const call = await boot();

    expect((await call('/health')).status).toBe(200);
    expect((await call('/api/v1/tours/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'staff-key' }, body: '{}' })).status).toBe(404);
    expect((await call('/api/v1/tours', { headers: { 'x-api-key': 'staff-key' } })).status).toBe(404);
    expect((await call('/api/v1/cities', { headers: { 'x-api-key': 'staff-key' } })).status).toBe(404);
    expect((await call('/api/v1/passes', { headers: { 'x-api-key': 'staff-key' } })).status).toBe(404);
    expect((await call('/audio/anything.mp3')).status).toBe(404);
    // The pilot API itself is still mounted and still requires its own key.
    expect((await call('/api/v1/pilot/tours')).status).toBe(401);
  });

  test('outside the pilot the staff generation API is still mounted behind its API key', async () => {
    delete process.env.PILOT_MODE;
    process.env.NODE_ENV = 'development';
    process.env.PILOT_API_KEY = 'p'.repeat(40);
    process.env.API_KEYS = 'staff-key';
    jest.resetModules();
    const call = await boot();

    expect((await call('/api/v1/tours', { headers: { 'x-api-key': 'wrong' } })).status).toBe(401);
    expect((await call('/api/v1/cities', { headers: { 'x-api-key': 'wrong' } })).status).toBe(401);
    expect((await call('/api/v1/passes', { headers: { 'x-api-key': 'wrong' } })).status).toBe(401);
  });
});
