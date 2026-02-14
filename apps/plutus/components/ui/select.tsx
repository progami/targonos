'use client';

import * as React from 'react';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import type { SxProps, Theme } from '@mui/material/styles';

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  size?: 'small' | 'medium';
  displayEmpty?: boolean;
  renderValue?: (value: string) => React.ReactNode;
};

function Select({
  value,
  onValueChange,
  children,
  placeholder,
  disabled,
  sx,
  size = 'small',
  displayEmpty = true,
  renderValue,
}: SelectProps) {
  return (
    <FormControl size={size} fullWidth disabled={disabled}>
      <MuiSelect
        value={value}
        onChange={(e) => onValueChange(e.target.value as string)}
        displayEmpty={displayEmpty}
        renderValue={
          renderValue ??
          ((selected) => {
            if (!selected) return <span style={{ color: '#94a3b8' }}>{placeholder ?? 'Select'}</span>;
            return selected;
          })
        }
        sx={{
          borderRadius: '8px',
          fontSize: '0.875rem',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'divider',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#45B3D4',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00C2B9',
            borderWidth: 2,
          },
          ...sx,
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              borderRadius: 3,
              border: 1,
              borderColor: 'divider',
              boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
              mt: 0.5,
            },
          },
        }}
      >
        {children}
      </MuiSelect>
    </FormControl>
  );
}

type SelectItemProps = {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  sx?: SxProps<Theme>;
};

function SelectItem({ value, children, disabled, sx }: SelectItemProps) {
  return (
    <MenuItem
      value={value}
      disabled={disabled}
      sx={{
        borderRadius: 2,
        mx: 0.5,
        fontSize: '0.875rem',
        ...sx,
      }}
    >
      {children}
    </MenuItem>
  );
}

export { Select, SelectItem, MenuItem };
