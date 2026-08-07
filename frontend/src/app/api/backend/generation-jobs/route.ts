import { proxyBackend } from '@/lib/backendProxy';

export async function POST(request: Request) {
  return proxyBackend('tours/generation-jobs', {
    method: 'POST',
    body: await request.text(),
  });
}
