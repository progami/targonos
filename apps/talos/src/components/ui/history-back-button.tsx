'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from '@/lib/lucide-icons'
import { Button } from '@/components/ui/button'

export function HistoryBackButton({ label = 'Back' }: { label?: string }) {
  const router = useRouter()

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={() => router.back()}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  )
}

