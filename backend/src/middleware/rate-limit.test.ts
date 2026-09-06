import express from 'express';
import { AddressInfo } from 'node:net';
import { apiLimiter } from './rate-limit';

jest.mock('../config/env', () => ({ config: { auth: { rateLimit: { windowMs: 900000, max: 2 } } } }));

it('keeps bounded progress polling separate from normal API requests', async () => {
  const app = express();
  app.use('/api/v1/tours', apiLimiter, (_req, res) => res.json({ ok: true }));
  app.use('/api/v1/cities', apiLimiter, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const request = async (path: string, method = 'GET') => {
    const response = await fetch(base + path, { method });
    const body = await response.json();
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body };
  };
  try {
    for (let i = 0; i < 600; i++) {
      const path = i % 2 ? '/tours/example/audio' : '/tours/generation-jobs/example';
      expect((await request(path)).status).toBe(200);
    }
    const blocked = await request('/tours/generation-jobs/example');
    expect(blocked.status).toBe(429);
    expect(blocked.retryAfter).toBeTruthy();
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMIT_EXCEEDED' } });
    expect((await request('/tours')).status).toBe(200);
    expect((await request('/tours/generation-jobs', 'POST')).status).toBe(200);
    expect((await request('/tours/example/audio', 'POST')).status).toBe(429);
    expect((await request('/cities/generation-jobs/example')).status).toBe(429);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
