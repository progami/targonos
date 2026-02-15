'use client';

import * as React from 'react';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

function Tabs({ value, onValueChange, children, sx }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <Box sx={sx}>{children}</Box>
    </TabsContext.Provider>
  );
}

const TabsContext = React.createContext<{ value: string; onValueChange: (v: string) => void }>({
  value: '',
  onValueChange: () => {},
});

type TabsListProps = {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

function TabsList({ children, sx }: TabsListProps) {
  const { value, onValueChange } = React.useContext(TabsContext);

  return (
    <MuiTabs
      value={value}
      onChange={(_, newValue) => onValueChange(newValue)}
      sx={{
        minHeight: 40,
        bgcolor: 'action.hover',
        borderRadius: 2,
        p: 0.5,
        '& .MuiTabs-flexContainer': { gap: 0.5 },
        '& .MuiTabs-indicator': { display: 'none' },
        ...sx,
      }}
    >
      {children}
    </MuiTabs>
  );
}

type TabsTriggerProps = {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  sx?: SxProps<Theme>;
};

function TabsTrigger({ value, children, disabled, sx }: TabsTriggerProps) {
  return (
    <MuiTab
      value={value}
      label={children}
      disabled={disabled}
      sx={{
        minHeight: 36,
        px: 1.5,
        py: 0.75,
        borderRadius: 1.5,
        fontSize: '0.875rem',
        fontWeight: 500,
        textTransform: 'none',
        color: 'text.secondary',
        '&:hover': { color: 'text.primary' },
        '&.Mui-selected': {
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        },
        ...sx,
      }}
    />
  );
}

type TabsContentProps = {
  value: string;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

function TabsContent({ value, children, sx }: TabsContentProps) {
  const { value: activeValue } = React.useContext(TabsContext);

  if (activeValue !== value) return null;

  return <Box sx={{ mt: 2, ...sx }}>{children}</Box>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
