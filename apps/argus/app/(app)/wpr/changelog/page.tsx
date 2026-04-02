'use client';

import { Alert, Box, CircularProgress } from '@mui/material';
import ChangeTimeline from '@/components/wpr/change-timeline';
import { useWprChangeLogQuery } from '@/hooks/use-wpr';

export default function WprChangelogPage() {
  const { data, isLoading, error } = useWprChangeLogQuery();

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

  return <ChangeTimeline entriesByWeek={data} />;
}
