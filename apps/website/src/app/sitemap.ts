import type { MetadataRoute } from 'next';
import { site } from '@/content/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = `https://${site.domain}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/cs`, lastModified: new Date() },
    { url: `${baseUrl}/cs/us`, lastModified: new Date() },
    { url: 'https://caelumstar.co.uk/', lastModified: new Date() },
    { url: `${baseUrl}/legal/privacy`, lastModified: new Date() },
    { url: `${baseUrl}/legal/terms`, lastModified: new Date() }
  ];

  return staticRoutes;
}
