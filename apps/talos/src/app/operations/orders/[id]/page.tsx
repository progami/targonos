import { redirect } from 'next/navigation'

type ParamsInput = Promise<{ id: string }>

export default async function OrderRedirectPage({ params }: { params: ParamsInput }) {
  const resolvedParams = await Promise.resolve(params)
  redirect(`/operations/purchase-orders/${resolvedParams.id}`)
}
