import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

type TimelineItem = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  timestamp?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
};

type TimelineProps = {
  items: TimelineItem[];
  sx?: SxProps<Theme>;
};

const variantColors = {
  default: { dot: '#cbd5e1', ring: 'rgba(226, 232, 240, 1)', icon: '#64748b' },
  success: { dot: '#22c55e', ring: 'rgba(220, 252, 231, 1)', icon: '#16a34a' },
  warning: { dot: '#f59e0b', ring: 'rgba(254, 243, 199, 1)', icon: '#d97706' },
  error: { dot: '#ef4444', ring: 'rgba(254, 226, 226, 1)', icon: '#dc2626' },
};

function CheckIcon() {
  return (
    <svg style={{ width: 14, height: 14 }} viewBox="0 0 16 16" fill="none">
      <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Timeline({ items, sx }: TimelineProps) {
  return (
    <Box sx={{ position: 'relative', ...sx }}>
      {items.map((item, index) => {
        const variant = item.variant ?? 'default';
        const colors = variantColors[variant];
        const isLast = index === items.length - 1;

        return (
          <Box key={index} sx={{ position: 'relative', display: 'flex', gap: 2, pb: isLast ? 0 : 4 }}>
            {!isLast && (
              <Box
                sx={{
                  position: 'absolute',
                  left: '15px',
                  top: '28px',
                  bottom: 0,
                  width: 1,
                  bgcolor: 'divider',
                }}
              />
            )}

            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  height: 30,
                  width: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  bgcolor: colors.dot,
                  boxShadow: `0 0 0 4px ${colors.ring}`,
                }}
              >
                <Box component="span" sx={{ color: colors.icon }}>
                  {item.icon ?? <CheckIcon />}
                </Box>
              </Box>
            </Box>

            <Box sx={{ minWidth: 0, flex: 1, pt: 0.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                    {item.title}
                  </Typography>
                  {item.description && (
                    <Typography variant="body2" sx={{ mt: 0.25, color: 'text.secondary' }}>
                      {item.description}
                    </Typography>
                  )}
                </Box>
                {item.timestamp && (
                  <Typography
                    component="time"
                    variant="caption"
                    sx={{ flexShrink: 0, fontWeight: 500, color: 'text.disabled' }}
                  >
                    {item.timestamp}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
