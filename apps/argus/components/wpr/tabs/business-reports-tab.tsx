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

export default function BusinessReportsTab({ bundle }: { bundle: WprWeekBundle }) {
  const current = bundle.businessReports.current_week;

  return (
    <Stack spacing={2}>
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Business Reports</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
          <Metric label="Tracked ASINs" value={formatCount(bundle.businessReports.asins.length)} />
          <Metric label="Sessions" value={formatCount(current.sessions)} />
          <Metric label="Page Views" value={formatCount(current.page_views)} />
          <Metric label="Order Items" value={formatCount(current.order_items)} />
          <Metric label="Sales" value={formatMoney(current.sales)} />
        </Box>
      </Box>
      <Box sx={panelSx}>
        <Box sx={panelHeadSx}>
          <Typography sx={panelTitleSx}>Current Week Rates</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          <Metric label="Order Item %" value={formatPercent(current.order_item_session_percentage)} />
          <Metric label="Unit Session %" value={formatPercent(current.unit_session_percentage)} />
          <Metric label="Buy Box %" value={formatPercent(current.buy_box_percentage)} />
        </Box>
      </Box>
    </Stack>
  );
}
