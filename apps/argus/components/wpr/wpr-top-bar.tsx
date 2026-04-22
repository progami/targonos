'use client';

import { Box, Stack } from '@mui/material';
import { WPR_TABS, type WprTab } from '@/lib/wpr/dashboard-state';
import { panelBgDarker, subtleBorder, teal, textPrimary, textSecondary } from '@/lib/wpr/panel-tokens';

export default function WprTopBar({
  activeTab,
  onSelectTab,
}: {
  activeTab: WprTab;
  onSelectTab: (tab: WprTab) => void;
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
    </Stack>
  );
}
