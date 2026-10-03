import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/backendProxy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Link clips: `/cue/finish`, `/cue/first/<placeId>` and `/cue/next/<placeId>`, streamed like the stop audio. */
export async function GET(request: Request, context: { params: Promise<{ id: string; slug: string[] }> }) {
  const { id, slug } = await context.params;
  const valid = (slug.length === 1 && slug[0] === 'finish') || (slug.length === 2 && (slug[0] === 'first' || slug[0] === 'next') && UUID.test(slug[1]));
  if (!valid) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const range = request.headers.get('range');
  const version = new URL(request.url).searchParams.get('v');
  return proxyBackend('tours/' + encodeURIComponent(id) + '/cue/' + slug.map(encodeURIComponent).join('/') + (version ? '?v=' + encodeURIComponent(version) : ''), {
    headers: range ? { Range: range } : {},
    // Close the backend stream when the listener disconnects.
    signal: request.signal,
  }, true);
}
