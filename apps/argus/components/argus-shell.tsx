import Link from 'next/link';

export function ArgusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold">
              Argus
            </Link>
            <nav className="flex items-center gap-3 text-sm text-slate-600">
              <Link href="/targets" className="hover:text-slate-900">
                Targets
              </Link>
              <Link href="/market" className="hover:text-slate-900">
                Market
              </Link>
              <Link href="/imports" className="hover:text-slate-900">
                Imports
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}

