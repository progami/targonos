import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal-500/50 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-brand-teal-500/10 text-brand-teal-700 dark:bg-brand-cyan/15 dark:text-brand-cyan',
        secondary:
          'border-transparent bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
        destructive:
          'border-transparent bg-danger-100 text-danger-700 dark:bg-danger-900/50 dark:text-danger-400',
        outline: 'border-slate-300 text-slate-600 dark:border-white/20 dark:text-slate-400',
        success:
          'border-transparent bg-success-100 text-success-700 dark:bg-success-900/50 dark:text-success-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
