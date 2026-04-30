'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { InboundOrderFlow } from '@/components/inbound/inbound-flow'

export default function InboundOrderDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  const tenant = searchParams.get('tenant')
  const tenantCode = tenant === 'US' || tenant === 'UK' ? tenant : undefined
  return <InboundOrderFlow mode="detail" orderId={id} tenantCode={tenantCode} />
}
