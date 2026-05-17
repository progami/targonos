import { NextRequest, NextResponse } from 'next/server';

const CAELUM_STAR_HOSTS = new Set(['caelumstar.co.uk', 'www.caelumstar.co.uk']);
const CAELUM_STAR_ROOT_REDIRECT_PATHS = new Set(['/cs', '/cs/', '/cs/uk']);

function getHostname(request: NextRequest) {
  const host = request.headers.get('host');

  if (!host) {
    return null;
  }

  return host.split(':')[0].toLowerCase();
}

function isCaelumStarHost(request: NextRequest) {
  const hostname = getHostname(request);

  if (!hostname) {
    return false;
  }

  return CAELUM_STAR_HOSTS.has(hostname);
}

export function middleware(request: NextRequest) {
  if (!isCaelumStarHost(request)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/cs/uk';
    return NextResponse.rewrite(url);
  }

  if (CAELUM_STAR_ROOT_REDIRECT_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/cs/uk/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)']
};
