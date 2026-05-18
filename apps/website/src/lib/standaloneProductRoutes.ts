const standaloneProductRouteRoots = ['/cs'];
const standaloneProductHosts = ['caelumstar.co.uk', 'www.caelumstar.co.uk'];

export function isStandaloneProductHost(hostname: string) {
  for (const standaloneHost of standaloneProductHosts) {
    if (hostname === standaloneHost) {
      return true;
    }
  }

  return false;
}

export function isStandaloneProductRoute(pathname: string) {
  for (const routeRoot of standaloneProductRouteRoots) {
    if (pathname === routeRoot) {
      return true;
    }

    if (pathname.startsWith(`${routeRoot}/`)) {
      return true;
    }
  }

  return false;
}
