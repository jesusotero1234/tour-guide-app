import { NextRequest, NextResponse } from 'next/server';
import { pilotEnabled, trustedPilotProxy } from './lib/pilotMode';

export async function middleware(request: NextRequest) {
  if (pilotEnabled()) {
    if (!await trustedPilotProxy(request.headers)) return new NextResponse('Prueba privada. Acceso mediante invitación.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (/^\/(?:dev|pilot|generation)(?:\/|$)/.test(request.nextUrl.pathname)) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (request.nextUrl.pathname === '/' || request.nextUrl.pathname.startsWith('/passes')) return NextResponse.redirect(new URL('/tours', request.url));
  }
  if (request.nextUrl.pathname === '/pilot/madrid-history' && process.env.ENABLE_NARRATIVE_PILOT !== 'true') {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
