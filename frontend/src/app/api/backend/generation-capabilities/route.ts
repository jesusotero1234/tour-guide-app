import { proxyBackend } from '@/lib/backendProxy';

export async function GET() {
  return proxyBackend('tours/generation-capabilities');
}
