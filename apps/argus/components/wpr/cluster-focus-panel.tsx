import {
  Card,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { WprCluster, WprSqpTerm } from '@/lib/wpr/types';
import { formatCompactNumber, formatDecimal, formatPercent } from '@/lib/wpr/format';
import MetricCard from './metric-card';

export default function ClusterFocusPanel({
  cluster,
  terms,
}: {
  cluster: WprCluster | null;
  terms: WprSqpTerm[];
}) {
  if (cluster === null) {
    return (
      <Card sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Select a cluster to inspect the current funnel, benchmark, and term detail.
        </Typography>
      </Card>
    );
  }

  const termRows = terms.slice(0, 8);
  const recentTst = cluster.tstCompare.recent_4w;

  return (
    <Stack spacing={2}>
      <Card sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Selected Cluster
            </Typography>
            <Typography variant="h4">{cluster.cluster}</Typography>
            <Typography variant="body2" color="text.secondary">
              {cluster.family}
            </Typography>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
          >
            {cluster.top_terms.slice(0, 6).map((term) => (
              <Chip key={term} label={term} variant="outlined" />
            ))}
          </Stack>
        </Stack>
      </Card>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
          },
        }}
      >
        <MetricCard
          label="Query Volume"
          value={formatCompactNumber(cluster.query_volume)}
          helper={`${formatCompactNumber(cluster.search_volume)} weighted search volume`}
        />
        <MetricCard
          label="Purchase Share"
          value={formatPercent(cluster.purchase_share)}
          helper={`${formatPercent(cluster.click_share)} click share`}
        />
        <MetricCard
          label="Avg Rank"
          value={formatDecimal(cluster.avg_rank)}
          helper={`${formatDecimal(cluster.expected_rank)} expected rank`}
        />
        <MetricCard
          label="TST Purchase Gap"
          value={formatPercent(recentTst.observed.purchase_gap)}
          helper={`${formatPercent(recentTst.observed.competitor_purchase_share)} competitor share`}
        />
      </Stack>

      <Card sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Observed funnel</Typography>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            <MetricCard label="Impression Share" value={formatPercent(cluster.impression_share)} />
            <MetricCard label="Click Share" value={formatPercent(cluster.click_share)} />
            <MetricCard label="Cart Add Share" value={formatPercent(cluster.cart_add_share)} />
            <MetricCard label="Purchase Share" value={formatPercent(cluster.purchase_share)} />
          </Stack>
        </Stack>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Top SQP terms</Typography>
          <Divider />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Term</TableCell>
                <TableCell align="right">Recent Vol</TableCell>
                <TableCell align="right">Purchase Share</TableCell>
                <TableCell align="right">Competitor Rank</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {termRows.map((term) => (
                <TableRow key={term.id}>
                  <TableCell>{term.term}</TableCell>
                  <TableCell align="right">{formatCompactNumber(term.selection_volume_recent_4w)}</TableCell>
                  <TableCell align="right">{formatPercent(term.purchase_share)}</TableCell>
                  <TableCell align="right">{formatDecimal(term.competitor_rank)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="h6">TST top clicked terms</Typography>
          <Divider />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Term</TableCell>
                <TableCell align="right">Pool Click Share</TableCell>
                <TableCell align="right">Our Purchase Share</TableCell>
                <TableCell align="right">Competitor Purchase Share</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentTst.term_rows.slice(0, 8).map((row) => (
                <TableRow key={row.term}>
                  <TableCell>{row.term}</TableCell>
                  <TableCell align="right">{formatPercent(row.avg_click_pool_share)}</TableCell>
                  <TableCell align="right">{formatPercent(row.our_purchase_share)}</TableCell>
                  <TableCell align="right">{formatPercent(row.competitor_purchase_share)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      </Card>
    </Stack>
  );
}
