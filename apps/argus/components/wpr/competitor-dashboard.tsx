'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { WprCluster, WprWeekBundle } from '@/lib/wpr/types';
import {
  formatCompactNumber,
  formatCount,
  formatDecimal,
  formatPercent,
} from '@/lib/wpr/format';
import { panelSx, panelHeadSx, panelTitleSx, panelBadgeSx } from '@/lib/wpr/panel-tokens';

const metricLabelSx = {
  fontSize: '0.6rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'text.secondary',
  fontWeight: 500,
  mb: 0.25,
} as const;

const metricValueSx = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'text.primary',
  fontFamily: 'var(--font-mono, monospace)',
} as const;

function classifyIssue(cluster: WprCluster): { label: string; color: string } {
  const clickGap = cluster.tstCompare.recent_4w.observed.click_gap;
  const purchaseGap = cluster.tstCompare.recent_4w.observed.purchase_gap;

  if (purchaseGap < -0.05) {
    return { label: 'High', color: '#ef4444' };
  }

  if (clickGap < -0.03 || purchaseGap < -0.02) {
    return { label: 'Watch', color: '#eab308' };
  }

  return { label: '-', color: 'transparent' };
}

function classifyPriority(cluster: WprCluster): { label: string; color: string } {
  const purchaseGap = cluster.tstCompare.recent_4w.observed.purchase_gap;
  const volume = cluster.query_volume;

  if (purchaseGap < -0.05 && volume > 50000) {
    return { label: 'High', color: '#ef4444' };
  }

  if (purchaseGap < -0.02 && volume > 20000) {
    return { label: 'Medium', color: '#eab308' };
  }

  if (purchaseGap < 0) {
    return { label: 'Low', color: '#6b7280' };
  }

  return { label: '-', color: 'transparent' };
}

