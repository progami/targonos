'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  Alert,
  Box,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useWprWeeksQuery } from '@/hooks/use-wpr';
import { useWprStore } from '@/stores/wpr-store';

const TAB_ITEMS = [
  { href: '/wpr', label: 'SQP' },
  { href: '/wpr/compare', label: 'Compare' },
  { href: '/wpr/competitor', label: 'Competitor' },
  { href: '/wpr/changelog', label: 'Changelog' },
  { href: '/wpr/sources', label: 'Sources' },
];

function resolveTabValue(pathname: string): string {
  for (const item of TAB_ITEMS) {
    if (pathname === item.href) {
      return item.href;
    }
  }
  return '/wpr';
}

export default function WprLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, error } = useWprWeeksQuery();
  const selectedWeek = useWprStore((state) => state.selectedWeek);
  const setSelectedWeek = useWprStore((state) => state.setSelectedWeek);
  const activeTab = resolveTabValue(pathname);

  useEffect(() => {
    if (data === undefined) return;
    if (selectedWeek === null) {
      setSelectedWeek(data.defaultWeek);
      return;
    }
    if (data.weeks.includes(selectedWeek)) return;
    setSelectedWeek(data.defaultWeek);
  }, [data, selectedWeek, setSelectedWeek]);

  return (
    <Stack spacing={0} sx={{ height: '100%' }}>
      {/* Tab bar */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          py: 0.75,
          px: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center">
          {TAB_ITEMS.map((item) => {
            const isActive = activeTab === item.href;
            return (
              <Box
                key={item.href}
                component={Link}
                href={item.href}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 999,
                  fontSize: '0.7rem',
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  color: isActive ? 'primary.contrastText' : 'text.secondary',
                  bgcolor: isActive ? 'primary.main' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'primary.main' : 'divider',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: isActive ? 'primary.main' : 'action.hover',
                    color: isActive ? 'primary.contrastText' : 'text.primary',
                  },
                }}
              >
                {item.label}
              </Box>
            );
          })}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            Week
          </Typography>
          <Select
            size="small"
            value={selectedWeek ?? ''}
            displayEmpty
            onChange={(event) => setSelectedWeek(event.target.value)}
            sx={{
              minWidth: 120,
              fontSize: '0.75rem',
              '& .MuiSelect-select': { py: 0.5, px: 1.5 },
            }}
          >
            {data?.weeks.map((week) => (
              <MenuItem key={week} value={week} sx={{ fontSize: '0.75rem' }}>
                {week}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </Stack>

      {error instanceof Error ? <Alert severity="error" sx={{ m: 1 }}>{error.message}</Alert> : null}

      {/* Page content */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', py: 1.5 }}>
        {children}
      </Box>
    </Stack>
  );
}
