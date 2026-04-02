'use client';

import { Alert, Box, CircularProgress } from '@mui/material';
import CompareDashboard from '@/components/wpr/compare-dashboard';
import { useWprWeekBundleQuery } from '@/hooks/use-wpr';
import { useWprStore } from '@/stores/wpr-store';

export default function WprComparePage() {
  const selectedWeek = useWprStore((state) => state.selectedWeek);
  const { data, isLoading, error } = useWprWeekBundleQuery(selectedWeek);

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

  return <CompareDashboard bundle={data} />;
}
