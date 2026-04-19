import { Box, Stack, Typography } from '@mui/material';
import { formatCount, formatMoney, formatPercent } from '@/lib/wpr/format';
import { panelHeadSx, panelSx, panelTitleSx, textMuted, textPrimary } from '@/lib/wpr/panel-tokens';
import type { WprWeekBundle } from '@/lib/wpr/types';

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: textMuted }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.4, fontSize: '1rem', fontWeight: 700, color: textPrimary }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function ScpTab({ bundle }: { bundle: WprWeekBundle }) {
  const current = bundle.scp.current_week;

  return (
    <Stack spacing={2}>
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>SCP</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
          <Metric label="Tracked ASINs" value={formatCount(bundle.scp.asins.length)} />
          <Metric label="Impressions" value={formatCount(current.impressions)} />
          <Metric label="Clicks" value={formatCount(current.clicks)} />
          <Metric label="Purchases" value={formatCount(current.purchases)} />
          <Metric label="Sales" value={formatMoney(current.sales)} />
        </Box>
      </Box>
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Current Week Rates</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
          <Metric label="CTR" value={formatPercent(current.ctr)} />
          <Metric label="ATC Rate" value={formatPercent(current.atc_rate)} />
          <Metric label="Purchase Rate" value={formatPercent(current.purchase_rate)} />
          <Metric label="CVR" value={formatPercent(current.cvr)} />
        </Box>
      </Box>
    </Stack>
  );
}
