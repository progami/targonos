import type { Metadata } from 'next';
import { Afacad, Azeret_Mono, Funnel_Display } from 'next/font/google';
import { getPublicVersion, getPublicVersionHref } from '@/lib/public-build-metadata';
import './layout.css';

const afacad = Afacad({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const funnelDisplay = Funnel_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-display',
});

const azeretMono = Azeret_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'TargonOS',
  description: 'Central authentication and app launcher for TargonOS',
  icons: {
    icon: [
      { url: '/targonos-favicon.ico' },
      { url: '/targonos-favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = getPublicVersion();
  const versionHref = getPublicVersionHref();

  return (
    <html lang="en">
      <body
        className={`${afacad.className} ${afacad.variable} ${funnelDisplay.variable} ${azeretMono.variable}`}
        style={{
          margin: 0,
          padding: 0,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {children}
        <a
          href={versionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="targonos-version-badge"
          aria-label={`TargonOS version v${version}`}
        >
          TargonOS v{version}
        </a>
      </body>
    </html>
  );
}
