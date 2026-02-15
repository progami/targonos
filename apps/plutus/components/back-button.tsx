'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Button } from '@/components/ui/button';
import { useNavigationHistory } from '@/lib/navigation-history';

type BackButtonProps = {
  label?: string;
};

export function BackButton({ label = 'Back' }: BackButtonProps) {
  const { goBack, canGoBack } = useNavigationHistory();

  if (!canGoBack) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        goBack();
      }}
      sx={{ ml: -1, gap: 0.5 }}
      startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
    >
      {label}
    </Button>
  );
}
