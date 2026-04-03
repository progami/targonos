import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { WprSourceOverview, WprSourceMatrixRow } from '@/lib/wpr/types';

function groupRows(matrix: WprSourceMatrixRow[]): Record<string, WprSourceMatrixRow[]> {
  const groups: Record<string, WprSourceMatrixRow[]> = {};
  for (const row of matrix) {
    const g = row.group;
    if (!groups[g]) groups[g] = [];
    groups[g].push(row);
  }
  return groups;
}

export default function SourceHeatmap({ overview }: { overview: WprSourceOverview }) {
  const grouped = useMemo(() => groupRows(overview.matrix), [overview.matrix]);
  const groupNames = Object.keys(grouped);
  const weeks = overview.week_labels;
  const colCount = weeks.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Summary chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Box
          sx={{
            px: '8px',
            py: '3px',
            bgcolor: 'rgba(0, 194, 185, 0.12)',
            border: '1px solid rgba(0, 194, 185, 0.25)',
            borderRadius: '6px',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'rgba(0, 194, 185, 0.9)',
            letterSpacing: '0.04em',
          }}
        >
          {overview.weeks_with_data} WEEKS WITH DATA
        </Box>
        <Box
          sx={{
            px: '8px',
            py: '3px',
            bgcolor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            fontSize: '0.625rem',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.04em',
          }}
        >
          {overview.source_completeness}
        </Box>
        {overview.critical_gaps.length > 0 ? (
          <Box
            sx={{
              px: '8px',
              py: '3px',
              bgcolor: 'rgba(214, 80, 68, 0.15)',
              border: '1px solid rgba(214, 80, 68, 0.3)',
              borderRadius: '6px',
              fontSize: '0.625rem',
              fontWeight: 600,
              color: 'rgba(214, 80, 68, 0.9)',
              letterSpacing: '0.04em',
            }}
          >
            {overview.critical_gaps.length} CRITICAL GAP{overview.critical_gaps.length !== 1 ? 'S' : ''}
          </Box>
        ) : (
          <Box
            sx={{
              px: '8px',
              py: '3px',
              bgcolor: 'rgba(0, 194, 185, 0.08)',
              border: '1px solid rgba(0, 194, 185, 0.2)',
              borderRadius: '6px',
              fontSize: '0.625rem',
              fontWeight: 500,
              color: 'rgba(0, 194, 185, 0.7)',
              letterSpacing: '0.04em',
            }}
          >
            NO CRITICAL GAPS
          </Box>
        )}
      </Box>

      {/* Heatmap panel */}
      <Box
        sx={{
          bgcolor: 'rgba(0, 20, 35, 0.85)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '12px',
          p: 1.75,
          overflow: 'auto',
        }}
      >
        {/* Panel header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1.75,
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
            DATA SOURCE AVAILABILITY
          </Typography>
          <Typography
            sx={{
              fontSize: '0.5625rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            {overview.matrix.length} SOURCES &middot; {weeks.length} WEEKS
          </Typography>
        </Box>

        {/* Week column headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `140px repeat(${colCount}, 1fr)`,
            gap: 0.25,
            mb: 0.25,
          }}
        >
          <Box />
          {weeks.map((week) => (
            <Box
              key={week}
              sx={{
                textAlign: 'center',
                fontSize: '0.5rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: week === overview.latest_week
                  ? 'rgba(0, 194, 185, 0.9)'
                  : 'rgba(255,255,255,0.6)',
                py: '4px',
              }}
            >
              {week}
            </Box>
          ))}
        </Box>

        {/* Grouped rows */}
        {groupNames.map((groupName) => (
          <Box key={groupName} sx={{ mb: 0.75 }}>
            {/* Group header */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `140px repeat(${colCount}, 1fr)`,
                gap: 0.25,
                mb: 0.25,
              }}
            >
              <Box
                sx={{
                  fontSize: '0.5625rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(0, 194, 185, 0.8)',
                  py: '4px',
                  pl: 0.25,
                }}
              >
                {groupName}
              </Box>
            </Box>

            {/* Source rows */}
            {grouped[groupName].map((row) => {
              const isCritical = overview.critical_gaps.includes(row.name);
              return (
                <Box
                  key={`${row.group}-${row.name}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: `140px repeat(${colCount}, 1fr)`,
                    gap: 0.25,
                    mb: 0.25,
                  }}
                >
                  {/* Source name */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      pl: 1,
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      color: isCritical
                        ? 'rgba(214, 80, 68, 0.9)'
                        : 'rgba(255,255,255,0.65)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name}
                  </Box>

                  {/* Week cells */}
                  {weeks.map((week) => {
                    const cell = row.weeks[week];
                    const isAnchor = week === overview.latest_week;
                    const isPresent = cell.present;
                    const isMissingCritical = !isPresent && isCritical;

                    let bgColor: string;
                    if (isPresent) {
                      bgColor = 'rgba(0, 194, 185, 0.5)';
                    } else if (isMissingCritical) {
                      bgColor = 'rgba(214, 80, 68, 0.5)';
                    } else {
                      bgColor = 'rgba(255,255,255,0.04)';
                    }

                    return (
                      <Box
                        key={week}
                        sx={{
                          height: '24px',
                          borderRadius: '3px',
                          bgcolor: bgColor,
                          border: isAnchor
                            ? '1px solid rgba(0, 194, 185, 0.4)'
                            : '1px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'opacity 0.1s',
                          '&:hover': {
                            opacity: 0.8,
                          },
                        }}
                      >
                        {isPresent && cell.file_count > 1 && (
                          <Typography
                            sx={{
                              fontSize: '0.5rem',
                              fontWeight: 600,
                              color: 'rgba(255,255,255,0.6)',
                              lineHeight: 1,
                            }}
                          >
                            {cell.file_count}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
