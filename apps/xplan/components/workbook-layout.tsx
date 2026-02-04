'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { SheetTabs } from '@/components/sheet-tabs';
import { getSheetConfig } from '@/lib/sheets';
import type { YearSegment } from '@/lib/calculations/calendar';
import type { WorkbookSheetStatus } from '@/lib/workbook';
import { usePersistentScroll } from '@/hooks/usePersistentScroll';
import { usePersistentState } from '@/hooks/usePersistentState';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import {
  SHEET_TOOLBAR_GROUP,
  SHEET_TOOLBAR_LABEL,
  SHEET_TOOLBAR_SELECT,
} from '@/components/sheet-toolbar';
import { ThemeToggle } from '@/components/theme-toggle';
import { TimeZoneClocks } from '@/components/timezone-clocks';

type SheetSlug = WorkbookSheetStatus['slug'];

const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function TargonWordmark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <img
        src={`${assetBasePath}/brand/logo.svg`}
        alt="Targon"
        className="h-6 w-auto dark:hidden"
      />
      <img
        src={`${assetBasePath}/brand/logo-inverted.svg`}
        alt="Targon"
        className="hidden h-6 w-auto dark:block"
      />
    </div>
  );
}

interface WorkbookLayoutProps {
  sheets: WorkbookSheetStatus[];
  activeSlug: SheetSlug;
  planningYears?: YearSegment[];
  activeYear?: number | null;
  reportTimeZone?: string;
  meta?: {
    rows?: number;
    updated?: string;
  };
  ribbon?: React.ReactNode;
  contextPane?: React.ReactNode;
  headerControls?: React.ReactNode;
  children: React.ReactNode;
}

const MIN_CONTEXT_WIDTH = 320;
const MAX_CONTEXT_WIDTH = 560;
const LOADING_INDICATOR_DELAY_MS = 500;
const LOADING_INDICATOR_MIN_VISIBLE_MS = 350;
const YEAR_AWARE_SHEETS: ReadonlySet<SheetSlug> = new Set([
  '3-ops-planning',
  '4-sales-planning',
  '5-fin-planning-pl',
  '7-fin-planning-cash-flow',
]);

