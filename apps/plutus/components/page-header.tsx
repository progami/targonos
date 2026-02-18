'use client';

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

type PageHeaderProps = {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  sx?: SxProps<Theme>;
  variant?: 'default' | 'accent';
};

export function PageHeader({ title, kicker, description, actions, sx, variant = 'default' }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        alignItems: { sm: 'flex-end' },
        justifyContent: { sm: 'space-between' },
        ...sx,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {kicker && (
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'text.secondary',
            }}
          >
            {kicker}
          </Typography>
        )}
        <Typography
          variant="h1"
          component="h1"
          sx={{
            mt: kicker ? 0.5 : 0,
            fontFamily: 'var(--font-sans), Outfit, system-ui, sans-serif',
            fontSize: '1.875rem',
            lineHeight: 1,
            letterSpacing: '-0.025em',
            color: variant === 'accent' ? '#f97316' : 'text.primary',
          }}
        >
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
            {description}
          </Typography>
        )}
        <Box
          sx={{
            mt: 1.5,
            height: 1,
            width: 96,
            background: 'linear-gradient(to right, rgba(69, 179, 212, 0.5), transparent)',
          }}
        />
      </Box>

      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            gap: 1,
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
