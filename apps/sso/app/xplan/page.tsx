import { redirect } from 'next/navigation'
import { ALL_APPS, resolveAppUrl } from '@/lib/apps'

export default async function XplanRedirect() {
  const xplan = ALL_APPS.find((app) => app.id === 'xplan')
  if (!xplan) {
    throw new Error('xPlan app definition is missing from the portal app registry.')
  }
  redirect(resolveAppUrl(xplan))
}
