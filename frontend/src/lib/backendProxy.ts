import { NextResponse } from 'next/server';

const backendBaseUrl = process.env.API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://localhost:3001/api';
const backendApiKey = process.env.API_KEY
  || (process.env.NODE_ENV === 'production' ? undefined : 'development-api-key');

export async function proxyBackend(path: string, init?: RequestInit, stream = false): Promise<NextResponse> {
  if (!backendApiKey) {
    return NextResponse.json(
      { error: { code: 'BACKEND_PROXY_NOT_CONFIGURED', message: 'Backend proxy is not configured' } },
      { status: 500 },
    );
  }
  const response = await fetch(`${backendBaseUrl}/v1/${path}`, {
    ...init,
    headers: {
      'X-API-Key': backendApiKey,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const retryAfter = response.headers.get('retry-after');
  const retryHeaders: Record<string, string> = retryAfter ? { 'Retry-After': retryAfter } : {};

  if (stream) {
    const headers: Record<string, string> = { ...retryHeaders };
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    headers['Content-Type'] = contentType;
    const contentRange = response.headers.get('content-range');
    if (contentRange) headers['Content-Range'] = contentRange;
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) headers['Cache-Control'] = cacheControl;

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { ...retryHeaders, 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}
