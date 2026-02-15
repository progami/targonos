'use client';

import * as React from 'react';
import Menu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import type { SxProps, Theme } from '@mui/material/styles';

type DropdownMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  sx?: SxProps<Theme>;
};

function DropdownMenu({ anchorEl, open, onClose, children, align = 'left', sx }: DropdownMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      transformOrigin={{ horizontal: align === 'right' ? 'right' : 'left', vertical: 'top' }}
      anchorOrigin={{ horizontal: align === 'right' ? 'right' : 'left', vertical: 'bottom' }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            minWidth: 176,
            boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
            mt: 0.75,
            p: 0.5,
            ...sx,
          },
        },
      }}
    >
      {children}
    </Menu>
  );
}

type DropdownMenuItemProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  component?: React.ElementType;
  href?: string;
};

function DropdownMenuItem({ children, onClick, disabled, sx, component, href }: DropdownMenuItemProps) {
  return (
    <MuiMenuItem
      onClick={onClick}
      disabled={disabled}
      component={component as any}
      href={href}
      sx={{
        borderRadius: 2,
        fontSize: '0.875rem',
        py: 0.75,
        px: 1,
        gap: 1,
        ...sx,
      }}
    >
      {children}
    </MuiMenuItem>
  );
}

function DropdownMenuLabel({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        px: 1,
        py: 0.75,
        fontWeight: 600,
        color: 'text.secondary',
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

function DropdownMenuSeparator({ sx }: { sx?: SxProps<Theme> }) {
  return <Divider sx={{ my: 0.5, mx: -0.5, ...sx }} />;
}

export {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
