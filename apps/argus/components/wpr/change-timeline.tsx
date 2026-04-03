import { Box, Typography } from '@mui/material';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';

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

export default function ChangeTimeline({
  entriesByWeek,
}: {
  entriesByWeek: Record<WeekLabel, WprChangeLogEntry[]>;
}) {
  const weeks = Object.keys(entriesByWeek).sort().reverse();
  const totalChanges = weeks.reduce((sum, w) => sum + entriesByWeek[w].length, 0);
  const latestWeek = weeks[0];

  return (
    <Box
      sx={{
        bgcolor: 'rgba(0, 20, 35, 0.85)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        p: 1.75,
      }}
    >
      {/* Panel header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Typography
          sx={{
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          CHANGE LOG
        </Typography>
        <Typography
          sx={{
            fontSize: '0.5625rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {totalChanges} TRACKED CHANGE{totalChanges !== 1 ? 'S' : ''} &middot; THROUGH {latestWeek}
        </Typography>
      </Box>

      {/* Timeline entries */}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week) =>
          entriesByWeek[week].map((entry, entryIdx) => {
            const isLastInWeek = entryIdx === entriesByWeek[week].length - 1;
            const isLastWeek = week === weeks[weeks.length - 1];
            const showLine = !(isLastInWeek && isLastWeek);

            return (
              <Box
                key={entry.id}
                sx={{ display: 'flex', gap: 1.75, minHeight: '60px' }}
              >
                {/* Timeline rail */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '14px',
                    flexShrink: 0,
                    pt: '4px',
                  }}
                >
                  {/* Dot */}
                  <Box
                    sx={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      bgcolor: 'rgba(0, 194, 185, 0.7)',
                      border: '2px solid rgba(0, 194, 185, 0.3)',
                      flexShrink: 0,
                    }}
                  />
                  {/* Vertical line */}
                  {showLine && (
                    <Box
                      sx={{
                        flex: 1,
                        width: '1px',
                        bgcolor: 'rgba(255,255,255,0.07)',
                        mt: '4px',
                      }}
                    />
                  )}
                </Box>

                {/* Entry content */}
                <Box
                  sx={{
                    flex: 1,
                    pb: showLine ? '14px' : '0',
                  }}
                >
                  {/* Meta row: week badge + date + category + source */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      flexWrap: 'wrap',
                      mb: 0.625,
                    }}
                  >
                    {/* Week badge */}
                    <Box
                      sx={{
                        px: '6px',
                        py: '2px',
                        bgcolor: 'rgba(0, 194, 185, 0.15)',
                        border: '1px solid rgba(0, 194, 185, 0.25)',
                        borderRadius: '4px',
                        fontSize: '0.5625rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: 'rgba(0, 194, 185, 0.9)',
                      }}
                    >
                      {entry.week_label}
                    </Box>

                    {/* Date */}
                    <Typography
                      sx={{
                        fontSize: '0.5625rem',
                        color: 'rgba(255,255,255,0.6)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {entry.date_label}
                    </Typography>

                    {/* Category tag */}
                    <Box
                      sx={{
                        px: '6px',
                        py: '2px',
                        bgcolor: `${getCategoryColor(entry.category)}15`,
                        border: `1px solid ${getCategoryColor(entry.category)}40`,
                        borderRadius: '4px',
                        fontSize: '0.5625rem',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: getCategoryColor(entry.category),
                        textTransform: 'uppercase',
                      }}
                    >
                      {entry.category}
                    </Box>

                    {/* Source tag */}
                    <Box
                      sx={{
                        px: '6px',
                        py: '2px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        fontSize: '0.5625rem',
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        color: 'rgba(255,255,255,0.6)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {entry.source}
                    </Box>
                  </Box>

                  {/* Title */}
                  <Typography
                    sx={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.85)',
                      lineHeight: 1.35,
                      mb: entry.summary ? '4px' : '0',
                    }}
                  >
                    {entry.title}
                  </Typography>

                  {/* Summary */}
                  {entry.summary && (
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        color: 'rgba(255,255,255,0.6)',
                        lineHeight: 1.5,
                        mb: 0.75,
                      }}
                    >
                      {entry.summary}
                    </Typography>
                  )}

                  {/* ASINs */}
                  {(entry.asins?.length ?? 0) > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        mb: (entry.field_labels?.length ?? 0) > 0 ? 0.625 : 0,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.5625rem',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: 'rgba(255,255,255,0.6)',
                          textTransform: 'uppercase',
                          mr: 0.25,
                        }}
                      >
                        ASINs
                      </Typography>
                      {(entry.asins ?? []).map((asin) => (
                        <Box
                          key={asin}
                          sx={{
                            px: '5px',
                            py: '1px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '3px',
                            fontSize: '0.625rem',
                            fontFamily: 'monospace',
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.5)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {asin}
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Field labels */}
                  {(entry.field_labels?.length ?? 0) > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.5625rem',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: 'rgba(255,255,255,0.6)',
                          textTransform: 'uppercase',
                          mr: 0.25,
                        }}
                      >
                        Fields
                      </Typography>
                      {(entry.field_labels ?? []).map((field) => (
                        <Box
                          key={field}
                          sx={{
                            px: '5px',
                            py: '1px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '3px',
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.5)',
                          }}
                        >
                          {field}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          }),
        )}
      </Box>
    </Box>
  );
}
