import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const jetBrainsMono = JetBrains_Mono({
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
  const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0';
  const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL
    ? process.env.NEXT_PUBLIC_RELEASE_URL
    : undefined;
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA
    ? process.env.NEXT_PUBLIC_COMMIT_SHA
    : undefined;
  const commitUrl = commitSha
    ? `https://github.com/progami/targonos/commit/${commitSha}`
    : undefined;
  const inferredReleaseUrl = `https://github.com/progami/targonos/releases/tag/v${version}`;
  const versionHref = explicitReleaseUrl ?? commitUrl ?? inferredReleaseUrl;

  return (
    <html lang="en">
      <body
        className={`${inter.className} ${inter.variable} ${jetBrainsMono.variable}`}
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
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            zIndex: 50,
            fontSize: 12,
            lineHeight: 1.2,
            padding: '8px 12px',
            borderRadius: 9999,
            border: '1px solid rgba(140, 166, 181, 0.16)',
            background: 'rgba(4, 16, 26, 0.72)',
            color: 'rgba(213, 226, 234, 0.82)',
            textDecoration: 'none',
            backdropFilter: 'blur(12px)',
            fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
            letterSpacing: '0.04em',
          }}
          aria-label={`TargonOS version v${version}`}
        >
          TargonOS v{version}
        </a>
      </body>
    </html>
  );
}
