'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import MapIcon from '@mui/icons-material/Map';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { QboStatusIndicator } from '@/components/qbo-status-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { type Marketplace, useMarketplaceStore } from '@/lib/store/marketplace';
import type { SvgIconComponent } from '@mui/icons-material';

function LogoIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <path
        d="M10 7v10M10 7h3a3.5 3.5 0 010 7h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function QboStatusFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 1.5,
        py: 0.75,
      }}
    >
      <Box
        sx={{
          height: 10,
          width: 10,
          borderRadius: '50%',
          bgcolor: 'action.disabled',
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
        }}
      />
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>QuickBooks</Typography>
    </Box>
  );
}

const MARKETPLACE_OPTIONS: Array<{ value: Marketplace; label: string; shortLabel: string; flag: string }> = [
  { value: 'all', label: 'All Marketplaces', shortLabel: 'All', flag: '' },
  { value: 'US', label: 'US - Amazon.com', shortLabel: 'US', flag: '\u{1F1FA}\u{1F1F8}' },
  { value: 'UK', label: 'UK - Amazon.co.uk', shortLabel: 'UK', flag: '\u{1F1EC}\u{1F1E7}' },
];

function MarketplaceSelector() {
  const marketplace = useMarketplaceStore((s) => s.marketplace);
  const setMarketplace = useMarketplaceStore((s) => s.setMarketplace);

  const current = MARKETPLACE_OPTIONS.find((o) => o.value === marketplace);

  return (
    <FormControl size="small" sx={{ minWidth: 80 }}>
      <Select
        value={marketplace}
        onChange={(e: SelectChangeEvent) => setMarketplace(e.target.value as Marketplace)}
        renderValue={() => (current?.flag ? `${current.flag} ${current.shortLabel}` : current?.shortLabel ?? '')}
        sx={{ height: 32, fontSize: '0.75rem', fontWeight: 500, '& .MuiSelect-select': { py: 0.5 } }}
      >
        {MARKETPLACE_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.flag ? `${opt.flag}  ${opt.label}` : opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

type NavItem = { href: string; label: string; icon: SvgIconComponent };

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: '/settlements', label: 'Settlements', icon: ReceiptLongIcon },
  { href: '/purchase-orders', label: 'Inventory', icon: Inventory2Icon },
  { href: '/exceptions', label: 'Exceptions', icon: ReportProblemIcon },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: '/settlement-mapping', label: 'Settlement Rules', icon: MapIcon },
  { href: '/qbo-audit', label: 'QBO Audit', icon: FactCheckIcon },
];

const ALL_NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...SECONDARY_NAV_ITEMS];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const moreOpen = Boolean(moreAnchor);
  const secondaryActive = SECONDARY_NAV_ITEMS.some((item) => isActivePath(pathname, item.href));

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        bgcolor: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        '.dark &': { bgcolor: 'rgba(4, 19, 36, 0.9)' },
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          mx: 'auto',
          display: 'flex',
          height: 56,
          maxWidth: 1440,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: { xs: 2, sm: 3, lg: 4 },
        }}
      >
        <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 3 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
            <Box
              sx={{
                display: 'flex',
                height: 32,
                width: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #0b273f, #00C2B9)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(11, 39, 63, 0.25)',
              }}
            >
              <LogoIcon />
            </Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, letterSpacing: '0.16em', color: 'text.primary' }}
            >
              PLUTUS
            </Typography>
          </Link>

          {/* Desktop nav */}
          <Box component="nav" sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.25 }}>
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ textDecoration: 'none' }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      whiteSpace: 'nowrap',
                      borderRadius: 2,
                      px: 1,
                      py: 1,
                      fontSize: '12.5px',
                      fontWeight: 500,
                      transition: 'all 0.15s',
                      color: isActive ? '#008f87' : 'text.secondary',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    <Icon sx={{ fontSize: 15, color: isActive ? '#00C2B9' : 'text.disabled' }} />
                    {item.label}
                    {isActive && (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: -13,
                          left: 10,
                          right: 10,
                          height: 2,
                          borderRadius: 1,
                          bgcolor: '#00C2B9',
                        }}
                      />
                    )}
                  </Box>
                </Link>
              );
            })}
            <Box sx={{ position: 'relative' }}>
              <IconButton
                aria-label="More Plutus sections"
                aria-controls={moreOpen ? 'plutus-more-menu' : undefined}
                aria-haspopup="menu"
                aria-expanded={moreOpen ? 'true' : undefined}
                onClick={(event) => setMoreAnchor(event.currentTarget)}
                size="small"
                sx={{
                  ml: 0.25,
                  width: 34,
                  height: 34,
                  borderRadius: 2,
                  color: secondaryActive ? '#008f87' : 'text.secondary',
                  bgcolor: secondaryActive ? 'rgba(0, 194, 185, 0.08)' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                }}
              >
                <MoreHorizIcon sx={{ fontSize: 19 }} />
              </IconButton>
              {secondaryActive && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: -12,
                    left: 8,
                    right: 8,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: '#00C2B9',
                  }}
                />
              )}
            </Box>
            <Menu
              id="plutus-more-menu"
              anchorEl={moreAnchor}
              open={moreOpen}
              onClose={() => setMoreAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    minWidth: 230,
                    border: 1,
                    borderColor: 'divider',
                    boxShadow: '0 14px 40px rgba(2, 12, 27, 0.18)',
                  },
                },
              }}
            >
              {SECONDARY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(pathname, item.href);
                return (
                  <MenuItem
                    key={item.href}
                    component={Link}
                    href={item.href}
                    selected={isActive}
                    onClick={() => setMoreAnchor(null)}
                    sx={{ gap: 1, py: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <Icon sx={{ fontSize: 17, color: isActive ? '#00A59E' : 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: 13, fontWeight: isActive ? 650 : 500 }}
                    />
                  </MenuItem>
                );
              })}
            </Menu>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
            <MarketplaceSelector />
          </Box>

          <Suspense fallback={<QboStatusFallback />}>
            <QboStatusIndicator />
          </Suspense>
          <ThemeToggle />

          {/* Mobile menu toggle */}
          <IconButton
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            size="small"
            sx={{
              display: { lg: 'none' },
              width: 36,
              height: 36,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {mobileOpen ? <CloseIcon sx={{ fontSize: 20 }} /> : <MenuIcon sx={{ fontSize: 20 }} />}
          </IconButton>
        </Box>
      </Box>


      {/* Mobile nav drawer */}
      <Drawer
        anchor="top"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { lg: 'none' },
          '& .MuiDrawer-paper': {
            top: 57,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
          },
        }}
        slotProps={{ backdrop: { sx: { top: 57 } } }}
      >
        <Box sx={{ mx: 'auto', maxWidth: 1280, width: '100%', px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Box sx={{ mb: 1, px: 1.5, display: { md: 'none' } }}>
            <MarketplaceSelector />
          </Box>
          {ALL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                style={{ textDecoration: 'none' }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    borderRadius: 2,
                    px: 1.5,
                    py: 1.25,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'background-color 0.15s',
                    color: isActive ? '#008f87' : 'text.secondary',
                    bgcolor: isActive ? 'rgba(0, 194, 185, 0.08)' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Icon sx={{ fontSize: 16, color: isActive ? '#00C2B9' : 'text.disabled' }} />
                  {item.label}
                </Box>
              </Link>
            );
          })}
        </Box>
      </Drawer>
    </Box>
  );
}
