import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "@/app/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell/app-shell";
import { Sonner } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (!appBasePath) {
  throw new Error("NEXT_PUBLIC_BASE_PATH is required");
}

export const metadata: Metadata = {
  title: "Hermes • TargonOS",
  description: "Amazon messaging automation + experimentation (policy-first).",
  icons: {
    icon: [
      { url: `${appBasePath}/favicon.ico`, sizes: "48x48" },
      { url: `${appBasePath}/favicon.svg`, type: "image/svg+xml" },
    ],
    apple: `${appBasePath}/apple-touch-icon.png`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.NEXT_PUBLIC_VERSION;
  if (version === undefined) {
    throw new Error("NEXT_PUBLIC_VERSION is required");
  }

  const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL;
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;
  const versionHref = (() => {
    if (explicitReleaseUrl !== undefined) {
      return explicitReleaseUrl;
    }

    if (commitSha !== undefined) {
      return `https://github.com/progami/targonos/commit/${commitSha}`;
    }

    return `https://github.com/progami/targonos/releases/tag/v${version}`;
  })();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell>{children}</AppShell>
          <Sonner />
        </ThemeProvider>
        <a
          href={versionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-3 right-3 z-50 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
          aria-label={`Hermes version v${version}`}
        >
          Hermes v{version}
        </a>
      </body>
    </html>
  );
}
