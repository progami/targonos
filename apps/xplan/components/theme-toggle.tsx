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
      <div className="h-10 w-10 rounded-[14px] border border-slate-200/80 bg-white/70 dark:border-[#163f59] dark:bg-[#0b2236]/80" />
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
          width: 40,
          height: 40,
          borderRadius: '14px',
          border: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(255,255,255,0.72)',
          color: 'text.secondary',
          boxShadow: '0 14px 24px -22px rgba(15, 23, 42, 0.42)',
          '.dark &': {
            bgcolor: 'rgba(10, 26, 42, 0.84)',
          },
          '&:hover': {
            bgcolor: 'rgba(236, 242, 248, 0.96)',
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
