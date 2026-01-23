'use client';

import { useCallback, useLayoutEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { create } from 'zustand';

type NavigationHistory = {
  goBack: () => void;
  canGoBack: boolean;
};

function normalizePathname(pathname: string): string {
  if (pathname.endsWith('/') && pathname !== '/') {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getDefaultBackPath(pathname: string): string | null {
  const path = normalizePathname(pathname);

  if (path === '' || path === '/' || /(^|\/)settlements$/.test(path)) {
    return null;
  }

  if (/(^|\/)settlements\/[^/]+$/.test(path)) return '/settlements';
  if (/(^|\/)bills$/.test(path)) return '/setup';
  if (/(^|\/)chart-of-accounts$/.test(path)) return '/setup';
  if (/(^|\/)setup$/.test(path)) return '/settlements';

  const segments = path.split('/').filter(Boolean);
  if (segments.length > 1) {
    segments.pop();
    return `/${segments.join('/')}`;
  }

  return '/settlements';
}

type NavigationHistoryStore = {
  pathname: string;
  search: string;
  historyIndex: number;
  fallbackPath: string | null;
  setLocation: (pathname: string, search: string, historyIndex: number) => void;
};

const useNavigationHistoryStore = create<NavigationHistoryStore>((set) => ({
  pathname: '',
  search: '',
  historyIndex: 0,
  fallbackPath: null,
  setLocation: (pathname, search, historyIndex) => {
    set({
      pathname,
      search,
      historyIndex,
      fallbackPath: getDefaultBackPath(pathname),
    });
  },
}));

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const setLocation = useNavigationHistoryStore((s) => s.setLocation);
  useLayoutEffect(() => {
    const state = window.history.state as { idx?: unknown } | null;
    const rawIdx = state ? state.idx : undefined;
    const historyIndex = typeof rawIdx === 'number' ? rawIdx : 0;

    setLocation(pathname, search, historyIndex);
  }, [pathname, search, setLocation]);

  return children;
}

export function useNavigationHistory(): NavigationHistory {
  const router = useRouter();

  const historyIndex = useNavigationHistoryStore((s) => s.historyIndex);
  const fallbackPath = useNavigationHistoryStore((s) => s.fallbackPath);
  const canGoBack = historyIndex > 0 ? true : fallbackPath !== null;

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      router.back();
      return;
    }

    if (fallbackPath !== null) {
      router.push(fallbackPath);
      return;
    }

    router.back();
  }, [fallbackPath, historyIndex, router]);

  return { goBack, canGoBack };
}

