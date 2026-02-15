'use client';

import * as React from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

type SelectionCardProps = {
  selected?: boolean;
  badge?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  disabled?: boolean;
  sx?: SxProps<Theme>;
};

export function SelectionCard({
  selected = false,
  badge,
  icon,
  title,
  description,
  onClick,
  disabled = false,
  sx,
}: SelectionCardProps) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        borderRadius: 2,
        border: 2,
        borderColor: selected ? '#00C2B9' : 'divider',
        width: 240,
        minHeight: 180,
        overflow: 'hidden',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: selected ? '#00C2B9' : 'action.disabled',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        },
        '&:focus-visible': {
          outline: '2px solid rgba(0, 194, 185, 0.5)',
          outlineOffset: 2,
        },
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        boxShadow: selected ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
        ...sx,
      }}
    >
      {badge && (
        <Box
          sx={{
            width: '100%',
            py: 1,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'white',
            bgcolor: '#00C2B9',
          }}
        >
          {badge}
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          pt: badge ? 3 : 4,
        }}
      >
        {icon && (
          <Box
            sx={{
              mb: 2,
              color: selected ? '#00C2B9' : 'text.disabled',
              transition: 'color 0.2s',
            }}
          >
            {icon}
          </Box>
        )}

        <Typography
          variant="body1"
          sx={{
            fontWeight: 500,
            color: '#2384a1',
            transition: 'color 0.2s',
          }}
        >
          {title}
        </Typography>

        {description && (
          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', maxWidth: 200 }}>
            {description}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}
