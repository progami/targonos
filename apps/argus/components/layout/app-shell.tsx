'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import InsightsIcon from '@mui/icons-material/Insights';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ThemeToggle from './theme-toggle';

const DRAWER_WIDTH = 220;

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  matchPrefixes: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/wpr',
    label: 'WPR',
    description: 'Weekly performance reporting',
    icon: <InsightsIcon />,
    matchPrefixes: ['/wpr'],
  },
  {
    href: '/monitoring',
    label: 'Monitoring',
    description: 'Change feed and source health',
    icon: <AutoGraphIcon />,
    matchPrefixes: ['/monitoring', '/tracking'],
  },
  {
    href: '/listings',
    label: 'Listings',
    description: 'Replica editing and revision control',
    icon: <Inventory2Icon />,
    matchPrefixes: ['/listings'],
  },
];

function normalizePathname(pathname: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
  if (basePath === undefined) {
    return pathname;
  }

  const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (normalizedBasePath === '') {
    return pathname;
  }

  if (pathname.startsWith(normalizedBasePath)) {
    const nextPathname = pathname.slice(normalizedBasePath.length);
    if (nextPathname === '') {
      return '/';
    }

    return nextPathname;
  }

  return pathname;
}

function resolveSectionCopy(pathname: string) {
  if (pathname.startsWith('/wpr')) {
    return {
      eyebrow: 'Argus / WPR',
      title: 'Weekly performance reporting',
      subtitle: 'Read the current output package, compare weeks, and inspect source coverage.',
    };
  }

  if (pathname.startsWith('/monitoring') || pathname.startsWith('/tracking')) {
    return {
      eyebrow: 'Argus / Monitoring',
      title: 'Monitoring operations',
      subtitle: 'Track listing change events, source health, and ASIN-level timelines.',
    };
  }

  return {
    eyebrow: 'Argus / Listings',
    title: 'Listing controls',
    subtitle: 'Manage replica content, revisions, and snapshot ingest for Amazon PDPs.',
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const pathname = normalizePathname(usePathname());
  const [mobileOpen, setMobileOpen] = useState(false);
  const sectionCopy = useMemo(() => resolveSectionCopy(pathname), [pathname]);

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(8, 19, 29, 0.96)' : 'rgba(249, 252, 254, 0.96)',
        borderRight: '1px solid',
        borderColor: 'divider',
        px: 2,
        py: 2,
        backgroundImage:
          theme.palette.mode === 'dark'
            ? 'linear-gradient(180deg, rgba(0, 194, 185, 0.06) 0%, rgba(7, 18, 27, 0) 38%)'
            : 'linear-gradient(180deg, rgba(0, 44, 81, 0.05) 0%, rgba(243, 247, 250, 0) 42%)',
      }}
    >
      <Stack spacing={1.75}>
        <Box sx={{ px: 1, py: 0.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.03em' }}>
            Argus
          </Typography>
        </Box>

        <Divider />

        <List sx={{ px: 0 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));

            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                onClick={() => {
                  setMobileOpen(false);
                }}
                selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                sx={{
                  mb: 0.5,
                  px: 1,
                  py: 0.75,
                  borderRadius: 2,
                  alignItems: 'flex-start',
                  border: '1px solid',
                  borderColor: isActive ? alpha(theme.palette.primary.main, 0.18) : 'transparent',
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  boxShadow: isActive ? '0 10px 20px -18px rgba(0, 44, 81, 0.5)' : 'none',
                  '&:hover': {
                    bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.text.primary, 0.04),
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: 1.25,
                    mt: 0.2,
                    color: isActive ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontWeight: 700, fontSize: '0.96rem', letterSpacing: '-0.02em' }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Stack>
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: 'background.default',
        backgroundImage:
          theme.palette.mode === 'dark'
            ? 'radial-gradient(circle at top right, rgba(0, 194, 185, 0.08), transparent 24%), linear-gradient(180deg, rgba(14, 28, 41, 0.48), transparent 18%)'
            : 'radial-gradient(circle at top right, rgba(0, 194, 185, 0.1), transparent 22%), linear-gradient(180deg, rgba(0, 44, 81, 0.05), transparent 18%)',
      }}
    >
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          display: { xs: 'flex', md: 'none' },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            onClick={() => {
              setMobileOpen(true);
            }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Argus
          </Typography>
          <ThemeToggle />
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => {
            setMobileOpen(false);
          }}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          {drawer}
        </Drawer>

        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            px: { xs: 2, md: 4.5 },
            py: { xs: 9, md: 2 },
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.default, 0.9),
            backdropFilter: 'blur(22px)',
          }}
        >
          <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                {sectionCopy.eyebrow}
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  mt: 0.3,
                  fontSize: { xs: '1.4rem', md: '1.6rem' },
                  fontWeight: 700,
                  letterSpacing: '-0.05em',
                }}
              >
                {sectionCopy.title}
              </Typography>
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <ThemeToggle />
            </Box>
          </Stack>
        </Box>

        <Box sx={{ px: { xs: 2, md: 4.5 }, py: { xs: 2.25, md: 3.5 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
