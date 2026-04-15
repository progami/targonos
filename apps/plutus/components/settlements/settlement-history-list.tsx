'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { SettlementHistoryViewModel } from '@/lib/plutus/settlement-review';

type SettlementHistoryListProps = {
  rows: SettlementHistoryViewModel[];
};

export function SettlementHistoryList({ rows }: SettlementHistoryListProps) {
  return (
    <Box component="section" sx={{ display: 'grid', gap: 1, pt: 1 }}>
      {rows.map((row) => (
        <Box
          key={row.id}
          sx={{
            display: 'grid',
            gap: 0.25,
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {row.timestampText}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem' }}>{row.message}</Typography>
        </Box>
      ))}
    </Box>
  );
}
