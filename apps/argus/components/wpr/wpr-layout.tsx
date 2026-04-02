'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  Alert,
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
      <Card sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            justifyContent="space-between"
            alignItems={{ lg: 'center' }}
            spacing={2}
          >
            <Stack spacing={1}>
              <Typography variant="h5">WPR workspace</Typography>
              <Typography variant="body2" color="text.secondary">
                Drive-backed weekly performance reporting with SQP, compare, competitor, changelog,
                and source coverage views.
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              {data ? <Chip label={`Default ${data.defaultWeek}`} color="primary" variant="outlined" /> : null}
              {data ? <Chip label={`${data.weeks.length} weeks loaded`} variant="outlined" /> : null}
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: 'column', xl: 'row' }}
            justifyContent="space-between"
            alignItems={{ xl: 'center' }}
            spacing={2}
          >
            <Tabs value={resolveTabValue(pathname)} variant="scrollable" scrollButtons="auto">
              {TAB_ITEMS.map((item) => (
                <Tab key={item.href} value={item.href} label={item.label} component={Link} href={item.href} />
              ))}
            </Tabs>

            <Stack direction="row" spacing={1.5} alignItems="center">
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
                sx={{ minWidth: 140 }}
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
