import { Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import WprDashboardShell from '@/components/wpr/wpr-dashboard-shell';

function WprPageFallback() {
  return (
    <Box sx={{ py: 10, display: 'flex', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

export default function WprRootPage() {
  return (
    <Suspense fallback={<WprPageFallback />}>
      <WprDashboardShell />
    </Suspense>
  );
}
