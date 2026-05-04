'use client';

import MuiTooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface ActiveStrategyIndicatorProps {
  strategyName: string;
  className?: string;
}

function GreenDot() {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        flexShrink: 0,
        borderRadius: '50%',
        bgcolor: '#10b981',
        boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.14)',
      }}
    />
  );
}

export function ActiveStrategyIndicator({ strategyName, className }: ActiveStrategyIndicatorProps) {
  return (
    <MuiTooltip title={strategyName} placement="bottom">
      <Box
        data-testid="active-strategy-indicator"
        className={className}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          height: 28,
          maxWidth: { xs: 150, sm: 200, md: 240, lg: 270, xl: 300 },
          minWidth: 0,
          color: '#064e3b',
          '.dark &': {
            color: '#d1fae5',
          },
        }}
      >
        <GreenDot />
        <Typography
          component="span"
          sx={{
            display: 'block',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {strategyName}
        </Typography>
      </Box>
    </MuiTooltip>
  );
}
