'use client';

import * as React from 'react';
import MuiSwitch from '@mui/material/Switch';
import type { SxProps, Theme } from '@mui/material/styles';

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  id?: string;
  name?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, sx, ...props }, ref) => (
    <MuiSwitch
      ref={ref}
      checked={checked}
      onChange={(_, value) => onCheckedChange?.(value)}
      disabled={disabled}
      size="small"
      sx={{
        width: 36,
        height: 20,
        p: 0,
        '& .MuiSwitch-switchBase': {
          p: '2px',
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            color: '#fff',
            '& + .MuiSwitch-track': {
              bgcolor: '#45B3D4',
              opacity: 1,
            },
          },
        },
        '& .MuiSwitch-thumb': {
          width: 16,
          height: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        },
        '& .MuiSwitch-track': {
          borderRadius: 10,
          opacity: 1,
          bgcolor: 'action.disabled',
        },
        ...sx,
      }}
      {...(props as any)}
    />
  ),
);
Switch.displayName = 'Switch';

export { Switch };
