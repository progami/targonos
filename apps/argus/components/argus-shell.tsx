'use client';

import { ThemeProvider } from 'next-themes';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export function ArgusShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto scrollbar-gutter-stable">
            <div className="p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
