import * as React from 'react';
import Chip from '@mui/material/Chip';
import type { ChipProps } from '@mui/material/Chip';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success';

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
  variant?: BadgeVariant;
  sx?: ChipProps['sx'];
}

const variantMap: Record<BadgeVariant, { color: ChipProps['color']; variant: ChipProps['variant']; sx?: object }> = {
  default: {
    color: 'info',
    variant: 'filled',
    sx: { bgcolor: 'rgba(69, 179, 212, 0.1)', color: '#2384a1', '.MuiChip-label': { fontWeight: 500 } },
  },
  secondary: {
    color: 'default',
    variant: 'filled',
    sx: { bgcolor: 'action.hover', color: 'text.secondary' },
  },
  destructive: {
    color: 'error',
    variant: 'filled',
    sx: { bgcolor: 'error.main', color: 'error.contrastText', opacity: 0.9 },
  },
  outline: {
    color: 'default',
    variant: 'outlined',
    sx: {},
  },
  success: {
    color: 'success',
    variant: 'filled',
    sx: { bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' },
  },
};

function Badge({ variant = 'default', children, sx, ...props }: BadgeProps) {
  const mapped = variantMap[variant];
  return (
    <Chip
      label={children}
      size="small"
      color={mapped.color}
      variant={mapped.variant}
      sx={{
        height: 22,
        fontSize: '0.6875rem',
        fontWeight: 500,
        borderRadius: '6px',
        ...mapped.sx,
        ...sx,
      }}
      {...(props as any)}
    />
  );
}

export { Badge };
