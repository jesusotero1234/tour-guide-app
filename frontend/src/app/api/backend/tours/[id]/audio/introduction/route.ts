import { proxyBackend } from '@/lib/backendProxy';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const range = request.headers.get('range');
  const version = new URL(request.url).searchParams.get('v');
  return proxyBackend('tours/' + encodeURIComponent(id) + '/audio/introduction' + (version ? '?v=' + encodeURIComponent(version) : ''), {
    headers: range ? { Range: range } : {},
    // Close the backend stream when the listener disconnects.
    signal: request.signal,
  }, true);
}
