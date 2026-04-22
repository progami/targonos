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
        <List
          disablePadding
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            borderRadius: '20px',
            border: 1,
            borderColor: 'divider',
            bgcolor: 'rgba(255,255,255,0.72)',
            p: 1,
            '.dark &': {
              bgcolor: 'rgba(10, 26, 42, 0.84)',
            },
          }}
        >
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
                  borderRadius: '14px',
                  border: 1,
                  borderColor: isActive ? 'rgba(0, 194, 185, 0.3)' : 'transparent',
                  py: 1.25,
                  px: 1.75,
                  minWidth: 160,
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: 'rgba(15, 23, 42, 0.04)',
                  },
                  ...(isActive && {
                    bgcolor: 'rgba(239, 251, 250, 0.96)',
                    color: 'text.primary',
                    boxShadow: '0 16px 30px -24px rgba(15, 23, 42, 0.38)',
                    '.dark &': {
                      bgcolor: 'rgba(9, 35, 51, 0.92)',
                    },
                    '&.Mui-selected': {
                      bgcolor: 'rgba(239, 251, 250, 0.96)',
                      '.dark &': {
                        bgcolor: 'rgba(9, 35, 51, 0.92)',
                      },
                      '&:hover': { bgcolor: 'rgba(232, 248, 246, 1)' },
                    },
                  }),
                }}
              >
                {Icon && (
                  <ListItemIcon
                    sx={{
                      minWidth: 32,
                      color: isActive ? 'secondary.main' : 'text.secondary',
                    }}
                  >
                    <Icon size={16} />
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={sheet.label}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
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
    <Box
      sx={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        borderRadius: '18px',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'rgba(255,255,255,0.64)',
        px: 0.75,
        py: 0.75,
        '.dark &': {
          bgcolor: 'rgba(10, 26, 42, 0.8)',
        },
      }}
    >
      <Tabs
        value={activeIndex >= 0 ? activeIndex : false}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          minHeight: 40,
          '& .MuiTabs-flexContainer': {
            gap: 0.75,
          },
          '& .MuiTabs-indicator': {
            display: 'none',
          },
          '& .MuiTab-root': {
            minHeight: 40,
            minWidth: 0,
            px: 1.5,
            py: 0.75,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'text.secondary',
            borderRadius: '12px',
            transition: 'background-color 0.15s, color 0.15s, box-shadow 0.15s',
            '&:hover': {
              bgcolor: 'rgba(15, 23, 42, 0.04)',
            },
            '&.Mui-selected': {
              color: 'text.primary',
              bgcolor: 'rgba(239, 251, 250, 0.96)',
              boxShadow: '0 14px 24px -22px rgba(15, 23, 42, 0.45)',
              '.dark &': {
                bgcolor: 'rgba(9, 35, 51, 0.94)',
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
