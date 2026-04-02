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
    <Card sx={{ overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 720 }}>
        <Table stickyHeader size="small">
          <TableHead>
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
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
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
