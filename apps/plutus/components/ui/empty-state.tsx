import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  sx?: SxProps<Theme>;
};

function DefaultIcon() {
  return (
    <svg style={{ width: 40, height: 40 }} viewBox="0 0 48 48" fill="none">
      <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 18h36" stroke="currentColor" strokeWidth="2" />
      <circle cx="24" cy="28" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M20 34l4-2 4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ icon, title, description, action, sx }: EmptyStateProps) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 8, px: 2, ...sx }}>
      <Box
        sx={{
          display: 'flex',
          height: 80,
          width: 80,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          bgcolor: 'action.hover',
          color: 'text.disabled',
        }}
      >
        {icon ?? <DefaultIcon />}
      </Box>
      <Typography variant="body2" fontWeight={600} sx={{ mt: 2, color: 'text.primary' }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 384, textAlign: 'center', color: 'text.secondary' }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Stack>
  );
}
