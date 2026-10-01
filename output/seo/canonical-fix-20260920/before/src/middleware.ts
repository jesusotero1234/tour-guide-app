import { NextRequest, NextResponse } from 'next/server';
import { pilotEnabled, trustedPilotProxy } from './lib/pilotMode';
import { isSeoPagePath } from './lib/seoInventory';

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
  const path = request.nextUrl.pathname.replace(/\/$/, '') || '/';
  const pageLocale = /^\/(es|en|fr|de|it)\//.exec(path)?.[1];
  const forwarded = new Headers(request.headers);
  // Never trust a locale header supplied by a visitor; derive it from the URL.
  forwarded.delete('x-nomuvia-page-language');
  if (pageLocale) forwarded.set('x-nomuvia-page-language', pageLocale);
  const response = NextResponse.next({ request: { headers: forwarded } });
  const indexable = path === '/tours' || isSeoPagePath(path);
  if (!indexable && path !== '/robots.txt' && path !== '/sitemap.xml' && !path.startsWith('/_next/')) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }
  return response;
}

export const config = {
  matcher: '/:path*',
};
