'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { WprCluster } from '@/lib/wpr/types';
import { formatCompactNumber, formatDecimal, formatMoney, formatPercent } from '@/lib/wpr/format';

const cellSx = {
  px: 1.5,
  py: 0.75,
  fontSize: '0.7rem',
  lineHeight: 1.3,
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

const headerCellSx = {
  ...cellSx,
  py: 0.6,
  fontSize: '0.6rem',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: 'rgba(255,255,255,0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky' as const,
  top: 0,
  bgcolor: 'rgba(0, 20, 35, 0.95)',
  zIndex: 2,
};

export default function ClusterTable({
  clusters,
  selectedClusterId,
  onSelectCluster,
}: {
  clusters: WprCluster[];
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string) => void;
}) {
  const grouped = useMemo(() => {
    const familyMap = new Map<string, WprCluster[]>();
    for (const cluster of clusters) {
      const family = cluster.family;
      const existing = familyMap.get(family);
      if (existing) {
        existing.push(cluster);
      } else {
        familyMap.set(family, [cluster]);
      }
    }
    return familyMap;
  }, [clusters]);

  return (
    <Box
      sx={{
        bgcolor: 'rgba(0, 20, 35, 0.85)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Info strip */}
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          gap: 3,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          bgcolor: 'rgba(0, 20, 35, 0.6)',
        }}
      >
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)' }}>
          Source: SQP
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)' }}>
          Scope: root
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)' }}>
          Families: {grouped.size}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)' }}>
          Clusters: {clusters.length}
        </Typography>
      </Box>

      {/* Table */}
      <Box sx={{ maxHeight: 560, overflow: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          <thead>
            <tr>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '28%' }}>
                Cluster
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'right', width: '12%' }}>
                Q Vol
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'right', width: '12%' }}>
                Impr Share
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'right', width: '12%' }}>
                Click Share
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'right', width: '12%' }}>
                Purch Share
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'right', width: '12%' }}>
                Avg Rank
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'right', width: '12%' }}>
                PPC Spend
              </Box>
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped.entries()).map(([family, familyClusters]) => (
              <FamilyGroup
                key={family}
                family={family}
                clusters={familyClusters}
                selectedClusterId={selectedClusterId}
                onSelectCluster={onSelectCluster}
              />
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

function FamilyGroup({
  family,
  clusters,
  selectedClusterId,
  onSelectCluster,
}: {
  family: string;
  clusters: WprCluster[];
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string) => void;
}) {
  return (
    <>
      {/* Family header row */}
      <tr>
        <Box
          component="td"
          colSpan={7}
          sx={{
            px: 1.5,
            py: 0.5,
            fontSize: '0.58rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: '#00C2B9',
            borderBottom: '1px solid rgba(0,194,185,0.12)',
            bgcolor: 'rgba(0,194,185,0.04)',
          }}
        >
          {family}
        </Box>
      </tr>
      {/* Cluster rows */}
      {clusters.map((cluster) => {
        const selected = cluster.id === selectedClusterId;
        return (
          <Box
            component="tr"
            key={cluster.id}
            onClick={() => onSelectCluster(cluster.id)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCluster(cluster.id);
              }
            }}
            tabIndex={0}
            role="row"
            aria-selected={selected}
            sx={{
              cursor: 'pointer',
              bgcolor: selected ? 'rgba(0,194,185,0.08)' : 'transparent',
              '&:hover': {
                bgcolor: selected ? 'rgba(0,194,185,0.12)' : 'rgba(255,255,255,0.03)',
              },
              transition: 'background-color 0.1s',
            }}
          >
            <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: selected ? 700 : 500,
                  color: selected ? '#00C2B9' : 'rgba(255,255,255,0.85)',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {cluster.cluster}
              </Typography>
            </Box>
            <Box component="td" sx={{ ...cellSx, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
              {formatCompactNumber(cluster.query_volume)}
            </Box>
            <Box component="td" sx={{ ...cellSx, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
              {formatPercent(cluster.impression_share)}
            </Box>
            <Box component="td" sx={{ ...cellSx, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
              {formatPercent(cluster.click_share)}
            </Box>
            <Box component="td" sx={{ ...cellSx, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
              {formatPercent(cluster.purchase_share)}
            </Box>
            <Box component="td" sx={{ ...cellSx, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
              {formatDecimal(cluster.avg_rank)}
            </Box>
            <Box component="td" sx={{ ...cellSx, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>
              {formatMoney(cluster.ppc_spend)}
            </Box>
          </Box>
        );
      })}
    </>
  );
}
