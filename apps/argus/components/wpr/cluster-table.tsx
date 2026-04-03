'use client';

import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { WprCluster } from '@/lib/wpr/types';
import { formatCompactNumber, formatDecimal, formatMoney, formatPercent } from '@/lib/wpr/format';

export default function ClusterTable({
  clusters,
  selectedClusterId,
  onSelectCluster,
}: {
  clusters: WprCluster[];
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string) => void;
}) {
  return (
    <Card
      sx={{
        alignSelf: 'start',
        height: 'fit-content',
        overflow: 'hidden',
        borderRadius: 4,
        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 252, 253, 0.96) 100%)',
      }}
    >
      <TableContainer sx={{ maxHeight: { xs: 'none', xl: 640 } }}>
        <Table stickyHeader size="small">
          <TableHead
            sx={{
              '& .MuiTableCell-root': {
                bgcolor: 'rgba(236, 242, 247, 0.98)',
                borderBottom: '1px solid rgba(0, 44, 81, 0.1)',
              },
            }}
          >
            <TableRow>
              <TableCell>Cluster</TableCell>
              <TableCell align="right">Query Vol</TableCell>
              <TableCell align="right">Click Share</TableCell>
              <TableCell align="right">Purchase Share</TableCell>
              <TableCell align="right">Avg Rank</TableCell>
              <TableCell align="right">PPC Spend</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clusters.map((cluster) => {
              const selected = cluster.id === selectedClusterId;

              return (
                <TableRow
                  key={cluster.id}
                  hover
                  selected={selected}
                  onClick={() => {
                    onSelectCluster(cluster.id);
                  }}
                  sx={{
                    cursor: 'pointer',
                    '&:last-of-type .MuiTableCell-root': {
                      borderBottom: 'none',
                    },
                    '& .MuiTableCell-root': {
                      py: 1.15,
                    },
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                      {cluster.cluster}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {cluster.family}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatCompactNumber(cluster.query_volume)}</TableCell>
                  <TableCell align="right">{formatPercent(cluster.click_share)}</TableCell>
                  <TableCell align="right">{formatPercent(cluster.purchase_share)}</TableCell>
                  <TableCell align="right">{formatDecimal(cluster.avg_rank)}</TableCell>
                  <TableCell align="right">{formatMoney(cluster.ppc_spend)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
