'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeftIcon } from '@/components/ui/Icons'
import { cn } from '@/lib/utils'
import { useNavigationHistory } from '@/lib/navigation-history'

type BackButtonProps = {
  href?: string
  className?: string
}

export function BackButton({ href, className }: BackButtonProps) {
  const { goBack } = useNavigationHistory()

  const button = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={href ? undefined : goBack}
      className={cn('h-11 w-11', className)}
      aria-label="Back"
    >
      <ArrowLeftIcon className="h-5 w-5 text-muted-foreground" />
    </Button>
  )

  if (href) {
    return <Link href={href}>{button}</Link>
  }

  return button
}
