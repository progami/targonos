'use client';

import {
  Box,
  Card,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WprWeekBundle } from '@/lib/wpr/types';
import { formatDecimal, formatMoney, formatPercent } from '@/lib/wpr/format';

export default function CompetitorDashboard({ bundle }: { bundle: WprWeekBundle }) {
  const rankedClusters = [...bundle.clusters].sort((left, right) => {
    return right.tstCompare.recent_4w.observed.competitor_purchase_share -
      left.tstCompare.recent_4w.observed.competitor_purchase_share;
  });

  return (
    <Stack spacing={2.5}>
      <Card sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Competitor weekly trend</Typography>
          <Typography variant="body2" color="text.secondary">
            Tracks the benchmark listing across price, sales, and page-one visibility estimates.
          </Typography>
          <Box sx={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bundle.competitorWeekly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week_label" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="sales" stroke="#002C51" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="price" stroke="#00C2B9" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="listing_juice" stroke="#F79009" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Stack>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Cluster benchmark gaps</Typography>
          <Divider />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cluster</TableCell>
                <TableCell align="right">Our Purchase Share</TableCell>
                <TableCell align="right">Competitor Purchase Share</TableCell>
                <TableCell align="right">Purchase Gap</TableCell>
                <TableCell align="right">Recent Avg Rank</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rankedClusters.slice(0, 10).map((cluster) => (
                <TableRow key={cluster.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {cluster.cluster}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {cluster.family}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {formatPercent(cluster.tstCompare.recent_4w.observed.our_purchase_share)}
                  </TableCell>
                  <TableCell align="right">
                    {formatPercent(cluster.tstCompare.recent_4w.observed.competitor_purchase_share)}
                  </TableCell>
                  <TableCell align="right">
                    {formatPercent(cluster.tstCompare.recent_4w.observed.purchase_gap)}
                  </TableCell>
                  <TableCell align="right">{formatDecimal(cluster.avg_rank)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      </Card>

      <Stack
        spacing={2.5}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'repeat(2, minmax(0, 1fr))',
          },
        }}
      >
        {rankedClusters.slice(0, 4).map((cluster) => (
          <Card key={cluster.id} sx={{ p: 2.5 }}>
            <Stack spacing={1.5}>
              <Typography variant="h6">{cluster.cluster}</Typography>
              <Typography variant="body2" color="text.secondary">
                {cluster.family}
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Typography variant="body2">
                  Our click share {formatPercent(cluster.tstCompare.recent_4w.observed.our_click_share)}
                </Typography>
                <Typography variant="body2">
                  Competitor click share {formatPercent(cluster.tstCompare.recent_4w.observed.competitor_click_share)}
                </Typography>
                <Typography variant="body2">
                  PPC spend {formatMoney(cluster.ppc_spend)}
                </Typography>
              </Stack>
              <Divider />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Term</TableCell>
                    <TableCell align="right">Our Purchase</TableCell>
                    <TableCell align="right">Competitor Purchase</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cluster.tstCompare.recent_4w.term_rows.slice(0, 4).map((row) => (
                    <TableRow key={row.term}>
                      <TableCell>{row.term}</TableCell>
                      <TableCell align="right">{formatPercent(row.our_purchase_share)}</TableCell>
                      <TableCell align="right">{formatPercent(row.competitor_purchase_share)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
