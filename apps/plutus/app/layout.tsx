import type { Metadata } from 'next';
import { DM_Sans, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { clsx } from 'clsx';

import { Providers } from '@/components/providers';
import { AppHeader } from '@/components/app-header';

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (appBasePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400'],
  style: ['normal', 'italic'],
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
          'min-h-screen flex flex-col bg-slate-50 font-sans antialiased dark:bg-slate-950',
          dmSans.variable,
          instrumentSerif.variable,
        )}
      >
        <Providers>
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
