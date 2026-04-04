import { Box, Typography } from '@mui/material';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';
import {
  panelSx,
  panelHeadSx,
  panelTitleSx,
  panelBadgeSx,
  panelBgDarker,
  textMuted,
  textSecondary,
  teal,
} from '@/lib/wpr/panel-tokens';

const CATEGORY_COLORS: Record<string, string> = {
  'LISTING ATTRIBUTES': 'rgba(0, 194, 185, 0.7)',
  IMAGES: 'rgba(168, 130, 255, 0.7)',
  PRICING: 'rgba(255, 183, 77, 0.7)',
  INVENTORY: 'rgba(100, 181, 246, 0.7)',
  RANKING: 'rgba(129, 199, 132, 0.7)',
  ADVERTISING: 'rgba(255, 138, 128, 0.7)',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toUpperCase()] ?? 'rgba(255,255,255,0.6)';
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatDay(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return DAYS[d.getUTCDay()];
}

const cellSx = {
  px: 1.5,
  py: 1,
  fontSize: '0.8125rem',
  lineHeight: 1.4,
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  verticalAlign: 'top' as const,
};

const headerCellSx = {
  ...cellSx,
  py: 0.75,
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: textMuted,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky' as const,
  top: 0,
  bgcolor: panelBgDarker,
  zIndex: 2,
};

const tagSx = {
  display: 'inline-block' as const,
  px: '7px',
  py: '3px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
};

const chipSx = {
  display: 'inline-block' as const,
  px: '6px',
  py: '2px',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '3px',
  fontSize: '0.75rem',
  fontFamily: 'monospace',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap' as const,
};

export default function ChangeTimeline({
  entriesByWeek,
}: {
  entriesByWeek: Record<WeekLabel, WprChangeLogEntry[]>;
}) {
  const weeks = Object.keys(entriesByWeek).sort().reverse();
  const totalChanges = weeks.reduce((sum, w) => sum + entriesByWeek[w].length, 0);
  const latestWeek = weeks[0];

  return (
    <Box sx={panelSx}>
      {/* Panel header */}
      <Box sx={panelHeadSx}>
        <Typography sx={panelTitleSx}>Change Log</Typography>
        <Typography sx={panelBadgeSx}>
          {totalChanges} tracked change{totalChanges !== 1 ? 's' : ''} &middot; through{' '}
          {latestWeek}
        </Typography>
      </Box>

      {/* Table */}
      <Box sx={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '5%' }}>
                Week
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '11%' }}>
                Date
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '9%' }}>
                Day
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '10%' }}>
                Category
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '8%' }}>
                Source
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '28%' }}>
                Change
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '15%' }}>
                ASINs
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '14%' }}>
                Fields
              </Box>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, weekIdx) => {
              const entries = entriesByWeek[week];
              const showWeekSeparator = weekIdx > 0;

              return entries.map((entry, entryIdx) => (
                <Box
                  component="tr"
                  key={entry.id}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                    transition: 'background-color 0.1s',
                    ...(showWeekSeparator &&
                      entryIdx === 0 && {
                        '& > td, & > th': {
                          borderTop: '1px solid rgba(255,255,255,0.08)',
                        },
                      }),
                  }}
                >
                  {/* Week */}
                  <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                    <Box
                      component="span"
                      sx={{
                        px: '6px',
                        py: '2px',
                        bgcolor: 'rgba(0, 194, 185, 0.15)',
                        border: '1px solid rgba(0, 194, 185, 0.25)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: teal,
                      }}
                    >
                      {entry.week_label}
                    </Box>
                  </Box>

                  {/* Date */}
                  <Box
                    component="td"
                    sx={{ ...cellSx, textAlign: 'left', color: textSecondary }}
                  >
                    {formatDate(entry.timestamp ?? entry.date_label)}
                  </Box>

                  {/* Day */}
                  <Box
                    component="td"
                    sx={{ ...cellSx, textAlign: 'left', color: textMuted }}
                  >
                    {formatDay(entry.timestamp ?? entry.date_label)}
                  </Box>

                  {/* Category */}
                  <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                    <Box
                      component="span"
                      sx={{
                        ...tagSx,
                        bgcolor: `${getCategoryColor(entry.category)}15`,
                        border: `1px solid ${getCategoryColor(entry.category)}40`,
                        color: getCategoryColor(entry.category),
                      }}
                    >
                      {entry.category}
                    </Box>
                  </Box>

                  {/* Source */}
                  <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                    <Box
                      component="span"
                      sx={{
                        ...tagSx,
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {entry.source}
                    </Box>
                  </Box>

                  {/* Change (title + summary) */}
                  <Box
                    component="td"
                    sx={{ ...cellSx, textAlign: 'left', whiteSpace: 'normal' }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.85)',
                        lineHeight: 1.4,
                      }}
                    >
                      {entry.title}
                    </Typography>
                    {entry.summary && (
                      <Typography
                        sx={{
                          fontSize: '0.75rem',
                          color: textMuted,
                          lineHeight: 1.5,
                          mt: '2px',
                        }}
                      >
                        {entry.summary}
                      </Typography>
                    )}
                  </Box>

                  {/* ASINs */}
                  <Box
                    component="td"
                    sx={{
                      ...cellSx,
                      textAlign: 'left',
                      whiteSpace: 'normal',
                    }}
                  >
                    {(entry.asins?.length ?? 0) > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(entry.asins ?? []).map((asin) => (
                          <Box key={asin} component="span" sx={chipSx}>
                            {asin}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>

                  {/* Fields */}
                  <Box
                    component="td"
                    sx={{
                      ...cellSx,
                      textAlign: 'left',
                      whiteSpace: 'normal',
                    }}
                  >
                    {(entry.field_labels?.length ?? 0) > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(entry.field_labels ?? []).map((field) => (
                          <Box key={field} component="span" sx={chipSx}>
                            {field}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              ));
            })}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
