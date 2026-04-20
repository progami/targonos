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
  MANUAL: 'rgba(168, 130, 255, 0.75)',
  CONTENT: 'rgba(0, 194, 185, 0.75)',
  PRICING: 'rgba(255, 183, 77, 0.75)',
  IMAGES: 'rgba(129, 199, 132, 0.75)',
  OFFER: 'rgba(100, 181, 246, 0.75)',
  CATALOG: 'rgba(255, 138, 128, 0.75)',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toUpperCase()] ?? 'rgba(255,255,255,0.6)';
}

const cellSx = {
  px: 1.5,
  py: 1,
  fontSize: '0.8125rem',
  lineHeight: 1.4,
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
  fontSize: '0.72rem',
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

function compactList(values: string[]): string {
  if (values.length === 0) {
    return '—';
  }

  return values.join(', ');
}

function summaryText(entry: WprChangeLogEntry): string {
  if (entry.summary.trim() !== '') {
    return entry.summary;
  }

  if (entry.highlights !== undefined && entry.highlights.length > 0) {
    return entry.highlights.join(' | ');
  }

  return '—';
}

function fieldLabels(entry: WprChangeLogEntry): string[] {
  if (entry.field_labels === undefined) {
    return [];
  }

  return entry.field_labels;
}

export default function ChangeTimeline({
  entries,
  selectedWeekLabel,
}: {
  entries: WprChangeLogEntry[];
  selectedWeekLabel: WeekLabel;
}) {
  if (entries.length === 0) {
    return (
      <Box sx={panelSx}>
        <Box
          sx={{
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.54)',
            fontSize: '0.78rem',
            letterSpacing: '0.03em',
          }}
        >
          No tracked changes in the available history.
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={panelSx}>
      <Box sx={panelHeadSx}>
        <Typography sx={panelTitleSx}>Change Log</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={panelBadgeSx}>
            {entries.length} tracked change{entries.length !== 1 ? 's' : ''}
          </Typography>
          <Typography sx={panelBadgeSx}>Through {selectedWeekLabel}</Typography>
        </Box>
      </Box>

      <Box sx={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '72px' }}>
                Week
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '156px' }}>
                Date
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '92px' }}>
                Source
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '92px' }}>
                Type
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '280px' }}>
                Title
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left' }}>
                Summary
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '180px' }}>
                ASINs
              </Box>
              <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '180px' }}>
                Fields
              </Box>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const summary = summaryText(entry);
              const categoryColor = getCategoryColor(entry.category);
              const fields = fieldLabels(entry);
              return (
                <Box
                  component="tr"
                  key={entry.id}
                  sx={{
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                    transition: 'background-color 0.1s',
                  }}
                >
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

                  <Box component="td" sx={{ ...cellSx, textAlign: 'left', color: textSecondary }}>
                    {entry.date_label}
                  </Box>

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

                  <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                    <Box
                      component="span"
                      sx={{
                        ...tagSx,
                        bgcolor: `${categoryColor}15`,
                        border: `1px solid ${categoryColor}40`,
                        color: categoryColor,
                      }}
                    >
                      {entry.category}
                    </Box>
                  </Box>

                  <Box component="td" sx={{ ...cellSx, textAlign: 'left', color: 'rgba(255,255,255,0.85)' }}>
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: 'inherit',
                        lineHeight: 1.35,
                      }}
                    >
                      {entry.title}
                    </Typography>
                  </Box>

                  <Box component="td" sx={{ ...cellSx, textAlign: 'left', color: textSecondary }}>
                    <Typography
                      sx={{
                        fontSize: '0.78rem',
                        color: 'inherit',
                        lineHeight: 1.45,
                        whiteSpace: 'normal',
                      }}
                    >
                      {summary}
                    </Typography>
                  </Box>

                  <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                    <Typography
                      sx={{
                        fontSize: '0.76rem',
                        color: textSecondary,
                        lineHeight: 1.45,
                        whiteSpace: 'normal',
                      }}
                    >
                      {compactList(entry.asins)}
                    </Typography>
                  </Box>

                  <Box component="td" sx={{ ...cellSx, textAlign: 'left', whiteSpace: 'normal' }}>
                    {fields.length === 0 ? (
                      <Typography sx={{ fontSize: '0.76rem', color: textMuted }}>—</Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {fields.map((field) => (
                          <Box component="span" key={`${entry.id}-${field}`} sx={chipSx}>
                            {field}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
