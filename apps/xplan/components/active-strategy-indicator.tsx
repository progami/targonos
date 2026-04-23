'use client';

import Chip from '@mui/material/Chip';
import MuiTooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

interface ActiveStrategyIndicatorProps {
  strategyName: string;
  className?: string;
}

const pulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0; transform: scale(2); }
`;

function GreenDot() {
  return (
    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 8, height: 8, flexShrink: 0 }}>
      <Box
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          bgcolor: '#34d399',
          animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
        }}
      />
      <Box sx={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
    </Box>
  );
}

export function ActiveStrategyIndicator({ strategyName, className }: ActiveStrategyIndicatorProps) {
  return (
    <MuiTooltip title={strategyName} placement="bottom">
      <Chip
        icon={<GreenDot />}
        label={strategyName}
        size="small"
        className={className}
        sx={{
          height: 28,
          borderRadius: '9999px',
          fontWeight: 700,
          fontSize: '11px',
          border: 1,
          borderColor: 'rgba(16, 185, 129, 0.2)',
          bgcolor: 'rgba(240, 253, 250, 0.86)',
          color: '#064e3b',
          boxShadow: '0 12px 24px -22px rgba(6, 78, 59, 0.42)',
          '.dark &': {
            borderColor: 'rgba(16, 185, 129, 0.3)',
            bgcolor: 'rgba(16, 185, 129, 0.12)',
            color: '#d1fae5',
          },
          '& .MuiChip-label': {
            whiteSpace: 'nowrap',
            paddingLeft: 2,
            paddingRight: 8,
          },
        }}
      />
    </MuiTooltip>
  );
}