export function WorkbookLayout({
  sheets,
  activeSlug,
  planningYears,
  activeYear,
  reportTimeZone,
  meta,
  ribbon,
  contextPane,
  headerControls,
  children,
}: WorkbookLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  const [contextWidth, setContextWidth, contextHydrated] = usePersistentState<number>(
    'xplan:workbook:context-width',
    360,
  );
  const [isResizing, setIsResizing] = useState(false);
  const hasContextPane = Boolean(contextPane);
  const [isPending, startTransition] = useTransition();
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const loadingShownAtRef = useRef<number | null>(null);
  const loadingShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigationBusy = showLoadingIndicator;

  usePersistentScroll(`sheet:${activeSlug}`, true, getScrollElement);

  useEffect(() => {
    return () => {
      if (loadingShowTimerRef.current) {
        clearTimeout(loadingShowTimerRef.current);
        loadingShowTimerRef.current = null;
      }
      if (loadingHideTimerRef.current) {
        clearTimeout(loadingHideTimerRef.current);
        loadingHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isPending) {
      if (loadingShowTimerRef.current) {
        clearTimeout(loadingShowTimerRef.current);
        loadingShowTimerRef.current = null;
      }

      if (!showLoadingIndicator) return;

      if (loadingHideTimerRef.current) {
        clearTimeout(loadingHideTimerRef.current);
        loadingHideTimerRef.current = null;
      }

      const shownAt = loadingShownAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - shownAt;
      const remainingMs = LOADING_INDICATOR_MIN_VISIBLE_MS - elapsedMs;

      if (remainingMs <= 0) {
        setShowLoadingIndicator(false);
        loadingShownAtRef.current = null;
        return;
      }

      loadingHideTimerRef.current = setTimeout(() => {
        setShowLoadingIndicator(false);
        loadingShownAtRef.current = null;
        loadingHideTimerRef.current = null;
      }, remainingMs);

      return;
    }

    if (loadingHideTimerRef.current) {
      clearTimeout(loadingHideTimerRef.current);
      loadingHideTimerRef.current = null;
    }

    if (showLoadingIndicator || loadingShowTimerRef.current) return;

    loadingShowTimerRef.current = setTimeout(() => {
      loadingShowTimerRef.current = null;
      loadingShownAtRef.current = Date.now();
      setShowLoadingIndicator(true);
    }, LOADING_INDICATOR_DELAY_MS);
  }, [isPending, showLoadingIndicator]);

  const sortedYears = useMemo(() => {
    if (!planningYears) return [] as YearSegment[];
    return [...planningYears].sort((a, b) => a.year - b.year);
  }, [planningYears]);

  useEffect(() => {
    if (!contextHydrated) return;
    setContextWidth((value) => Math.min(Math.max(value, MIN_CONTEXT_WIDTH), MAX_CONTEXT_WIDTH));
  }, [contextHydrated, setContextWidth]);

  const searchQueryString = useMemo(() => searchParams?.toString() ?? '', [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        'xplan:last-location',
        JSON.stringify({ slug: activeSlug, query: searchQueryString }),
      );
    } catch (error) {
      console.warn('[xplan] failed to persist last location', error);
    }
  }, [activeSlug, searchQueryString]);

  const resolvedYear = useMemo(() => {
    if (!sortedYears.length) return null;
    if (activeYear != null && sortedYears.some((segment) => segment.year === activeYear)) {
      return activeYear;
    }
    return sortedYears[0]?.year ?? null;
  }, [activeYear, sortedYears]);

  const buildSheetHref = useCallback(
    (slug: SheetSlug, yearOverride?: number | null) => {
      const base = searchParams
        ? new URLSearchParams(searchParams.toString())
        : new URLSearchParams();
      const targetYear = yearOverride ?? resolvedYear;
      if (targetYear != null) {
        base.set('year', String(targetYear));
      } else {
        base.delete('year');
      }
      const query = base.toString();
      return `/${slug}${query ? `?${query}` : ''}`;
    },
    [resolvedYear, searchParams],
  );

  const goToSheet = useCallback(
    (slug: SheetSlug, yearOverride?: number | null) => {
      if (!slug) return;
      const targetHref = buildSheetHref(slug, yearOverride);
      const nextYear = yearOverride ?? resolvedYear;
      if (slug === activeSlug && nextYear === resolvedYear) return;
      startTransition(() => {
        router.push(targetHref);
      });
    },
    [activeSlug, buildSheetHref, resolvedYear, router],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - event.clientX - 16;
      setContextWidth(Math.min(Math.max(newWidth, MIN_CONTEXT_WIDTH), MAX_CONTEXT_WIDTH));
    },
    [isResizing, setContextWidth],
  );

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const handleYearSelect = useCallback(
    (year: number) => {
      if (resolvedYear === year) return;
      startTransition(() => {
        const params = searchParams
          ? new URLSearchParams(searchParams.toString())
          : new URLSearchParams();
        params.set('year', String(year));
        const query = params.toString();
        router.push(`${pathname}${query ? `?${query}` : ''}`);
      });
    },
    [pathname, resolvedYear, router, searchParams, startTransition],
  );

  const isYearAwareSheet = YEAR_AWARE_SHEETS.has(activeSlug);

  const yearSwitcher = useMemo(() => {
    if (!sortedYears.length || !isYearAwareSheet || resolvedYear == null) return null;

    return (
      <div className={SHEET_TOOLBAR_GROUP}>
        <span className={SHEET_TOOLBAR_LABEL}>Year</span>
        <select
          className={SHEET_TOOLBAR_SELECT}
          value={String(resolvedYear)}
          onChange={(event) => handleYearSelect(Number(event.target.value))}
          disabled={isNavigationBusy}
          aria-label="Select year"
        >
          {sortedYears.map((segment) => (
            <option key={segment.year} value={segment.year}>
              {segment.year}
              {segment.weekCount > 0 ? ` (${segment.weekCount}w)` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }, [handleYearSelect, isNavigationBusy, isYearAwareSheet, resolvedYear, sortedYears]);

  const hasControls = Boolean(yearSwitcher || headerControls);

  const yearTraversal = useMemo(() => {
    if (!sortedYears.length) return [] as Array<{ slug: SheetSlug; year: number }>;
    const sequence = ['4-sales-planning', '5-fin-planning-pl', '7-fin-planning-cash-flow'] as const;
    const result: Array<{ slug: SheetSlug; year: number }> = [];
    for (const segment of sortedYears) {
      for (const slug of sequence) {
        if (YEAR_AWARE_SHEETS.has(slug)) {
          result.push({ slug, year: segment.year });
        }
      }
    }
    return result;
  }, [sortedYears]);

  const traversalIndex = useMemo(() => {
    if (resolvedYear == null) return -1;
    return yearTraversal.findIndex(
      (entry) => entry.slug === activeSlug && entry.year === resolvedYear,
    );
  }, [activeSlug, resolvedYear, yearTraversal]);

  const traversalIndexRef = useRef(traversalIndex);

  useEffect(() => {
    traversalIndexRef.current = traversalIndex;
  }, [traversalIndex]);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleMouseMove, isResizing, stopResizing]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
        if (target.isContentEditable) return;
        if (target.closest('.handsontableInput')) return;
      }

      // Ctrl + PageUp/PageDown to navigate sheets
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const currentIndex = traversalIndexRef.current;
          if (currentIndex === -1) return;
          const nextIndex = event.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
          if (nextIndex < 0 || nextIndex >= yearTraversal.length) return;
          const target = yearTraversal[nextIndex];
          event.preventDefault();
          traversalIndexRef.current = nextIndex;
          goToSheet(target.slug, target.year);
          return;
        }

        if (event.key === 'PageUp' || event.key === 'PageDown') {
          event.preventDefault();
          const index = sheets.findIndex((sheet) => sheet.slug === activeSlug);
          if (index === -1) return;
          const nextIndex =
            event.key === 'PageUp'
              ? (index - 1 + sheets.length) % sheets.length
              : (index + 1) % sheets.length;
          goToSheet(sheets[nextIndex].slug);
          return;
        }

        // Ctrl + 1-5 to jump to specific sheets
        const num = parseInt(event.key, 10);
        if (num >= 1 && num <= sheets.length) {
          event.preventDefault();
          goToSheet(sheets[num - 1].slug);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeSlug, goToSheet, sheets, traversalIndex, yearTraversal]);

  const activeSheet = useMemo(
    () => sheets.find((sheet) => sheet.slug === activeSlug),
    [sheets, activeSlug],
  );

  const sheetTabs = useMemo(() => {
    return sheets.map((sheet) => {
      const config = getSheetConfig(sheet.slug);
      return {
        ...config,
        ...sheet,
        icon: config?.icon ?? FileText,
        shortLabel: config?.shortLabel ?? sheet.label,
        href: buildSheetHref(sheet.slug),
        prefetch: sheet.slug === '5-fin-planning-pl' ? false : undefined,
      };
    });
  }, [buildSheetHref, sheets]);

  const metaSummary = useMemo(() => {
    if (!meta) return undefined;
    if (!meta.updated) {
      return {
        display: 'Updated —',
        tooltip: 'No updates recorded yet',
      };
    }

    const parsed = new Date(meta.updated);
    if (Number.isNaN(parsed.getTime())) {
      return {
        display: `Updated ${meta.updated}`,
        tooltip: `Updated ${meta.updated}`,
      };
    }

    const display = `Updated ${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
      .format(parsed)
      .replace(',', '')}`;

    const tooltip = `Updated ${new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(parsed)}`;

    return { display, tooltip };
  }, [meta]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-[#041324]">
      <main className="flex flex-1 overflow-hidden" role="main" aria-label="Main content">
        <section className="flex flex-1 overflow-hidden">
          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
            <header
              className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-xl dark:border-[#0b3a52] dark:bg-[#041324]/95 dark:shadow-[0_26px_55px_rgba(1,12,24,0.55)] sm:px-4 lg:px-5"
              role="banner"
            >
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                {/* App branding - LEFT */}
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-dark shadow-md">
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      aria-hidden="true"
                      className="text-white"
                    >
                      <path
                        d="M7 7L17 17"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M17 7L7 17"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <h1 className="hidden sm:block text-sm font-semibold tracking-tight text-slate-700 dark:text-slate-200">
                    xplan
                  </h1>
                </div>
                <div className="min-w-0 overflow-hidden">
                  <SheetTabs
                    sheets={sheetTabs}
                    activeSlug={activeSlug}
                    variant="scroll"
                    onSheetSelect={goToSheet}
                  />
                </div>
                <div className="flex items-center gap-3">
                  {/* Active strategy indicator */}
                  {ribbon}

                  {/* Loading state */}
                  {showLoadingIndicator && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent dark:border-[#00C2B9]" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-300">
                        Loading
                      </span>
                    </div>
                  )}

                  {reportTimeZone ? <TimeZoneClocks reportTimeZone={reportTimeZone} /> : null}

                  {/* Theme toggle */}
                  <ThemeToggle />

                  {/* Targon branding - RIGHT */}
                  <TargonWordmark className="shrink-0" />

                </div>
              </div>

              {hasControls && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {headerControls}
                  {yearSwitcher}
                </div>
              )}
            </header>
            <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </div>
          {hasContextPane && (
            <div
              className="relative hidden h-full shrink-0 border-l border-slate-200 bg-white/90 backdrop-blur-sm dark:border-[#0b3a52] dark:bg-[#06182b]/85 lg:block"
              style={{ width: contextWidth }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-cyan-600/30 transition-colors hover:bg-cyan-600/50 dark:bg-[#00c2b9]/30 dark:hover:bg-[#00c2b9]/50"
                onMouseDown={() => setIsResizing(true)}
              />
              <div className="h-full overflow-auto px-5 py-6">{contextPane}</div>
            </div>
          )}
        </section>
      </main>

      <footer
        className="space-y-2 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-xl dark:border-[#0b3a52] dark:bg-[#041324]/95 dark:shadow-[0_26px_55px_rgba(1,12,24,0.55)] lg:hidden"
        role="navigation"
        aria-label="Sheet navigation"
      >
        <SheetTabs
          sheets={sheetTabs}
          activeSlug={activeSlug}
          variant="scroll"
          onSheetSelect={goToSheet}
        />
        {hasControls && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-2 dark:border-[#0b3a52]">
            {headerControls}
            {yearSwitcher}
          </div>
        )}
      </footer>
    </div>
  );
}
