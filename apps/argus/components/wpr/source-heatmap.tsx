import {
  Card,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { WprSourceOverview } from '@/lib/wpr/types';

export default function SourceHeatmap({ overview }: { overview: WprSourceOverview }) {
  return (
    <Stack spacing={2.5}>
      <Card sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <Typography variant="h6">Source coverage</Typography>
          <Chip label={`${overview.weeks_with_data} weeks with data`} variant="outlined" />
          <Chip label={overview.source_completeness} color="primary" variant="outlined" />
          {overview.critical_gaps.length > 0 ? (
            <Chip label={`${overview.critical_gaps.length} critical gaps`} color="warning" />
          ) : (
            <Chip label="No critical gaps" color="success" variant="outlined" />
          )}
        </Stack>
      </Card>

      <Card sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Source</TableCell>
              {overview.week_labels.map((week) => (
                <TableCell key={week} align="center">
                  {week}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {overview.matrix.map((row) => (
              <TableRow key={`${row.group}-${row.name}`}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {row.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.group}
                  </Typography>
                </TableCell>
                {overview.week_labels.map((week) => {
                  const cell = row.weeks[week];
                  const label = cell.present ? `${cell.file_count}` : '0';

                  return (
                    <TableCell key={week} align="center">
                      <Chip
                        label={label}
                        size="small"
                        color={cell.present ? 'success' : 'default'}
                        variant={cell.present ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Stack>
  );
}
