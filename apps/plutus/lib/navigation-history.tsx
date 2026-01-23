'use client';

import { useCallback, useLayoutEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  historyIndex: number;
  fallbackPath: string | null;
  setLocation: (pathname: string, historyIndex: number) => void;
};

const useNavigationHistoryStore = create<NavigationHistoryStore>((set) => ({
  pathname: '',
  historyIndex: 0,
  fallbackPath: null,
  setLocation: (pathname, historyIndex) => {
    set({
      pathname,
      historyIndex,
      fallbackPath: getDefaultBackPath(pathname),
    });
  },
}));

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const setLocation = useNavigationHistoryStore((s) => s.setLocation);
  useLayoutEffect(() => {
    const state = window.history.state as { idx?: unknown } | null;
    const rawIdx = state ? state.idx : undefined;
    const historyIndex = typeof rawIdx === 'number' ? rawIdx : 0;

    setLocation(pathname, historyIndex);
  }, [pathname, setLocation]);

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
