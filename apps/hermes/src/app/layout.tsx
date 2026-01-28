import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "@/app/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell/app-shell";
import { Sonner } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hermes • TargonOS",
  description: "Amazon messaging automation + experimentation (policy-first).",
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
