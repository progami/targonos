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
import MenuIcon from '@mui/icons-material/Menu';
import InsightsIcon from '@mui/icons-material/Insights';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ThemeToggle from './theme-toggle';

const DRAWER_WIDTH = 296;

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
  const pathname = normalizePathname(usePathname());
  const [mobileOpen, setMobileOpen] = useState(false);
  const sectionCopy = useMemo(() => resolveSectionCopy(pathname), [pathname]);

  const drawer = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        px: 2.5,
        py: 2.5,
      }}
    >
      <Stack spacing={1.5}>
        <Box
          sx={{
            borderRadius: 4,
            px: 1.5,
            py: 1.5,
            color: 'primary.contrastText',
            background: 'linear-gradient(180deg, #002C51 0%, #0E3A60 100%)',
          }}
        >
          <Typography variant="overline" sx={{ color: 'rgba(255, 255, 255, 0.72)' }}>
            TargonOS Suite
          </Typography>
          <Typography variant="h5" sx={{ mt: 0.25 }}>
            Argus
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: 'rgba(255, 255, 255, 0.72)' }}>
            WPR, monitoring, and listing workflows in one workspace.
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
                sx={{
                  mb: 1,
                  borderRadius: 3,
                  alignItems: 'flex-start',
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'primary.main' : 'text.secondary' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontWeight: 700 }}
                  secondary={item.description}
                  secondaryTypographyProps={{ sx: { color: 'text.secondary' } }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
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
            px: { xs: 2, md: 4 },
            py: { xs: 9, md: 3 },
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.default',
            backdropFilter: 'blur(20px)',
          }}
        >
          <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">
                {sectionCopy.eyebrow}
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.5 }}>
                {sectionCopy.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {sectionCopy.subtitle}
              </Typography>
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <ThemeToggle />
            </Box>
          </Stack>
        </Box>

        <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
