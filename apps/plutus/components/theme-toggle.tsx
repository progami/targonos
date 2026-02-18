'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Box
        sx={{
          height: 32,
          width: 32,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      />
    );
  }

  const isDark = theme === 'dark';

  return (
    <IconButton
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      size="small"
      sx={{
        width: 32,
        height: 32,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.secondary',
        '&:hover': {
          bgcolor: 'action.hover',
          color: 'text.primary',
        },
      }}
    >
      {isDark ? <LightModeIcon sx={{ fontSize: 16 }} /> : <DarkModeIcon sx={{ fontSize: 16 }} />}
    </IconButton>
  );
}
