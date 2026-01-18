import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'flatpickr/dist/themes/light.css';
import { Providers } from '@/components/providers';
import { clsx } from 'clsx';

function normalizeBasePath(value?: string | null) {
  if (!value || value === '/') return '';
  const trimmed = value.replace(/\/+$/g, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH);

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'X-Plan | Targon',
  description:
    'Collaborative demand, supply, and finance planning that mirrors the X-Plan workbook experience while staying web-first.',
  icons: {
    icon: [
      { url: `${appBasePath}/favicon.ico`, sizes: '48x48' },
      { url: `${appBasePath}/favicon.svg`, type: 'image/svg+xml' },
    ],
    apple: `${appBasePath}/apple-touch-icon.png`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0';
  const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL || undefined;
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA || undefined;
  const commitUrl = commitSha
    ? `https://github.com/progami/targonos/commit/${commitSha}`
    : undefined;
  const inferredReleaseUrl = `https://github.com/progami/targonos/releases/tag/v${version}`;
  const versionHref = explicitReleaseUrl ?? commitUrl ?? inferredReleaseUrl;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={clsx(
          'min-h-screen bg-slate-50 font-sans antialiased dark:bg-slate-950',
          inter.variable,
        )}
      >
        <Providers>{children}</Providers>
        <a
          href={versionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-3 right-3 z-50 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur transition-colors hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 dark:hover:text-slate-100"
          aria-label={`X-Plan version v${version}`}
        >
          X-Plan v{version}
        </a>
      </body>
    </html>
  );
}
