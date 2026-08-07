import { proxyBackend } from '@/lib/backendProxy';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyBackend(`tours/${encodeURIComponent(id)}`);
}
