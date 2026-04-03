'use client';

import { useEffect } from 'react';
import { Alert, Box, CircularProgress, Stack } from '@mui/material';
import ClusterTable from '@/components/wpr/cluster-table';
import ClusterFocusPanel from '@/components/wpr/cluster-focus-panel';
import MetricCard from '@/components/wpr/metric-card';
import { useWprWeekBundleQuery } from '@/hooks/use-wpr';
import { formatCompactNumber, formatPercent } from '@/lib/wpr/format';
import { useWprStore } from '@/stores/wpr-store';

export default function WprRootPage() {
  const selectedWeek = useWprStore((state) => state.selectedWeek);
  const selectedClusterId = useWprStore((state) => state.selectedClusterId);
  const setSelectedClusterId = useWprStore((state) => state.setSelectedClusterId);
  const { data, isLoading, error } = useWprWeekBundleQuery(selectedWeek);

  useEffect(() => {
    if (data === undefined) {
      return;
    }

    if (selectedClusterId !== null && data.clusters.some((cluster) => cluster.id === selectedClusterId)) {
      return;
    }

    const nextCluster = data.defaultClusterIds[0] ?? data.clusters[0]?.id ?? null;
    setSelectedClusterId(nextCluster);
  }, [data, selectedClusterId, setSelectedClusterId]);

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

  const selectedCluster = data.clusters.find((cluster) => cluster.id === selectedClusterId) ?? null;
  const selectedTerms = data.sqpTerms.filter((term) => term.cluster_id === selectedCluster?.id);

  return (
    <Stack spacing={2.5}>
      <Stack
        spacing={2}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        <MetricCard
          label="Anchor Week"
          value={data.meta.anchorWeek}
          helper={`${data.meta.recentWindow.join(', ')} recent window`}
        />
        <MetricCard
          label="Clusters"
          value={formatCompactNumber(data.clusters.length)}
          helper={`${data.defaultClusterIds.length} spotlight clusters`}
        />
        <MetricCard
          label="Top Purchase Share"
          value={formatPercent(data.clusters[0]?.purchase_share ?? 0)}
          helper={data.clusters[0]?.cluster ?? 'No cluster data'}
        />
        <MetricCard
          label="Competitor"
          value={data.meta.competitorBrand}
          helper={data.meta.competitorAsin}
        />
      </Stack>

      <Stack
        spacing={2.5}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'minmax(0, 1.15fr) minmax(360px, 0.85fr)',
          },
          alignItems: 'start',
        }}
      >
        <ClusterTable
          clusters={data.clusters}
          selectedClusterId={selectedClusterId}
          onSelectCluster={setSelectedClusterId}
        />
        <ClusterFocusPanel cluster={selectedCluster} terms={selectedTerms} />
      </Stack>
    </Stack>
  );
}
