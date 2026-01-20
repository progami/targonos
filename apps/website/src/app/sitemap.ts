import type { MetadataRoute } from 'next';
import { site } from '@/content/site';
import { getAllProducts } from '@/content/products';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = `https://${site.domain}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/products`, lastModified: new Date() },
    { url: `${baseUrl}/about`, lastModified: new Date() },
    { url: `${baseUrl}/support`, lastModified: new Date() },
    { url: `${baseUrl}/where-to-buy`, lastModified: new Date() },
    { url: `${baseUrl}/legal/privacy`, lastModified: new Date() },
    { url: `${baseUrl}/legal/terms`, lastModified: new Date() }
  ];

  const productRoutes: MetadataRoute.Sitemap = getAllProducts().map((p) => ({
    url: `${baseUrl}/products/${p.slug}`,
    lastModified: new Date()
  }));

  return [...staticRoutes, ...productRoutes];
}
