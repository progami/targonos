'use client';

import * as React from 'react';
import MuiButton from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Box from '@mui/material/Box';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type DropdownItem = {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
};

type SplitButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  dropdownItems: DropdownItem[];
  disabled?: boolean;
  sx?: object;
};

export function SplitButton({
  children,
  onClick,
  dropdownItems,
  disabled = false,
  sx,
}: SplitButtonProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  return (
    <Box sx={{ display: 'inline-flex', ...sx }}>
      <ButtonGroup variant="contained" disableElevation disabled={disabled}>
        <MuiButton
          onClick={onClick}
          sx={{
            bgcolor: '#45B3D4',
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            px: 2,
            borderRight: '1px solid rgba(255,255,255,0.2) !important',
            '&:hover': { bgcolor: '#2fa3c7' },
          }}
        >
          {children}
        </MuiButton>
        <MuiButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            bgcolor: '#2fa3c7',
            color: '#fff',
            px: 0.5,
            minWidth: 32,
            '&:hover': { bgcolor: '#2384a1' },
          }}
        >
          <ExpandMoreIcon sx={{ fontSize: 18 }} />
        </MuiButton>
      </ButtonGroup>

      <DropdownMenu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => setAnchorEl(null)}
        align="right"
        sx={{ minWidth: 140 }}
      >
        {dropdownItems.map((item, index) => (
          <DropdownMenuItem
            key={index}
            onClick={() => {
              item.onClick();
              setAnchorEl(null);
            }}
            disabled={item.disabled}
            sx={item.variant === 'destructive' ? { color: 'error.main' } : undefined}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </Box>
  );
}
