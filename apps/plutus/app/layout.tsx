import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

import { Providers } from '@/components/providers';
import { AppHeader } from '@/components/app-header';

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (appBasePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Plutus | Targon',
  description: 'Finance workspace for custom financials from QuickBooks Online.',
  icons: {
    icon: [
      { url: `${appBasePath}/favicon.ico`, sizes: '48x48' },
      { url: `${appBasePath}/favicon.svg`, type: 'image/svg+xml' },
    ],
    apple: `${appBasePath}/apple-touch-icon.png`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.NEXT_PUBLIC_VERSION;
  if (version === undefined) {
    throw new Error('NEXT_PUBLIC_VERSION is required');
  }

  const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL;
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;
  const commitUrl = commitSha ? `https://github.com/progami/targonos/commit/${commitSha}` : undefined;
  const inferredReleaseUrl = `https://github.com/progami/targonos/releases/tag/v${version}`;

  let versionHref = inferredReleaseUrl;
  if (commitUrl !== undefined) {
    versionHref = commitUrl;
  }
  if (explicitReleaseUrl !== undefined) {
    versionHref = explicitReleaseUrl;
  }

  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans), Outfit, system-ui, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <Providers>
          <AppHeader />
          {children}
        </Providers>
        <a
          href={versionHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'fixed',
            bottom: 12,
            right: 12,
            zIndex: 50,
            borderRadius: 9999,
            border: '1px solid rgba(226, 232, 240, 1)',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '4px 12px',
            fontSize: '0.75rem',
            color: '#475569',
            boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            backdropFilter: 'blur(4px)',
            textDecoration: 'none',
          }}
          aria-label={`Plutus version v${version}`}
        >
          Plutus v{version}
        </a>
      </body>
    </html>
  );
}
