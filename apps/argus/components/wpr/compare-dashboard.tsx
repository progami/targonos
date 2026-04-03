'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
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
import { panelSx, panelHeadSx, panelTitleSx, panelBadgeSx } from '@/lib/wpr/panel-tokens';

const LINE_COLORS = ['#00C2B9', '#f5a623', '#8fc7ff', '#a78bfa'];

function getClusterMap(bundle: WprWeekBundle) {
  return new Map(bundle.clusters.map((cluster) => [cluster.id, cluster]));
}

export default function CompareDashboard({ bundle }: { bundle: WprWeekBundle }) {
  const clusterMap = useMemo(() => getClusterMap(bundle), [bundle]);
  const scatterRows = useMemo(() => bundle.scatterClusterIds
    .map((clusterId) => clusterMap.get(clusterId))
    .filter((cluster): cluster is NonNullable<typeof cluster> => cluster !== undefined), [bundle, clusterMap]);
  const lineClusters = useMemo(() => bundle.lineClusterIds
    .map((clusterId) => clusterMap.get(clusterId))
    .filter((cluster): cluster is NonNullable<typeof cluster> => cluster !== undefined)
    .slice(0, 4), [bundle, clusterMap]);
  const ppcRows = useMemo(() => bundle.ppcClusterIds
    .map((clusterId) => clusterMap.get(clusterId))
    .filter((cluster): cluster is NonNullable<typeof cluster> => cluster !== undefined)
    .slice(0, 8), [bundle, clusterMap]);

  const rankRows = useMemo(() => bundle.weeks.map((week) => {
    const row: Record<string, string | number | null> = {
      weekLabel: week,
    };

    for (const cluster of lineClusters) {
      const point = cluster.weekly.find((entry) => entry.week_label === week);
      row[cluster.cluster] = point?.avg_rank ?? null;
    }

    return row;
  }), [bundle, lineClusters]);

  const brandRows = useMemo(() => bundle.weeks.map((week) => ({
    weekLabel: week,
    awareness: bundle.brandMetrics[week]?.awareness ?? 0,
    consideration: bundle.brandMetrics[week]?.consideration ?? 0,
    purchase: bundle.brandMetrics[week]?.purchase ?? 0,
  })), [bundle]);

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
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 2,
      }}
    >
      {/* BRAND METRICS — full width */}
      <Box sx={{ ...panelSx, gridColumn: '1 / -1' }}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Brand Metrics</Typography>
          <Typography sx={panelBadgeSx}>Awareness / Consideration / PI</Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <Box role="img" aria-label="Brand metrics trend over weeks showing awareness, consideration, and purchase intent">
            <ResponsiveChartFrame height={280}>
              <LineChart data={brandRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 10 }} />
                <Tooltip formatter={brandTooltipFormatter} />
                <Legend wrapperStyle={{ paddingTop: 6, fontSize: 10 }} />
                <Line type="monotone" dataKey="awareness" stroke="#0E3A60" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#0E3A60' }} activeDot={{ r: 3.5 }} />
                <Line type="monotone" dataKey="consideration" stroke="#00C2B9" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#00C2B9' }} activeDot={{ r: 3.5 }} />
                <Line type="monotone" dataKey="purchase" stroke="#F79009" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#F79009' }} activeDot={{ r: 3.5 }} />
              </LineChart>
            </ResponsiveChartFrame>
          </Box>
        </Box>
      </Box>

      {/* DEMAND VS RANK — left column */}
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Demand vs Rank</Typography>
          <Typography sx={panelBadgeSx}>{scatterRows.length} clusters</Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <Box role="img" aria-label="Demand versus rank scatter plot comparing query volume to click share across clusters">
            <ResponsiveChartFrame height={320}>
              <ScatterChart margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="query_volume"
                  name="Query volume"
                  tickFormatter={(value) => formatCompactNumber(value)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  dataKey="click_share"
                  name="Click share"
                  tickFormatter={(value) => formatPercent(value)}
                  tick={{ fontSize: 10 }}
                />
                <ZAxis dataKey="purchase_share" range={[80, 340]} name="Purchase share" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={scatterTooltipFormatter} />
                <Scatter data={scatterRows} fill="#00C2B9" stroke="#0E3A60" strokeOpacity={0.18} />
              </ScatterChart>
            </ResponsiveChartFrame>
          </Box>
        </Box>
      </Box>

      {/* ORGANIC RANK — right column */}
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Organic Rank</Typography>
          <Typography sx={panelBadgeSx}>{lineClusters.length} tracked</Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <Box role="img" aria-label="Organic rank trend over weeks for tracked clusters">
            <ResponsiveChartFrame height={320}>
              <LineChart data={rankRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                <YAxis reversed tickFormatter={(value) => formatDecimal(value)} tick={{ fontSize: 10 }} />
                <Tooltip formatter={rankTooltipFormatter} />
                <Legend wrapperStyle={{ paddingTop: 6, fontSize: 10 }} />
                {lineClusters.map((cluster, index) => (
                  <Line
                    key={cluster.id}
                    type="monotone"
                    dataKey={cluster.cluster}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 1.75, strokeWidth: 0, fill: LINE_COLORS[index % LINE_COLORS.length] }}
                    activeDot={{ r: 3.5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveChartFrame>
          </Box>
        </Box>
      </Box>

      {/* PAID SUPPORT — full width */}
      <Box sx={{ ...panelSx, gridColumn: '1 / -1' }}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Paid Support</Typography>
          <Typography sx={panelBadgeSx}>Sponsored Products</Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <Box role="img" aria-label="Paid support horizontal bar chart comparing PPC spend and PPC sales by cluster">
            <ResponsiveChartFrame height={300}>
              <BarChart data={ppcRows} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="cluster"
                  width={112}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: string) => value.length > 18 ? `${value.slice(0, 18)}...` : value}
                />
                <Tooltip formatter={ppcTooltipFormatter} />
                <Legend wrapperStyle={{ paddingTop: 6, fontSize: 10 }} />
                <Bar dataKey="ppc_spend" fill="#0E3A60" radius={[0, 6, 6, 0]} name="PPC spend" />
                <Bar dataKey="ppc_sales" fill="#00C2B9" radius={[0, 6, 6, 0]} name="PPC sales" />
              </BarChart>
            </ResponsiveChartFrame>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
