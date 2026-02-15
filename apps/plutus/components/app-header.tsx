'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import NotificationsIcon from '@mui/icons-material/Notifications';
import InventoryIcon from '@mui/icons-material/Inventory';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
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

type NavItem =
  | { href: string; label: string; icon: SvgIconComponent }
  | { label: string; icon: SvgIconComponent; items: Array<{ href: string; label: string }> };

const NAV_ITEMS: NavItem[] = [
  { href: '/settlements', label: 'Settlements', icon: ReceiptLongIcon },
  { href: '/transactions', label: 'Transactions', icon: SwapHorizIcon },
  { href: '/cashflow', label: 'Cashflow', icon: TrendingUpIcon },
  {
    label: 'Accounts & Taxes',
    icon: ChecklistIcon,
    items: [
      { href: '/setup', label: 'Setup Wizard' },
      { href: '/chart-of-accounts', label: 'Chart of Accounts' },
    ],
  },
  {
    label: 'Cost Management',
    icon: InventoryIcon,
    items: [
      { href: '/audit-data', label: 'Audit Data' },
      { href: '/ads-data', label: 'Ads Data' },
      { href: '/reconciliation', label: 'Reconciliation' },
    ],
  },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

function NavDropdown({ item, pathname }: { item: Extract<NavItem, { items: any[] }>; pathname: string }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  const anyActive = item.items.some(
    (submenu) => pathname === submenu.href || pathname.startsWith(`${submenu.href}/`),
  );

  return (
    <>
      <Box
        component="button"
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          whiteSpace: 'nowrap',
          borderRadius: 2,
          px: 1.25,
          py: 1,
          fontSize: '13px',
          fontWeight: 500,
          border: 'none',
          bgcolor: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.15s',
          position: 'relative',
          color: anyActive ? '#2384a1' : 'text.secondary',
          '&:hover': { color: 'text.primary' },
        }}
      >
        <span>{item.label}</span>
        <ExpandMoreIcon
          sx={{
            fontSize: 14,
            color: 'text.disabled',
            transition: 'transform 0.2s',
            transform: menuOpen ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
        {anyActive && (
          <Box
            sx={{
              position: 'absolute',
              bottom: -13,
              left: 10,
              right: 10,
              height: 2,
              borderRadius: 1,
              bgcolor: '#45B3D4',
            }}
          />
        )}
      </Box>
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 220, mt: 0.75, p: 0.5 } } }}
      >
        {item.items.map((submenu) => (
          <MenuItem key={submenu.href} component={Link} href={submenu.href} onClick={() => setAnchorEl(null)}>
            {submenu.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifAnchor, setNotifAnchor] = useState<HTMLElement | null>(null);

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
      }}
    >
      <Box
        sx={{
          mx: 'auto',
          display: 'flex',
          height: 56,
          maxWidth: 1280,
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
                background: 'linear-gradient(135deg, #45B3D4, #2fa3c7)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(69, 179, 212, 0.25)',
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
            {NAV_ITEMS.map((item) => {
              if ('href' in item) {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ textDecoration: 'none' }}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        whiteSpace: 'nowrap',
                        borderRadius: 2,
                        px: 1.25,
                        py: 1,
                        fontSize: '13px',
                        fontWeight: 500,
                        transition: 'all 0.15s',
                        color: isActive ? '#2384a1' : 'text.secondary',
                        '&:hover': { color: 'text.primary' },
                      }}
                    >
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
                            bgcolor: '#45B3D4',
                          }}
                        />
                      )}
                    </Box>
                  </Link>
                );
              }

              return <NavDropdown key={item.label} item={item} pathname={pathname} />;
            })}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
            <MarketplaceSelector />
          </Box>

          {/* Notification bell */}
          <IconButton
            onClick={(e) => setNotifAnchor(e.currentTarget)}
            size="small"
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            aria-label="Notifications"
          >
            <NotificationsIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Menu
            anchorEl={notifAnchor}
            open={Boolean(notifAnchor)}
            onClose={() => setNotifAnchor(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            slotProps={{ paper: { sx: { width: 288, mt: 0.75, p: 0.5 } } }}
          >
            <Typography variant="caption" sx={{ display: 'block', px: 1, py: 0.75, fontWeight: 600, color: 'text.secondary' }}>
              Notifications
            </Typography>
            <MenuItem disabled>No notifications</MenuItem>
          </Menu>

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

      {/* Bottom gradient border */}
      <Box
        sx={{
          height: 1,
          background: 'linear-gradient(to right, transparent, rgba(69, 179, 212, 0.3), transparent)',
        }}
      />

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
          {NAV_ITEMS.map((item) => {
            if ('href' in item) {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                      color: isActive ? '#2384a1' : 'text.secondary',
                      bgcolor: isActive ? 'rgba(69, 179, 212, 0.08)' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Icon sx={{ fontSize: 16, color: isActive ? '#45B3D4' : 'text.disabled' }} />
                    {item.label}
                  </Box>
                </Link>
              );
            }

            return (
              <Box key={item.label}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'text.disabled',
                  }}
                >
                  {item.label}
                </Box>
                {item.items.map((submenu) => {
                  const isActive = pathname === submenu.href || pathname.startsWith(`${submenu.href}/`);
                  return (
                    <Link
                      key={submenu.href}
                      href={submenu.href}
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
                          pl: 3.5,
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          transition: 'background-color 0.15s',
                          color: isActive ? '#2384a1' : 'text.secondary',
                          bgcolor: isActive ? 'rgba(69, 179, 212, 0.08)' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        {submenu.label}
                      </Box>
                    </Link>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Drawer>
    </Box>
  );
}
