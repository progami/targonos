'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { PurchaseOrderFlow } from '@/components/purchase-orders/purchase-order-flow'

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  const tenant = searchParams.get('tenant')
  const tenantCode = tenant === 'US' || tenant === 'UK' ? tenant : undefined
  return <PurchaseOrderFlow mode="detail" orderId={id} tenantCode={tenantCode} />
}
