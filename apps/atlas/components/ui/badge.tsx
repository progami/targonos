import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-border/60 bg-muted/50 text-muted-foreground",
        primary: "border-transparent bg-[hsl(var(--primary))] text-white",
        secondary: "border-border/60 bg-muted/50 text-foreground",
        destructive: "border-transparent bg-[hsl(var(--destructive))] text-white",
        outline: "text-foreground border-border",
        success: "border-transparent bg-success-50 text-success-700",
        warning: "border-transparent bg-warning-50 text-warning-700",
        error: "border-transparent bg-danger-50 text-danger-700",
        info: "border-transparent bg-primary/10 text-primary",
        accent: "border-transparent bg-accent/10 text-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

type BadgeVariant = "success" | "warning" | "error" | "info" | "default"

function getStatusVariant(status: unknown): BadgeVariant {
  if (typeof status !== "string") return "default"

  const s = status.trim().toLowerCase()
  if (!s) return "default"

  if (/(active|published|approved|completed|acknowledged|done)\b/.test(s)) return "success"
  if (/(pending|review|in[_ -]?progress|awaiting|overdue)\b/.test(s)) return "warning"
  if (/(rejected|dismissed|denied|error|failed|cancelled|canceled)\b/.test(s)) return "error"
  if (/(archived|inactive|suspended|closed|resigned|terminated)\b/.test(s)) return "default"

  return "info"
}

interface StatusBadgeProps {
  status: unknown
  className?: string
}

function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const label = typeof status === "string" && status.trim() ? status : "—"

  return (
    <Badge variant={getStatusVariant(status)} className={className}>
      {label}
    </Badge>
  )
}

export { Badge, StatusBadge }
