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
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.secondary',
          }}
        >
          Year
        </Typography>
        <ToggleButtonGroup
          value={resolvedYear}
          exclusive
          onChange={(_e, val) => { if (val != null) handleYearSelect(val); }}
          size="small"
          aria-label="Select year"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.25,
              py: 0.5,
              fontSize: '0.75rem',
              fontWeight: 500,
              '&.Mui-selected': {
                bgcolor: 'secondary.main',
                color: '#fff',
                '&:hover': { bgcolor: 'secondary.main' },
              },
            },
          }}
        >
          {sortedYears.map((segment) => (
            <ToggleButton
              key={segment.year}
              value={segment.year}
              disabled={isNavigationBusy && segment.year === resolvedYear}
            >
              {segment.year}
              {segment.weekCount > 0 ? ` (${segment.weekCount}w)` : ''}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ display: 'flex', flex: 1, overflow: 'hidden' }} role="main" aria-label="Main content">
        <Box component="section" sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Box ref={scrollContainerRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <AppBar
              position="sticky"
              color="transparent"
              elevation={0}
              sx={{
                top: 0,
                zIndex: 10,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                '.dark &': {
                  bgcolor: 'rgba(4,19,36,0.95)',
                  borderColor: '#0b3a52',
                  boxShadow: '0 1px 4px rgba(1,12,24,0.3)',
                },
              }}
              role="banner"
            >
              <Toolbar
                variant="dense"
                sx={{ px: { xs: 1.5, sm: 2, lg: 2.5 }, py: 1, gap: 1, minHeight: 'auto' }}
              >
                {/* App branding - LEFT */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      height: 36,
                      width: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '12px',
                      bgcolor: '#002C51',
                      boxShadow: 2,
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      aria-hidden="true"
                      style={{ color: 'white' }}
                    >
                      <path d="M7 7L17 17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                      <path d="M17 7L7 17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                  </Box>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      display: { xs: 'none', sm: 'block' },
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      color: 'text.primary',
                    }}
                  >
                    xplan
                  </Typography>
                </Box>

                {/* Sheet tabs - CENTER */}
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <SheetTabs
                    sheets={sheetTabs}
                    activeSlug={activeSlug}
                    variant="scroll"
                    onSheetSelect={goToSheet}
                  />
                </Box>

                {/* Right controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                  {ribbon}

                  {showLoadingIndicator && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CircularProgress size={14} sx={{ color: 'secondary.main' }} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'secondary.main' }}
                      >
                        Loading
                      </Typography>
                    </Box>
                  )}

                  {reportTimeZone ? <TimeZoneClocks reportTimeZone={reportTimeZone} /> : null}

                  <ThemeToggle />

                  <TargonWordmark className="shrink-0" />
                </Box>
              </Toolbar>

              {hasControls && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 1,
                    borderTop: 1,
                    borderColor: 'divider',
                    px: { xs: 1.5, sm: 2, lg: 2.5 },
                    py: 0.75,
                  }}
                >
                  {headerControls}
                  {yearSwitcher}
                </Box>
              )}
            </AppBar>
            <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, py: 2 }}>{children}</Box>
          </Box>
          {hasContextPane && (
            <Box
              className="hidden lg:block"
              sx={{
                position: 'relative',
                height: '100%',
                flexShrink: 0,
                borderLeft: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                backdropFilter: 'blur(4px)',
                width: contextWidth,
              }}
            >
              <Box
                role="separator"
                aria-orientation="vertical"
                onMouseDown={() => setIsResizing(true)}
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: 6,
                  cursor: 'ew-resize',
                  bgcolor: 'rgba(0,194,185,0.3)',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: 'rgba(0,194,185,0.5)' },
                }}
              />
              <Box sx={{ height: '100%', overflow: 'auto', px: 2.5, py: 3 }}>{contextPane}</Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box
        component="footer"
        className="lg:hidden"
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(16px)',
          px: 1.5,
          py: 1.25,
          boxShadow: '0 -1px 3px rgba(0,0,0,0.06)',
          '.dark &': {
            bgcolor: 'rgba(4,19,36,0.95)',
            borderColor: '#0b3a52',
            boxShadow: '0 -1px 4px rgba(1,12,24,0.3)',
          },
        }}
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 1.5,
              borderTop: 1,
              borderColor: 'divider',
              pt: 1,
            }}
          >
            {headerControls}
            {yearSwitcher}
          </Box>
        )}
      </Box>
    </Box>
  );
}
