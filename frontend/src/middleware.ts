import { NextRequest, NextResponse } from 'next/server';
import { pilotEnabled, trustedPilotProxy } from './lib/pilotMode';

export async function middleware(request: NextRequest) {
  if (pilotEnabled()) {
    if (!await trustedPilotProxy(request.headers)) return new NextResponse('Prueba privada. Acceso mediante invitación.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (/^\/(?:dev|pilot|generation)(?:\/|$)/.test(request.nextUrl.pathname)) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (request.nextUrl.pathname === '/' || request.nextUrl.pathname.startsWith('/passes')) {
      // Next's internal request URL uses the loopback listener behind Caddy.
      // The authenticated proxy preserves the public Host header, including its port.
      const destination = request.nextUrl.clone();
      destination.port = '';
      destination.host = request.headers.get('host') || destination.host;
      destination.pathname = '/tours';
      destination.search = '';
      return NextResponse.redirect(destination);
    }
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
