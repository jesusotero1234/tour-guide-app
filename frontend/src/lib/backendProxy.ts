import { NextResponse } from 'next/server';

const backendBaseUrl = process.env.API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://localhost:3001/api';
const backendApiKey = process.env.API_KEY
  || (process.env.NODE_ENV === 'production' ? undefined : 'development-api-key');

export async function proxyBackend(path: string, init?: RequestInit): Promise<NextResponse> {
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
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}
