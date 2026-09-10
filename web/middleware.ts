import { NextRequest, NextResponse } from 'next/server';

import { workspacePathEnabled } from './features';

/** Retired routes stay in source, but cannot render or receive form submissions. */
export function middleware(request: NextRequest) {
  if (workspacePathEnabled(request.nextUrl.pathname)) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = '/app/board';
  destination.search = '';
  return NextResponse.redirect(destination, 303);
}

export const config = { matcher: ['/app/:path*'] };