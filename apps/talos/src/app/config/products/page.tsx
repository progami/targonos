'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function SkuInfoRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const editSkuId = searchParams.get('editSkuId')
    const target = editSkuId
      ? `/amazon/fba-fee-discrepancies?editSkuId=${encodeURIComponent(editSkuId)}`
      : '/amazon/fba-fee-discrepancies'
    router.replace(target)
  }, [router, searchParams])

  return null
}

export default function LegacySkuInfoRoute() {
  return (
    <Suspense fallback={null}>
      <SkuInfoRedirect />
    </Suspense>
  )
}
