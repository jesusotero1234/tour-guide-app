import { proxyBackend } from '@/lib/backendProxy';

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return proxyBackend('tours/' + encodeURIComponent(id) + '/audio');
}
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  return proxyBackend('tours/' + encodeURIComponent(id) + '/audio', { method: 'POST' });
}
