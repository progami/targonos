'use client';

import { Box, CircularProgress, Typography } from '@mui/material';
import SourceHeatmap from '@/components/wpr/source-heatmap';
import { useWprSourcesQuery } from '@/hooks/use-wpr';

export default function WprSourcesPage() {
  const { data, isLoading, error } = useWprSourcesQuery();

  if (isLoading || data === undefined) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={20} sx={{ color: 'rgba(0, 194, 185, 0.6)' }} />
      </Box>
    );
  }

  if (error instanceof Error) {
    return (
      <Box
        sx={{
          bgcolor: 'rgba(214, 80, 68, 0.1)',
          border: '1px solid rgba(214, 80, 68, 0.25)',
          borderRadius: '8px',
          px: '14px',
          py: '10px',
        }}
      >
        <Typography sx={{ fontSize: '11px', color: 'rgba(214, 80, 68, 0.9)' }}>
          {error.message}
        </Typography>
      </Box>
    );
  }

  return <SourceHeatmap overview={data} />;
}
