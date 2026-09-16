import { NextRequest, NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/backendProxy';
import { pilotEnabled } from '@/lib/pilotMode';
async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (pilotEnabled()) return NextResponse.json({ error: { code: 'PILOT_READ_ONLY' } }, { status: 404 });
  const { path } = await context.params;
  const resource = path.map(encodeURIComponent).join('/');
  if (!/^(tours\/(generate|generate-from-concept)|cities\/[^/]+\/concepts(?:\/all)?|passes\/flexible\/(cities|options|quote))$/.test(resource)) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && body.length > 16384) return NextResponse.json({ error: { code: 'REQUEST_TOO_LARGE' } }, { status: 413 });
  return proxyBackend(resource + request.nextUrl.search, { method: request.method, ...(body ? { body } : {}) });
}
export const GET = forward;
export const POST = forward;
