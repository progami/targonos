'use client';

import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useNavigationHistory } from '@/lib/navigation-history';
import { cn } from '@/lib/utils';

type BackButtonProps = {
  label?: string;
  className?: string;
};

export function BackButton({ label = 'Back', className }: BackButtonProps) {
  const { goBack, canGoBack } = useNavigationHistory();

  if (!canGoBack) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 gap-1', className)}
      onClick={() => {
        goBack();
      }}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}

