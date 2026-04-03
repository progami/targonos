import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export default function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Box
      sx={{
        p: 2.25,
        borderRadius: 3.5,
        border: '1px solid rgba(0, 44, 81, 0.08)',
        bgcolor: alpha('#FFFFFF', 0.9),
        boxShadow: '0 16px 28px -24px rgba(0, 44, 81, 0.34)',
      }}
    >
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.9, fontWeight: 800, letterSpacing: '-0.05em' }}>
        {value}
      </Typography>
      {helper ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.55, lineHeight: 1.5 }}>
          {helper}
        </Typography>
      ) : null}
    </Box>
  );
}
