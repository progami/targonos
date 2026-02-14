'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Select, SelectItem } from '@/components/ui/select';
import type { SxProps, Theme } from '@mui/material/styles';

type FilterOption = {
  value: string;
  label: string;
};

type FilterConfig = {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  options: FilterOption[];
  onChange: (value: string) => void;
};

type FilterBarProps = {
  filters: FilterConfig[];
  onFilter?: () => void;
  onClear?: () => void;
  showFilterButton?: boolean;
  showClearButton?: boolean;
  sx?: SxProps<Theme>;
};

export function FilterBar({
  filters,
  onFilter,
  onClear,
  showFilterButton = true,
  showClearButton = true,
  sx,
}: FilterBarProps) {
  const hasActiveFilters = filters.some((f) => f.value !== '' && f.value !== 'all');

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: 2,
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 2.5,
        boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 12px -4px rgba(0, 0, 0, 0.04)',
        ...sx,
      }}
    >
      {filters.map((filter) => (
        <Box key={filter.key} sx={{ flex: 1, minWidth: 160 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 0.75,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#2384a1',
            }}
          >
            {filter.label}
          </Typography>
          <Select
            value={filter.value}
            onValueChange={filter.onChange}
            placeholder={filter.placeholder}
            sx={{ height: 44 }}
          >
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </Box>
      ))}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {showClearButton && hasActiveFilters && (
          <Button variant="ghost" onClick={onClear} sx={{ height: 44, px: 2 }}>
            Clear
          </Button>
        )}
        {showFilterButton && (
          <Button
            onClick={onFilter}
            sx={{ height: 44, px: 3, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Filter
          </Button>
        )}
      </Box>
    </Box>
  );
}
