'use client'

import { useParams } from 'next/navigation'
import { PurchaseOrderFlow } from '@/components/purchase-orders/purchase-order-flow'

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
  return <PurchaseOrderFlow mode="detail" orderId={id} />
}

