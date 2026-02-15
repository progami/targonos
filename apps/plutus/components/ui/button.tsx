import * as React from 'react';
import MuiButton from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import type { SxProps, Theme } from '@mui/material/styles';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  component?: React.ElementType;
  href?: string;
  sx?: SxProps<Theme>;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const variantMap: Record<ButtonVariant, { muiVariant: 'contained' | 'outlined' | 'text'; sx: object }> = {
  default: {
    muiVariant: 'contained',
    sx: {
      bgcolor: '#45B3D4',
      color: '#fff',
      '&:hover': { bgcolor: '#2fa3c7' },
      '&:active': { bgcolor: '#2384a1' },
    },
  },
  destructive: {
    muiVariant: 'contained',
    sx: {
      bgcolor: 'error.main',
      color: '#fff',
      '&:hover': { bgcolor: 'error.dark' },
    },
  },
  outline: {
    muiVariant: 'outlined',
    sx: {
      borderColor: 'divider',
      color: 'text.primary',
      bgcolor: 'background.paper',
      '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
    },
  },
  secondary: {
    muiVariant: 'contained',
    sx: {
      bgcolor: 'action.selected',
      color: 'text.primary',
      '&:hover': { bgcolor: 'action.hover' },
    },
  },
  ghost: {
    muiVariant: 'text',
    sx: {
      color: 'text.secondary',
      '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
    },
  },
  link: {
    muiVariant: 'text',
    sx: {
      color: '#2384a1',
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline', bgcolor: 'transparent' },
      p: 0,
      minWidth: 'auto',
    },
  },
};

const sizeMap: Record<ButtonSize, object> = {
  default: { height: 36, px: 2, fontSize: '0.875rem' },
  sm: { height: 32, px: 1.5, fontSize: '0.75rem' },
  lg: { height: 44, px: 3, fontSize: '1rem' },
  icon: { height: 36, width: 36, minWidth: 36, px: 0 },
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'default', sx, children, component, href, startIcon, endIcon, ...props }, ref) => {
    const mapped = variantMap[variant];
    const sizeStyles = sizeMap[size];

    if (size === 'icon') {
      return (
        <IconButton
          ref={ref}
          component={component as any}
          href={href}
          sx={{
            ...sizeStyles,
            borderRadius: '8px',
            ...mapped.sx,
            ...sx,
          }}
          {...(props as any)}
        >
          {children}
        </IconButton>
      );
    }

    return (
      <MuiButton
        ref={ref}
        variant={mapped.muiVariant}
        disableElevation
        component={component as any}
        href={href}
        startIcon={startIcon}
        endIcon={endIcon}
        sx={{
          borderRadius: '8px',
          textTransform: 'none',
          fontWeight: 500,
          gap: 1,
          whiteSpace: 'nowrap',
          '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' },
          '& .MuiButton-startIcon, & .MuiButton-endIcon': { '& > *': { fontSize: 16 } },
          ...sizeStyles,
          ...mapped.sx,
          ...sx,
        }}
        {...(props as any)}
      >
        {children}
      </MuiButton>
    );
  },
);
Button.displayName = 'Button';

export { Button };
