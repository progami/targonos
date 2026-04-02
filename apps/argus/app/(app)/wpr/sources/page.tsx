'use client';

import { Alert, Box, CircularProgress } from '@mui/material';
import SourceHeatmap from '@/components/wpr/source-heatmap';
import { useWprSourcesQuery } from '@/hooks/use-wpr';

export default function WprSourcesPage() {
  const { data, isLoading, error } = useWprSourcesQuery();

  if (isLoading || data === undefined) {
    return (
      <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error instanceof Error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  return <SourceHeatmap overview={data} />;
}
