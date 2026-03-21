import type { MetadataRoute } from 'next';
import { site } from '@/content/site';
import { getAllProducts, productsUK } from '@/content/products';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = `https://${site.domain}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/cs`, lastModified: new Date() },
    { url: `${baseUrl}/cs/us`, lastModified: new Date() },
    { url: `${baseUrl}/cs/uk`, lastModified: new Date() },
    { url: `${baseUrl}/cs/us/packs`, lastModified: new Date() },
    { url: `${baseUrl}/cs/uk/packs`, lastModified: new Date() },
    { url: `${baseUrl}/cs/us/where-to-buy`, lastModified: new Date() },
    { url: `${baseUrl}/cs/uk/where-to-buy`, lastModified: new Date() },
    { url: `${baseUrl}/cs/us/gallery`, lastModified: new Date() },
    { url: `${baseUrl}/legal/privacy`, lastModified: new Date() },
    { url: `${baseUrl}/legal/terms`, lastModified: new Date() }
  ];

  const usProductRoutes: MetadataRoute.Sitemap = getAllProducts().map((p) => ({
    url: `${baseUrl}/cs/us/packs/${p.slug}`,
    lastModified: new Date()
  }));

  const ukProductRoutes: MetadataRoute.Sitemap = productsUK.map((p) => ({
    url: `${baseUrl}/cs/uk/packs/${p.slug}`,
    lastModified: new Date()
  }));

  return [...staticRoutes, ...usProductRoutes, ...ukProductRoutes];
}
