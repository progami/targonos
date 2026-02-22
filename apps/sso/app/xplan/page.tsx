import { redirect } from 'next/navigation'
import { buildPortalUrl } from '@targon/auth'

export default async function XplanRedirect() {
  const target = buildPortalUrl('/xplan')
  redirect(target.toString())
}
