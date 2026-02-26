'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import MuiTooltip from '@mui/material/Tooltip';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800" />
    );
  }

  const isDark = theme === 'dark';

  return (
    <MuiTooltip title={isDark ? 'Light mode' : 'Dark mode'} placement="bottom">
      <IconButton
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        size="small"
        sx={{
          width: 36,
          height: 36,
          borderRadius: '12px',
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.secondary',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
          '&:hover': {
            bgcolor: 'action.hover',
            color: 'text.primary',
          },
        }}
      >
        {isDark ? (
          <LightModeOutlined sx={{ fontSize: 22 }} />
        ) : (
          <DarkModeOutlined sx={{ fontSize: 22 }} />
        )}
      </IconButton>
    </MuiTooltip>
  );
}
