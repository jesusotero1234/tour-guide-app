import { NextRequest } from 'next/server';
import { proxyBackend } from '@/lib/backendProxy';

export async function GET(request: NextRequest) {
  return proxyBackend(`tours${request.nextUrl.search}`);
}
