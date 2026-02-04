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
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell>{children}</AppShell>
          <Sonner />
        </ThemeProvider>
      </body>
    </html>
  );
}