export default function CompetitorDashboard({ bundle }: { bundle: WprWeekBundle }) {
  const rankedClusters = useMemo(() => [...bundle.clusters].sort((left, right) => {
    return right.tstCompare.recent_4w.observed.competitor_purchase_share -
      left.tstCompare.recent_4w.observed.competitor_purchase_share;
  }), [bundle]);

  const { totalTermsCovered, totalTermWeeks, avgOurClickShare, avgCompClickShare, avgOurPurchShare, avgCompPurchShare } = useMemo(() => {
    const _totalTermsCovered = rankedClusters.reduce(
      (sum, c) => sum + c.tstCompare.recent_4w.coverage.terms_covered, 0,
    );
    const _totalTermWeeks = rankedClusters.reduce(
      (sum, c) => sum + c.tstCompare.recent_4w.coverage.term_weeks_covered, 0,
    );
    const _avgOurClickShare = rankedClusters.length > 0
      ? rankedClusters.reduce((sum, c) => sum + c.tstCompare.recent_4w.observed.our_click_share, 0) / rankedClusters.length
      : 0;
    const _avgCompClickShare = rankedClusters.length > 0
      ? rankedClusters.reduce((sum, c) => sum + c.tstCompare.recent_4w.observed.competitor_click_share, 0) / rankedClusters.length
      : 0;
    const _avgOurPurchShare = rankedClusters.length > 0
      ? rankedClusters.reduce((sum, c) => sum + c.tstCompare.recent_4w.observed.our_purchase_share, 0) / rankedClusters.length
      : 0;
    const _avgCompPurchShare = rankedClusters.length > 0
      ? rankedClusters.reduce((sum, c) => sum + c.tstCompare.recent_4w.observed.competitor_purchase_share, 0) / rankedClusters.length
      : 0;
    return {
      totalTermsCovered: _totalTermsCovered,
      totalTermWeeks: _totalTermWeeks,
      avgOurClickShare: _avgOurClickShare,
      avgCompClickShare: _avgCompClickShare,
      avgOurPurchShare: _avgOurPurchShare,
      avgCompPurchShare: _avgCompPurchShare,
    };
  }, [rankedClusters]);

  // Group clusters by family
  const familyGroups = useMemo(() => {
    const groups = new Map<string, WprCluster[]>();
    for (const cluster of rankedClusters) {
      const existing = groups.get(cluster.family);
      if (existing) {
        existing.push(cluster);
      } else {
        groups.set(cluster.family, [cluster]);
      }
    }
    return groups;
  }, [rankedClusters]);

  const purchConvRate = avgOurClickShare > 0 ? avgOurPurchShare / avgOurClickShare : 0;

  const competitorName = bundle.meta.competitor.brand;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* HERO SECTION */}
      <Box sx={panelSx}>
        <Box sx={{ px: 2.5, pt: 2, pb: 0.5 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'text.primary' }}>
            TST Competitor Analysis
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.25 }}>
            vs {competitorName} &middot; {bundle.meta.competitor.asin} &middot; {bundle.meta.policy.primary_window} window
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.5,
            px: 2.5,
            py: 1.5,
          }}
        >
          <Box>
            <Typography sx={metricLabelSx}>Terms Covered</Typography>
            <Typography sx={metricValueSx}>{formatCount(totalTermsCovered)}</Typography>
          </Box>
          <Box>
            <Typography sx={metricLabelSx}>Term-Weeks</Typography>
            <Typography sx={metricValueSx}>{formatCount(totalTermWeeks)}</Typography>
          </Box>
          <Box>
            <Typography sx={metricLabelSx}>Our Click Share</Typography>
            <Typography sx={metricValueSx}>{formatPercent(avgOurClickShare)}</Typography>
          </Box>
          <Box>
            <Typography sx={metricLabelSx}>Competitor Click Share</Typography>
            <Typography sx={metricValueSx}>{formatPercent(avgCompClickShare)}</Typography>
          </Box>
        </Box>
      </Box>

      {/* FUNNEL VISUALIZATION — Click Share + Purchase Share */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 2 }}>
        {/* Click Share stage */}
        <Box sx={panelSx}>
          <Box sx={panelHeadSx}>
            <Typography sx={panelTitleSx}>Click Share</Typography>
            <Typography sx={panelBadgeSx}>Stage 1</Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            <FunnelBar label="Our ASIN" share={avgOurClickShare} color="#00C2B9" />
            <FunnelBar label={competitorName} share={avgCompClickShare} color="#0E3A60" />
            <FunnelBar
              label="Other"
              share={Math.max(0, 1 - avgOurClickShare - avgCompClickShare)}
              color="rgba(255,255,255,0.08)"
            />
          </Box>
        </Box>

        {/* Connector */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
          }}
        >
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Purch/Click
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'text.primary' }}>
            {formatPercent(purchConvRate)}
          </Typography>
          <Box sx={{ width: 32, height: 1, bgcolor: 'rgba(255,255,255,0.12)' }} />
        </Box>

        {/* Purchase Share stage */}
        <Box sx={panelSx}>
          <Box sx={panelHeadSx}>
            <Typography sx={panelTitleSx}>Purchase Share</Typography>
            <Typography sx={panelBadgeSx}>Stage 2</Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            <FunnelBar label="Our ASIN" share={avgOurPurchShare} color="#00C2B9" />
            <FunnelBar label={competitorName} share={avgCompPurchShare} color="#0E3A60" />
            <FunnelBar
              label="Other"
              share={Math.max(0, 1 - avgOurPurchShare - avgCompPurchShare)}
              color="rgba(255,255,255,0.08)"
            />
          </Box>
        </Box>
      </Box>

      {/* COMPARISON TABLE — full width, grouped by family */}
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Cluster Comparison</Typography>
          <Typography sx={panelBadgeSx}>{rankedClusters.length} clusters &middot; {familyGroups.size} families</Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              '& th, & td': {
                px: 1.25,
                py: 0.75,
                fontSize: '0.7rem',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                whiteSpace: 'nowrap',
              },
              '& th': {
                fontSize: '0.6rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                fontWeight: 600,
                textAlign: 'left',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                position: 'sticky',
                top: 0,
                bgcolor: 'rgba(0, 20, 35, 0.8)',
              },
            }}
          >
            <thead>
              <tr>
                <Box component="th">Cluster</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>SFR</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Weeks</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Our Click %</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Comp Click %</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Click &Delta;</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Our Purch %</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Comp Purch %</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>Purch &Delta;</Box>
                <Box component="th" sx={{ textAlign: 'center' }}>Issue</Box>
                <Box component="th" sx={{ textAlign: 'center' }}>Priority</Box>
                <Box component="th" sx={{ textAlign: 'right' }}>TST Pool</Box>
              </tr>
            </thead>
            <tbody>
              {[...familyGroups.entries()].map(([family, clusters]) => (
                <FamilyGroup key={family} family={family} clusters={clusters} />
              ))}
            </tbody>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function FunnelBar({ label, share, color }: { label: string; share: number; color: string }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', color: 'text.primary' }}>
          {formatPercent(share)}
        </Typography>
      </Box>
      <Box
        sx={{
          width: '100%',
          height: 6,
          bgcolor: 'rgba(255,255,255,0.04)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${Math.min(share * 100, 100)}%`,
            height: '100%',
            bgcolor: color,
            borderRadius: '3px',
          }}
        />
      </Box>
    </Box>
  );
}

