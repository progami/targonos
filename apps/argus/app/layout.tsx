import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import Providers from './providers';
import './globals.css';

function normalizeBasePath(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }

  if (value === '/') {
    return '';
  }

  const trimmed = value.replace(/\/+$/g, '');
  if (trimmed === '') {
    return '';
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function resolveBasePath(): string {
  const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
  if (publicBasePath !== undefined) {
    return normalizeBasePath(publicBasePath);
  }

  return normalizeBasePath(process.env.BASE_PATH);
}

const appBasePath = resolveBasePath();

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Argus | Targon',
  description: 'WPR, monitoring, and listing controls for the Argus workspace.',
  icons: {
    icon: [
      { url: `${appBasePath}/favicon.ico`, sizes: '48x48' },
      { url: `${appBasePath}/favicon.svg`, type: 'image/svg+xml' },
    ],
    apple: `${appBasePath}/apple-touch-icon.png`,
  },
};

function resolveVersionHref(version: string): string {
  const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL;
  if (explicitReleaseUrl !== undefined) {
    return explicitReleaseUrl;
  }

  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;
  if (commitSha !== undefined) {
    return `https://github.com/progami/targonos/commit/${commitSha}`;
  }

  return `https://github.com/progami/targonos/releases/tag/v${version}`;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0';
  const versionHref = resolveVersionHref(version);

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AppRouterCacheProvider>
          <Providers>{children}</Providers>
        </AppRouterCacheProvider>
        <a
          href={versionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="argus-version-badge"
          aria-label={`Argus version v${version}`}
        >
          Argus v{version}
        </a>
      </body>
    </html>
  );
}
