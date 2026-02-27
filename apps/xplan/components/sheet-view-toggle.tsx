'use client';

import { useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import MuiTooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { usePersistentState } from '@/hooks/usePersistentState';

type SheetViewMode = 'tabular' | 'visual';

const options: Array<{ value: SheetViewMode; label: string; helper: string }> = [
  { value: 'tabular', label: 'Tabular', helper: 'View spreadsheet layout' },
  { value: 'visual', label: 'Visual', helper: 'Explore charts and timelines' },
];

interface SheetViewToggleProps {
  value: SheetViewMode;
  slug: string;
}

export function SheetViewToggle({ value, slug }: SheetViewToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [, setStoredView, hydrated] = usePersistentState<SheetViewMode>(
    `xplan:sheet-view:${slug}`,
    () => value,
  );

  useEffect(() => {
    if (!hydrated) return;
    setStoredView(value);
  }, [hydrated, setStoredView, value]);

  const handleChange = (_event: React.MouseEvent<HTMLElement>, newMode: SheetViewMode | null) => {
    if (!newMode || newMode === value) return;
    startTransition(() => {
      const params = searchParams
        ? new URLSearchParams(searchParams.toString())
        : new URLSearchParams();
      if (newMode === 'tabular') {
        params.delete('view');
      } else {
        params.set('view', newMode);
      }
      const query = params.toString();
      router.push(`${pathname}${query ? `?${query}` : ''}`);
    });
    if (hydrated) {
      setStoredView(newMode);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'text.secondary',
        }}
      >
        View
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={handleChange}
        size="small"
        aria-label="Select sheet view"
        sx={{
          '& .MuiToggleButton-root': {
            px: 1.25,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 500,
            '&.Mui-selected': {
              bgcolor: 'secondary.main',
              color: '#fff',
              '&:hover': { bgcolor: 'secondary.main' },
            },
          },
        }}
      >
        {options.map((option) => (
          <MuiTooltip key={option.value} title={option.helper} placement="bottom">
            <ToggleButton
              value={option.value}
              disabled={isPending && value === option.value}
            >
              {option.label}
            </ToggleButton>
          </MuiTooltip>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}

export type { SheetViewMode };
