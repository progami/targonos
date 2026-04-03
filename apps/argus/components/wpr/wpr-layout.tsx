'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  Alert,
  Box,
  Card,
  Chip,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
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

  useEffect(() => {
    if (data === undefined) {
      return;
    }

    if (selectedWeek === null) {
      setSelectedWeek(data.defaultWeek);
      return;
    }

    if (data.weeks.includes(selectedWeek)) {
      return;
    }

    setSelectedWeek(data.defaultWeek);
  }, [data, selectedWeek, setSelectedWeek]);

  return (
    <Stack spacing={3}>
      <Card
        sx={{
          p: { xs: 2, md: 2.75 },
          borderRadius: 4.5,
          overflow: 'hidden',
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 250, 252, 0.96) 100%)',
          boxShadow: '0 26px 50px -34px rgba(0, 44, 81, 0.34)',
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            justifyContent="space-between"
            alignItems={{ lg: 'center' }}
            spacing={2}
          >
            <Stack spacing={1}>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.04em' }}>
                WPR workspace
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 620, lineHeight: 1.6 }}>
                Drive-backed weekly performance reporting with SQP, compare, competitor, changelog,
                and source coverage views.
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {data ? (
                <Chip
                  label={`Default ${data.defaultWeek}`}
                  color="primary"
                  variant="outlined"
                  sx={{ bgcolor: 'rgba(0, 194, 185, 0.06)' }}
                />
              ) : null}
              {data ? <Chip label={`${data.weeks.length} weeks loaded`} variant="outlined" /> : null}
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: 'column', xl: 'row' }}
            justifyContent="space-between"
            alignItems={{ xl: 'center' }}
            spacing={2}
          >
            <Box
              sx={{
                borderRadius: 999,
                border: '1px solid rgba(0, 44, 81, 0.08)',
                bgcolor: 'rgba(239, 243, 246, 0.9)',
                px: 0.6,
                py: 0.6,
                overflowX: 'auto',
              }}
            >
              <Tabs
                value={resolveTabValue(pathname)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 44,
                  '& .MuiTab-root': {
                    minHeight: 36,
                    borderRadius: 999,
                    px: 1.6,
                  },
                  '& .MuiTabs-indicator': {
                    display: 'none',
                  },
                  '& .Mui-selected': {
                    bgcolor: '#FFFFFF',
                    boxShadow: '0 10px 18px -16px rgba(0, 44, 81, 0.48)',
                  },
                }}
              >
                {TAB_ITEMS.map((item) => (
                  <Tab key={item.href} value={item.href} label={item.label} component={Link} href={item.href} />
                ))}
              </Tabs>
            </Box>

            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                alignSelf: { xs: 'stretch', xl: 'auto' },
                px: 1.4,
                py: 1,
                borderRadius: 3,
                bgcolor: 'rgba(234, 241, 247, 0.8)',
                border: '1px solid rgba(0, 44, 81, 0.08)',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Selected week
              </Typography>
              <Select
                size="small"
                value={selectedWeek ?? ''}
                displayEmpty
                onChange={(event) => {
                  setSelectedWeek(event.target.value);
                }}
                sx={{ minWidth: 148, bgcolor: '#FFFFFF' }}
              >
                {data?.weeks.map((week) => (
                  <MenuItem key={week} value={week}>
                    {week}
                  </MenuItem>
                ))}
              </Select>
            </Stack>
          </Stack>
        </Stack>
      </Card>

      {error instanceof Error ? <Alert severity="error">{error.message}</Alert> : null}
      {children}
    </Stack>
  );
}
