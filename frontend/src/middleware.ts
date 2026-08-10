import { NextResponse } from 'next/server';

export function middleware() {
  if (process.env.ENABLE_NARRATIVE_PILOT !== 'true') {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/pilot/madrid-history',
};