function FamilyGroup({ family, clusters }: { family: string; clusters: WprCluster[] }) {
  return (
    <>
      <tr>
        <Box
          component="td"
          colSpan={12}
          sx={{
            fontSize: '0.6rem !important',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            fontWeight: 600,
            bgcolor: 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid rgba(255,255,255,0.06) !important',
            pt: '10px !important',
            pb: '6px !important',
          }}
        >
          {family}
        </Box>
      </tr>
      {clusters.map((cluster) => {
        const tst = cluster.tstCompare.recent_4w;
        const obs = tst.observed;
        const issue = classifyIssue(cluster);
        const priority = classifyPriority(cluster);

        const topTerm = tst.top_terms[0];
        const sfr = topTerm ? formatCount(topTerm.search_frequency_rank) : '-';

        return (
          <tr key={cluster.id}>
            <Box component="td" sx={{ color: 'text.primary', fontWeight: 500 }}>
              {cluster.cluster}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', color: 'text.secondary', fontFamily: 'var(--font-mono, monospace)' }}>
              {sfr}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', color: 'text.secondary', fontFamily: 'var(--font-mono, monospace)' }}>
              {cluster.weeks_covered}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
              {formatPercent(obs.our_click_share)}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
              {formatPercent(obs.competitor_click_share)}
            </Box>
            <Box
              component="td"
              sx={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono, monospace)',
                color: obs.click_gap >= 0 ? '#34d399' : '#f87171',
              }}
            >
              {obs.click_gap >= 0 ? '+' : ''}{formatPercent(obs.click_gap)}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
              {formatPercent(obs.our_purchase_share)}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
              {formatPercent(obs.competitor_purchase_share)}
            </Box>
            <Box
              component="td"
              sx={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono, monospace)',
                color: obs.purchase_gap >= 0 ? '#34d399' : '#f87171',
              }}
            >
              {obs.purchase_gap >= 0 ? '+' : ''}{formatPercent(obs.purchase_gap)}
            </Box>
            <Box component="td" sx={{ textAlign: 'center' }}>
              {issue.label !== '-' && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '4px',
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    bgcolor: `${issue.color}18`,
                    color: issue.color,
                    border: `1px solid ${issue.color}30`,
                  }}
                >
                  {issue.label}
                </Box>
              )}
            </Box>
            <Box component="td" sx={{ textAlign: 'center' }}>
              {priority.label !== '-' && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '4px',
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    bgcolor: `${priority.color}18`,
                    color: priority.color,
                    border: `1px solid ${priority.color}30`,
                  }}
                >
                  {priority.label}
                </Box>
              )}
            </Box>
            <Box component="td" sx={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: 'text.secondary' }}>
              {formatPercent(tst.coverage.avg_purchase_pool_share)}
            </Box>
          </tr>
        );
      })}
    </>
  );
}
