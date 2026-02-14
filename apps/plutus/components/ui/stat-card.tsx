import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: { direction: 'up' | 'down' | 'neutral'; label?: string };
  dotColor?: string;
  sx?: SxProps<Theme>;
};

function TrendArrow({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  if (direction === 'neutral') {
    return (
      <svg style={{ width: 14, height: 14, color: '#94a3b8' }} viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      style={{ width: 14, height: 14, color: direction === 'up' ? '#22c55e' : '#ef4444' }}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d={direction === 'up' ? 'M8 3v10M4 7l4-4 4 4' : 'M8 13V3M4 9l4 4 4-4'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatCard({ label, value, icon, trend, dotColor, sx }: StatCardProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 2,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          '& .stat-card-gradient': { opacity: 1 },
        },
        ...sx,
      }}
    >
      <Box
        className="stat-card-gradient"
        sx={{
          position: 'absolute',
          inset: '0 0 auto 0',
          height: 2,
          background: 'linear-gradient(to right, rgba(69, 179, 212, 0.6), rgba(69, 179, 212, 0.4), transparent)',
          opacity: 0,
          transition: 'opacity 0.2s',
        }}
      />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {dotColor && (
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  height: 8,
                  width: 8,
                  borderRadius: '50%',
                  bgcolor: dotColor,
                }}
              />
            )}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'text.secondary',
              }}
            >
              {label}
            </Typography>
          </Box>
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography
              variant="h5"
              component="span"
              sx={{
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: 'text.primary',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </Typography>
            {trend && (
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendArrow direction={trend.direction} />
                {trend.label && (
                  <Typography
                    variant="caption"
                    component="span"
                    sx={{
                      fontWeight: 500,
                      color:
                        trend.direction === 'up'
                          ? 'success.main'
                          : trend.direction === 'down'
                            ? 'error.main'
                            : 'text.secondary',
                    }}
                  >
                    {trend.label}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
        {icon && (
          <Box
            sx={{
              display: 'flex',
              height: 40,
              width: 40,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 2,
              bgcolor: 'rgba(69, 179, 212, 0.08)',
              color: '#2384a1',
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
    </Box>
  );
}
