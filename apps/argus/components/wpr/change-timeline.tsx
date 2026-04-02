import {
  Card,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';

export default function ChangeTimeline({
  entriesByWeek,
}: {
  entriesByWeek: Record<WeekLabel, WprChangeLogEntry[]>;
}) {
  const weeks = Object.keys(entriesByWeek).sort().reverse();

  return (
    <Stack spacing={2}>
      {weeks.map((week) => (
        <Card key={week} sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h6">{week}</Typography>
              <Chip label={`${entriesByWeek[week].length} changes`} variant="outlined" size="small" />
            </Stack>
            <Divider />
            <Stack spacing={2}>
              {entriesByWeek[week].map((entry) => (
                <Stack key={entry.id} spacing={0.5}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {entry.title}
                    </Typography>
                    <Chip label={entry.category} size="small" />
                    <Chip label={entry.source} size="small" variant="outlined" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {entry.summary}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.date_label}
                    {entry.asins.length > 0 ? ` • ${entry.asins.join(', ')}` : ''}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
