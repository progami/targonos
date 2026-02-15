'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Button from '@mui/material/Button';
import { useNavigationHistory } from '@/lib/navigation-history';

type BackButtonProps = {
  label?: string;
};

export function BackButton({ label = 'Back' }: BackButtonProps) {
  const { goBack, canGoBack } = useNavigationHistory();

  if (!canGoBack) return null;

  return (
    <Button
      variant="text"
      size="small"
      onClick={() => {
        goBack();
      }}
      sx={{ ml: -1, gap: 0.5, color: 'text.secondary', '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
      startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
    >
      {label}
    </Button>
  );
}
