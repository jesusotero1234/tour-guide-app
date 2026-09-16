import { NextResponse } from 'next/server';
import { headers as requestHeaders } from 'next/headers';
import { pilotEnabled, trustedPilotProxy } from './pilotMode';

const backendBaseUrl = process.env.API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://localhost:3001/api';
const backendApiKey = process.env.API_KEY
  || (process.env.NODE_ENV === 'production' ? undefined : 'development-api-key');

export async function proxyBackend(path: string, init?: RequestInit, stream = false): Promise<NextResponse> {
  const pilot = pilotEnabled();
  if (pilot && (!await trustedPilotProxy(await requestHeaders()) || !['GET', 'HEAD'].includes(init?.method ?? 'GET') ||
    !/^tours(?:\?[^#]*)?$|^tours\/[0-9a-f-]{36}(?:\/(?:walking-route|provenance|audio(?:\/(?:[0-9a-f-]{36}|introduction))?))?(?:\?v=[a-f0-9.]+)?$/.test(path))) {
    return NextResponse.json({ error: { code: 'PILOT_READ_ONLY' } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const key = pilot ? process.env.PILOT_API_KEY : backendApiKey;
  if (!key) {
    return NextResponse.json(
      { error: { code: 'BACKEND_PROXY_NOT_CONFIGURED', message: 'Backend proxy is not configured' } },
      { status: 500 },
    );
  }
  const response = await fetch(`${backendBaseUrl}/v1/${pilot ? 'pilot/' : ''}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
      'X-API-Key': key,
    },
    cache: 'no-store',
  });

  const retryAfter = response.headers.get('retry-after');
  const retryHeaders: Record<string, string> = retryAfter ? { 'Retry-After': retryAfter } : {};

  if (stream) {
    const headers: Record<string, string> = { ...retryHeaders, 'Cache-Control': 'private, no-store' };
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    headers['Content-Type'] = contentType;
    const contentRange = response.headers.get('content-range');
    if (contentRange) headers['Content-Range'] = contentRange;
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) headers['Cache-Control'] = cacheControl;
    const link = response.headers.get('link');
    if (link) headers.Link = link;

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { ...retryHeaders, 'Cache-Control': 'private, no-store', 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}
