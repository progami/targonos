import type { Metadata } from 'next';
import './globals.css';
import { site } from '@/content/site';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SkipLink } from '@/components/SkipLink';
import { StandaloneProductSiteMarker } from '@/components/StandaloneProductSiteMarker';

const standaloneProductSiteScript = `
(() => {
  const hosts = ['caelumstar.co.uk', 'www.caelumstar.co.uk'];
  const routes = ['/cs'];
  let standalone = false;

  for (const host of hosts) {
    if (window.location.hostname === host) {
      standalone = true;
      break;
    }
  }

  if (!standalone) {
    for (const route of routes) {
      if (window.location.pathname === route) {
        standalone = true;
        break;
      }

      if (window.location.pathname.startsWith(route + '/')) {
        standalone = true;
        break;
      }
    }
  }

  if (standalone) {
    document.documentElement.dataset.standaloneProductSite = 'true';
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: {
    default: site.name,
    template: `%s · ${site.name}`
  },
  description: site.description,
  openGraph: {
    title: site.name,
    description: site.description,
    url: `https://${site.domain}`,
    siteName: site.name,
    locale: 'en_GB',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: site.name,
    description: site.description
  },
  icons: {
    icon: '/icon'
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: standaloneProductSiteScript }} />
      </head>
      <body>
        <StandaloneProductSiteMarker />
        <SkipLink />
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
