'use client';

import * as React from 'react';
import MuiTooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';

type SimpleTooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  sx?: object;
  style?: React.CSSProperties;
};

function Tooltip({ content, children, position = 'top', delay = 100, sx, style }: SimpleTooltipProps) {
  return (
    <MuiTooltip
      title={content}
      placement={position}
      enterDelay={delay}
      arrow={false}
    >
      <Box component="div" sx={sx} style={style}>
        {children}
      </Box>
    </MuiTooltip>
  );
}

export { Tooltip };
