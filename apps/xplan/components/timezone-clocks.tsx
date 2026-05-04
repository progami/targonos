'use client';

import { useEffect, useMemo, useState } from 'react';
import MuiTooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

function formatTimestamp(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
    .format(value)
    .replace(',', '');
}

function formatTimeZoneLabel(timeZone: string) {
  const parts = timeZone.split('/');
  const raw = parts[parts.length - 1] ?? timeZone;
  return raw.replace(/_/g, ' ');
}

export function TimeZoneClocks({ reportTimeZone }: { reportTimeZone: string }) {
  const [now, setNow] = useState(() => new Date());

  const userTimeZone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const reportNow = formatTimestamp(now, reportTimeZone);
  const userNow = formatTimestamp(now, userTimeZone);
  const reportLabel = formatTimeZoneLabel(reportTimeZone);
  const userLabel = formatTimeZoneLabel(userTimeZone);

  return (
    <MuiTooltip
      title={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption">
            <strong>Report:</strong> {reportLabel} {reportNow}
          </Typography>
          <Typography variant="caption">
            <strong>Local:</strong> {userLabel} {userNow}
          </Typography>
        </Box>
      }
      placement="bottom"
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          gap: 0.7,
          flexShrink: 0,
          borderRadius: '9999px',
          border: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(255,255,255,0.72)',
          px: 0.8,
          py: 0.45,
          fontSize: '10px',
          fontWeight: 600,
          color: 'text.secondary',
          boxShadow: '0 14px 24px -22px rgba(15, 23, 42, 0.42)',
          '.dark &': {
            bgcolor: 'rgba(10, 26, 42, 0.84)',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
          <Box
            component="span"
            sx={{
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.disabled',
            }}
          >
            {reportLabel.slice(0, 3)}
          </Box>
          <span className="tabular-nums">{reportNow.split(' ').pop()}</span>
        </Box>
        <Box component="span" sx={{ color: 'divider' }}>
          /
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
          <Box
            component="span"
            sx={{
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.disabled',
            }}
          >
            {userLabel.slice(0, 3)}
          </Box>
          <span className="tabular-nums">{userNow.split(' ').pop()}</span>
        </Box>
      </Box>
    </MuiTooltip>
  );
}
