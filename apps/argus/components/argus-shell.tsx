'use client';

import { ThemeProvider } from 'next-themes';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export function ArgusShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const stripped = pathname.replace(basePath, '') || '/';

  const section =
    stripped.startsWith('/images') ? 'assets'
      : stripped.startsWith('/imports') ? 'admin'
        : 'monitoring';

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <div data-section={section} className="flex h-screen overflow-hidden argus-shell">
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
