'use client';

import { Box, MenuItem, Select, Stack, Typography } from '@mui/material';
import { WPR_TABS, type WprTab } from '@/lib/wpr/dashboard-state';
import { panelBgDarker, subtleBorder, teal, textMuted, textPrimary, textSecondary } from '@/lib/wpr/panel-tokens';
import type { WeekLabel } from '@/lib/wpr/types';

export default function WprTopBar({
  activeTab,
  selectedWeek,
  weeks,
  onSelectTab,
  onSelectWeek,
}: {
  activeTab: WprTab;
  selectedWeek: WeekLabel | null;
  weeks: WeekLabel[];
  onSelectTab: (tab: WprTab) => void;
  onSelectWeek: (week: WeekLabel) => void;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        px: 1.5,
        py: 1,
        borderBottom: subtleBorder,
        bgcolor: panelBgDarker,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        {WPR_TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <Box
              key={tab.id}
              component="button"
              type="button"
              onClick={() => onSelectTab(tab.id)}
              sx={{
                border: '1px solid',
                borderColor: selected ? 'rgba(0,194,185,0.5)' : 'rgba(255,255,255,0.08)',
                bgcolor: selected ? 'rgba(0,194,185,0.14)' : 'transparent',
                color: selected ? teal : textSecondary,
                borderRadius: '999px',
                px: 1.5,
                py: 0.7,
                fontSize: '0.68rem',
                fontWeight: selected ? 700 : 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  color: selected ? teal : textPrimary,
                  bgcolor: selected ? 'rgba(0,194,185,0.18)' : 'rgba(255,255,255,0.04)',
                },
              }}
            >
              {tab.label}
            </Box>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography
          sx={{
            fontSize: '0.65rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: textMuted,
            fontWeight: 600,
          }}
        >
          Week
        </Typography>
        <Select
          size="small"
          value={selectedWeek ?? ''}
          onChange={(event) => onSelectWeek(event.target.value)}
          sx={{
            minWidth: 150,
            fontSize: '0.75rem',
            color: textPrimary,
            bgcolor: 'rgba(255,255,255,0.03)',
            '& .MuiSelect-icon': {
              color: textMuted,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255,255,255,0.08)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255,255,255,0.16)',
            },
            '& .MuiSelect-select': {
              py: 0.75,
            },
          }}
        >
          {weeks.map((week) => (
            <MenuItem key={week} value={week} sx={{ fontSize: '0.75rem' }}>
              {week}
            </MenuItem>
          ))}
        </Select>
      </Stack>
    </Stack>
  );
}
