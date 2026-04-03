'use client';

import {
  Box,
  Card,
  Chip,
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
import {
  formatCompactNumber,
  formatCount,
  formatDecimal,
  formatMoney,
  formatPercent,
} from '@/lib/wpr/format';

const LINE_COLORS = ['#0E3A60', '#00A89F', '#C9772E', '#6B7C8F'];

function getClusterMap(bundle: WprWeekBundle) {
  return new Map(bundle.clusters.map((cluster) => [cluster.id, cluster]));
}

function chartCardSx() {
  return {
    p: 2.5,
    minWidth: 0,
    borderRadius: 4,
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 251, 253, 0.96) 100%)',
  } as const;
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

  const scatterTooltipFormatter = (value: number, key: string) => {
    if (key === 'click_share' || key === 'purchase_share') {
      return formatPercent(value);
    }

    return formatCount(value);
  };

  const rankTooltipFormatter = (value: number | string) => {
    if (typeof value !== 'number') {
      return String(value);
    }

    return formatDecimal(value);
  };

  const ppcTooltipFormatter = (value: number | string, key: string) => {
    if (typeof value !== 'number') {
      return String(value);
    }

    if (key === 'ppc_spend' || key === 'ppc_sales') {
      return formatMoney(value);
    }

    return formatCount(value);
  };

  const brandTooltipFormatter = (value: number | string) => {
    if (typeof value !== 'number') {
      return String(value);
    }

    return formatCount(value);
  };

  return (
    <Stack spacing={2.5}>
      <Card sx={{ ...chartCardSx(), p: 2.75 }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
            <Box>
              <Typography variant="h6">Demand versus share scatter</Typography>
              <Typography variant="body2" color="text.secondary">
                Bubble size tracks purchase share while the axes compare demand and click share.
              </Typography>
            </Box>
            <Chip label={`${scatterRows.length} focus clusters`} variant="outlined" sx={{ alignSelf: 'flex-start' }} />
          </Stack>

          <ResponsiveChartFrame height={360}>
            <ScatterChart margin={{ top: 20, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 44, 81, 0.1)" />
              <XAxis
                dataKey="query_volume"
                name="Query volume"
                tickFormatter={(value) => formatCompactNumber(value)}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                dataKey="click_share"
                name="Click share"
                tickFormatter={(value) => formatPercent(value)}
                tick={{ fontSize: 11 }}
              />
              <ZAxis dataKey="purchase_share" range={[80, 340]} name="Purchase share" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={scatterTooltipFormatter} />
              <Scatter data={scatterRows} fill="#00C2B9" stroke="#0E3A60" strokeOpacity={0.18} />
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
        <Card sx={chartCardSx()}>
          <Stack spacing={1.5}>
            <Typography variant="h6">Rank trend</Typography>
            <ResponsiveChartFrame height={320}>
              <LineChart data={rankRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 44, 81, 0.1)" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
                <YAxis reversed tickFormatter={(value) => formatDecimal(value)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={rankTooltipFormatter} />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                {lineClusters.map((cluster, index) => (
                  <Line
                    key={cluster.id}
                    type="monotone"
                    dataKey={cluster.cluster}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 2.25, strokeWidth: 0, fill: LINE_COLORS[index % LINE_COLORS.length] }}
                    activeDot={{ r: 4.5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveChartFrame>
          </Stack>
        </Card>

        <Card sx={chartCardSx()}>
          <Stack spacing={1.5}>
            <Typography variant="h6">PPC spend</Typography>
            <ResponsiveChartFrame height={320}>
              <BarChart data={ppcRows} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 44, 81, 0.1)" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="cluster"
                  width={112}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => value.length > 18 ? `${value.slice(0, 18)}...` : value}
                />
                <Tooltip formatter={ppcTooltipFormatter} />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                <Bar dataKey="ppc_spend" fill="#0E3A60" radius={[0, 6, 6, 0]} name="PPC spend" />
                <Bar dataKey="ppc_sales" fill="#00C2B9" radius={[0, 6, 6, 0]} name="PPC sales" />
              </BarChart>
            </ResponsiveChartFrame>
          </Stack>
        </Card>
      </Stack>

      <Card sx={chartCardSx()}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Brand metrics window</Typography>
          <ResponsiveChartFrame height={320}>
            <LineChart data={brandRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 44, 81, 0.1)" />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={brandTooltipFormatter} />
              <Legend wrapperStyle={{ paddingTop: 8 }} />
              <Line type="monotone" dataKey="awareness" stroke="#0E3A60" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4.5 }} />
              <Line type="monotone" dataKey="consideration" stroke="#00C2B9" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4.5 }} />
              <Line type="monotone" dataKey="purchase" stroke="#F79009" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4.5 }} />
            </LineChart>
          </ResponsiveChartFrame>
        </Stack>
      </Card>
    </Stack>
  );
}
