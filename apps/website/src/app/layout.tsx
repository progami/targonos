import type { Metadata } from 'next';
import './globals.css';
import { site } from '@/content/site';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

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
  icons: {
    icon: '/favicon.ico'
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
