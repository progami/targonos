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
        className="hidden sm:flex"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: '8px',
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          px: 1,
          py: 0.5,
          fontSize: '10px',
          fontWeight: 500,
          color: 'text.secondary',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        }}
      >
        <span className="tabular-nums">{reportNow.split(' ').pop()}</span>
        <Box component="span" sx={{ color: 'divider' }}>/</Box>
        <span className="tabular-nums">{userNow.split(' ').pop()}</span>
      </Box>
    </MuiTooltip>
  );
}
