'use client';

import {
  Card,
  Stack,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import ResponsiveChartFrame from '@/components/charts/responsive-chart-frame';
import type { WprWeekBundle } from '@/lib/wpr/types';
import { formatPercent } from '@/lib/wpr/format';

function getClusterMap(bundle: WprWeekBundle) {
  return new Map(bundle.clusters.map((cluster) => [cluster.id, cluster]));
}

export default function CompareDashboard({ bundle }: { bundle: WprWeekBundle }) {
  const clusterMap = getClusterMap(bundle);
  const scatterRows = bundle.scatterClusterIds
    .map((clusterId) => clusterMap.get(clusterId))
    .filter((cluster): cluster is NonNullable<typeof cluster> => cluster !== undefined);
  const lineClusters = bundle.lineClusterIds
    .map((clusterId) => clusterMap.get(clusterId))
    .filter((cluster): cluster is NonNullable<typeof cluster> => cluster !== undefined)
    .slice(0, 4);
  const ppcRows = bundle.ppcClusterIds
    .map((clusterId) => clusterMap.get(clusterId))
    .filter((cluster): cluster is NonNullable<typeof cluster> => cluster !== undefined)
    .slice(0, 8);

  const rankRows = bundle.weeks.map((week) => {
    const row: Record<string, string | number | null> = {
      weekLabel: week,
    };

    for (const cluster of lineClusters) {
      const point = cluster.weekly.find((entry) => entry.week_label === week);
      row[cluster.cluster] = point?.avg_rank ?? null;
    }

    return row;
  });

  const brandRows = bundle.weeks.map((week) => ({
    weekLabel: week,
    awareness: bundle.brandMetrics[week]?.awareness ?? 0,
    consideration: bundle.brandMetrics[week]?.consideration ?? 0,
    purchase: bundle.brandMetrics[week]?.purchase ?? 0,
  }));

  return (
    <Stack spacing={2.5}>
      <Card sx={{ p: 2.5, minWidth: 0 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Demand versus share scatter</Typography>
          <Typography variant="body2" color="text.secondary">
            Bubble size tracks purchase share while the axes compare demand and click share.
          </Typography>
          <ResponsiveChartFrame height={360}>
              <ScatterChart margin={{ top: 20, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="query_volume" name="Query volume" />
                <YAxis dataKey="click_share" name="Click share" tickFormatter={(value) => formatPercent(value)} />
                <ZAxis dataKey="purchase_share" range={[60, 340]} name="Purchase share" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value: number, key) => {
                    if (key === 'click_share' || key === 'purchase_share') {
                      return formatPercent(value);
                    }

                    return value.toLocaleString('en-US');
                  }}
                />
                <Scatter data={scatterRows} fill="#00C2B9" />
              </ScatterChart>
          </ResponsiveChartFrame>
        </Stack>
      </Card>

      <Stack
        spacing={2.5}
        sx={{
          display: 'grid',
          minWidth: 0,
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'repeat(2, minmax(0, 1fr))',
          },
        }}
      >
        <Card sx={{ p: 2.5, minWidth: 0 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6">Rank trend</Typography>
            <ResponsiveChartFrame height={320}>
                <LineChart data={rankRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="weekLabel" />
                  <YAxis reversed />
                  <Tooltip />
                  <Legend />
                  {lineClusters.map((cluster) => (
                    <Line
                      key={cluster.id}
                      type="monotone"
                      dataKey={cluster.cluster}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
            </ResponsiveChartFrame>
          </Stack>
        </Card>

        <Card sx={{ p: 2.5, minWidth: 0 }}>
          <Stack spacing={1.5}>
            <Typography variant="h6">PPC spend</Typography>
            <ResponsiveChartFrame height={320}>
                <BarChart data={ppcRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="cluster" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="ppc_spend" fill="#002C51" name="PPC spend" />
                  <Bar dataKey="ppc_sales" fill="#00C2B9" name="PPC sales" />
                </BarChart>
            </ResponsiveChartFrame>
          </Stack>
        </Card>
      </Stack>

      <Card sx={{ p: 2.5, minWidth: 0 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Brand metrics window</Typography>
          <ResponsiveChartFrame height={320}>
              <LineChart data={brandRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="weekLabel" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="awareness" stroke="#002C51" strokeWidth={2} />
                <Line type="monotone" dataKey="consideration" stroke="#00C2B9" strokeWidth={2} />
                <Line type="monotone" dataKey="purchase" stroke="#F79009" strokeWidth={2} />
              </LineChart>
          </ResponsiveChartFrame>
        </Stack>
      </Card>
    </Stack>
  );
}
