'use client';

import { useEffect } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import ClusterTable from '@/components/wpr/cluster-table';
import { formatCompactNumber, formatCount, formatPercent } from '@/lib/wpr/format';
import type { WprCluster, WprWeekBundle } from '@/lib/wpr/types';
import { useWprStore } from '@/stores/wpr-store';

const FUNNEL_STAGES = [
  { key: 'impressions', label: 'IMPRESSIONS', color: '#8FC7FF' },
  { key: 'clicks', label: 'CLICKS', color: '#6BB8FF' },
  { key: 'cart_adds', label: 'CART ADDS', color: '#A8E6CF' },
  { key: 'purchases', label: 'PURCHASES', color: '#00C2B9' },
] as const;

type FunnelStageKey = (typeof FUNNEL_STAGES)[number]['key'];

function getFunnelData(cluster: WprCluster): Record<FunnelStageKey, { market: number; ours: number; share: number }> {
  return {
    impressions: {
      market: cluster.market_impressions,
      ours: cluster.asin_impressions,
      share: cluster.impression_share,
    },
    clicks: {
      market: cluster.market_clicks,
      ours: cluster.asin_clicks,
      share: cluster.click_share,
    },
    cart_adds: {
      market: cluster.market_cart_adds,
      ours: cluster.asin_cart_adds,
      share: cluster.cart_add_share,
    },
    purchases: {
      market: cluster.market_purchases,
      ours: cluster.asin_purchases,
      share: cluster.purchase_share,
    },
  };
}

export default function SqpTab({ bundle }: { bundle: WprWeekBundle }) {
  const selectedClusterId = useWprStore((state) => state.selectedClusterId);
  const setSelectedClusterId = useWprStore((state) => state.setSelectedClusterId);

  useEffect(() => {
    if (selectedClusterId !== null && bundle.clusters.some((cluster) => cluster.id === selectedClusterId)) {
      return;
    }

    const nextCluster = bundle.defaultClusterIds[0] ?? bundle.clusters[0]?.id ?? null;
    setSelectedClusterId(nextCluster);
  }, [bundle, selectedClusterId, setSelectedClusterId]);

  const selectedCluster = bundle.clusters.find((cluster) => cluster.id === selectedClusterId) ?? null;

  return (
    <Stack spacing={2}>
      {selectedCluster !== null ? (
        <Box
          sx={{
            bgcolor: 'rgba(0, 20, 35, 0.85)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <Typography
              sx={{
                fontSize: '1.35rem',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: 'rgba(255,255,255,0.95)',
              }}
            >
              {selectedCluster.cluster}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.6)',
                mt: 0.25,
              }}
            >
              {selectedCluster.family} &middot; {selectedCluster.terms_count} SQP terms &middot; {selectedCluster.weeks_covered}w covered
            </Typography>
            <Box sx={{ display: 'flex', gap: 4, mt: 1.5 }}>
              <VolumeChip label="QUERY VOL" value={formatCompactNumber(selectedCluster.query_volume)} />
              <VolumeChip label="MKT PURCHASES" value={formatCount(selectedCluster.market_purchases)} />
              <VolumeChip label="OURS" value={formatCount(selectedCluster.asin_purchases)} />
              <VolumeChip label="PURCH SHARE" value={formatPercent(selectedCluster.purchase_share)} accent />
            </Box>
          </Box>

          <Box sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
            <FunnelVisualization cluster={selectedCluster} />
          </Box>
        </Box>
      ) : null}

      <ClusterTable
        clusters={bundle.clusters}
        selectedClusterId={selectedClusterId}
        onSelectCluster={setSelectedClusterId}
      />
    </Stack>
  );
}

function VolumeChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.56rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.6)',
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.95rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: accent ? '#00C2B9' : 'rgba(255,255,255,0.9)',
          mt: 0.3,
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function FunnelVisualization({ cluster }: { cluster: WprCluster }) {
  const funnelData = getFunnelData(cluster);

  return (
    <Stack spacing={1.5}>
      {FUNNEL_STAGES.map((stage) => {
        const stageData = funnelData[stage.key];
        const otherCount = stageData.market - stageData.ours;
        const otherShare = otherCount > 0 ? otherCount : 1;
        const ourShare = stageData.ours > 0 ? stageData.ours : 0;
        const sharePercent = stageData.share;
        const otherPercent = 1 - sharePercent;

        return (
          <Box key={stage.key}>
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: stage.color,
                mb: 0.4,
              }}
            >
              {stage.label}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                height: 44,
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.05)',
                bgcolor: 'rgba(255,255,255,0.025)',
              }}
            >
              <Box
                sx={{
                  flex: otherShare,
                  bgcolor: 'rgba(143,199,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                  gap: 1,
                  minWidth: 0,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'rgba(143,199,255,0.6)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  OTHER ASINS
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'rgba(143,199,255,0.8)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCompactNumber(otherCount)}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    color: 'rgba(143,199,255,0.45)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ({formatPercent(otherPercent)})
                </Typography>
              </Box>

              <Box
                sx={{
                  flex: ourShare > 0 ? ourShare : 0.001,
                  minWidth: ourShare > 0 ? 140 : 0,
                  bgcolor: 'rgba(0,194,185,0.18)',
                  borderLeft: '2px solid rgba(0,194,185,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'rgba(0,194,185,0.65)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  OUR ASIN
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#00C2B9',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCompactNumber(stageData.ours)}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    color: 'rgba(0,194,185,0.5)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ({formatPercent(sharePercent)})
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
