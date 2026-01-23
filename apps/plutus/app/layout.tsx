import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { clsx } from 'clsx';

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
    <html lang="en" suppressHydrationWarning>
      <body
        className={clsx(
          'min-h-screen flex flex-col bg-gradient-subtle font-sans antialiased',
          outfit.variable,
        )}
      >
        <Providers>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 opacity-70 dark:opacity-50"
          >
            <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_-10%,rgba(0,194,185,0.18),transparent_60%),radial-gradient(50rem_36rem_at_85%_0%,rgba(0,102,193,0.12),transparent_55%)] dark:bg-[radial-gradient(60rem_40rem_at_20%_-10%,rgba(0,194,185,0.20),transparent_60%),radial-gradient(50rem_36rem_at_85%_0%,rgba(0,102,193,0.16),transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.7),transparent_24%)] dark:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.0),transparent_24%)]" />
          </div>
          <AppHeader />
          {children}
        </Providers>
        <a
          href={versionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-3 right-3 z-50 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur transition-colors hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 dark:hover:text-slate-100"
          aria-label={`Plutus version v${version}`}
        >
          Plutus v{version}
        </a>
      </body>
    </html>
  );
}
