'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isStandaloneProductHost, isStandaloneProductRoute } from '@/lib/standaloneProductRoutes';

const standaloneProductSiteAttribute = 'standaloneProductSite';

export function StandaloneProductSiteMarker() {
  const pathname = usePathname();

  useEffect(() => {
    let isStandalone = isStandaloneProductHost(window.location.hostname);

    if (!isStandalone) {
      isStandalone = isStandaloneProductRoute(pathname);
    }

    if (isStandalone) {
      document.documentElement.dataset[standaloneProductSiteAttribute] = 'true';
      return;
    }

    delete document.documentElement.dataset[standaloneProductSiteAttribute];
  }, [pathname]);

  return null;
}
