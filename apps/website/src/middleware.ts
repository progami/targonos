import { NextRequest, NextResponse } from 'next/server';

const CAELUM_STAR_UK_HOSTS = new Set(['caelumstar.co.uk', 'www.caelumstar.co.uk']);
const CAELUM_STAR_UK_ROOT = '/cs/uk';
const CAELUM_STAR_UK_ROOT_REDIRECT_PATHS = new Set(['/cs', '/cs/', CAELUM_STAR_UK_ROOT]);
const TARGON_US_PATH = '/cs/us';
const TARGON_US_URL = 'https://www.targonglobal.com/cs/us';

function getHostname(request: NextRequest) {
  const host = request.headers.get('host');

  if (!host) {
    return null;
  }

  return host.split(':')[0].toLowerCase();
}

function isCaelumStarUkHost(request: NextRequest) {
  const hostname = getHostname(request);

  if (!hostname) {
    return false;
  }

  return CAELUM_STAR_UK_HOSTS.has(hostname);
}

function isAtOrUnderPath(pathname: string, rootPath: string) {
  if (pathname === rootPath) {
    return true;
  }

  return pathname.startsWith(`${rootPath}/`);
}

function redirectToRoot(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  if (!isCaelumStarUkHost(request)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = CAELUM_STAR_UK_ROOT;
    return NextResponse.rewrite(url);
  }

  if (CAELUM_STAR_UK_ROOT_REDIRECT_PATHS.has(pathname)) {
    return redirectToRoot(request);
  }

  if (isAtOrUnderPath(pathname, TARGON_US_PATH)) {
    return NextResponse.redirect(TARGON_US_URL);
  }

  if (pathname.startsWith(`${CAELUM_STAR_UK_ROOT}/`)) {
    return redirectToRoot(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)']
};
