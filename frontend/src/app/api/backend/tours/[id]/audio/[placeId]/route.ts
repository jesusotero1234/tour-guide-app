import { proxyBackend } from '@/lib/backendProxy';

export async function GET(request: Request, context: { params: Promise<{ id: string; placeId: string }> }) {
  const { id, placeId } = await context.params;
  const range = request.headers.get('range');
  return proxyBackend('tours/' + encodeURIComponent(id) + '/audio/' + encodeURIComponent(placeId), {
    headers: range ? { Range: range } : {},
  }, true);
}
