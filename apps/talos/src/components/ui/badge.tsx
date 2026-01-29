import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border-border text-foreground",
        // Semantic variants - using theme-consistent colors
        success: "border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
        warning: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
        danger: "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300",
        info: "border-primary/30 bg-primary/10 text-primary",
        neutral: "border-muted bg-muted/50 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
