'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import MuiTooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import type { SheetConfig, SheetSlug } from '@/lib/sheets';

type SheetTab = SheetConfig & { href?: string; prefetch?: boolean };

interface SheetTabsProps {
  sheets: SheetTab[];
  activeSlug: SheetSlug;
  suffix?: React.ReactNode;
  variant?: 'scroll' | 'stack';
  onSheetSelect?: (slug: SheetSlug) => void;
}

export function SheetTabs({
  sheets,
  activeSlug,
  suffix,
  variant = 'scroll',
  onSheetSelect,
}: SheetTabsProps) {
  const pathname = usePathname();
  const isStack = variant === 'stack';

  const handleClick = (slug: SheetSlug, event: React.MouseEvent) => {
    if (!onSheetSelect) return;
    event.preventDefault();
    onSheetSelect(slug);
  };

  const activeIndex = sheets.findIndex((sheet) => sheet.slug === activeSlug);

  if (isStack) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 1.5 }}>
        <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {sheets.map((sheet) => {
            const Icon = sheet.icon;
            const href = sheet.href ?? `/${sheet.slug}`;
            const isActive = activeSlug === sheet.slug || pathname === href;
            return (
              <ListItemButton
                key={sheet.slug}
                component={Link}
                href={href}
                prefetch={sheet.prefetch}
                onClick={onSheetSelect ? (event: React.MouseEvent) => handleClick(sheet.slug, event) : undefined}
                selected={isActive}
                sx={{
                  borderRadius: '16px',
                  border: 1,
                  borderColor: isActive ? 'secondary.main' : 'divider',
                  py: 1.5,
                  px: 2,
                  minWidth: 160,
                  ...(isActive && {
                    bgcolor: 'rgba(0, 194, 185, 0.15)',
                    boxShadow: 2,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(0, 194, 185, 0.15)',
                      '&:hover': { bgcolor: 'rgba(0, 194, 185, 0.2)' },
                    },
                  }),
                }}
              >
                {Icon && (
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Icon size={16} />
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={sheet.label}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                />
              </ListItemButton>
            );
          })}
        </List>
        {suffix && <Box sx={{ flexShrink: 0 }}>{suffix}</Box>}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.5 }}>
      <Tabs
        value={activeIndex >= 0 ? activeIndex : false}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          minHeight: 36,
          '& .MuiTabs-indicator': {
            bgcolor: 'secondary.main',
          },
          '& .MuiTab-root': {
            minHeight: 36,
            px: 1.25,
            py: 0.5,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'text.secondary',
            borderRadius: '6px',
            transition: 'background-color 0.15s',
            '&.Mui-selected': {
              color: 'secondary.main',
              bgcolor: 'rgba(0,194,185,0.12)',
              '.dark &': {
                bgcolor: 'rgba(0,194,185,0.18)',
              },
            },
          },
        }}
      >
        {sheets.map((sheet, index) => {
          const Icon = sheet.icon;
          const href = sheet.href ?? `/${sheet.slug}`;
          return (
            <Tab
              key={sheet.slug}
              component={Link}
              href={href}
              prefetch={sheet.prefetch}
              onClick={onSheetSelect ? (event: React.MouseEvent) => handleClick(sheet.slug, event) : undefined}
              icon={Icon ? <Icon size={16} /> : undefined}
              iconPosition="start"
              label={
                <MuiTooltip title={sheet.label} placement="bottom">
                  <span>{sheet.shortLabel}</span>
                </MuiTooltip>
              }
            />
          );
        })}
      </Tabs>
      {suffix && <Box sx={{ flexShrink: 0 }}>{suffix}</Box>}
    </Box>
  );
}
