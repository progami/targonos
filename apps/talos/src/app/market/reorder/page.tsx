import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageHeader } from '@/components/ui/page-header'
import { Construction, Bell, AlertTriangle } from '@/lib/lucide-icons'
import { buildAppCallbackUrl, portalOrigin } from '@/lib/portal'

export default async function ReorderAlertsPage() {
 const session = await auth()

 if (!session) {
 const portalAuth = portalOrigin()
 const appUrl = process.env.NEXT_PUBLIC_APP_URL
 if (!appUrl) {
 throw new Error('NEXT_PUBLIC_APP_URL must be defined for Talos login redirects.')
 }
 redirect(
   `${portalAuth}/login?callbackUrl=${encodeURIComponent(
     buildAppCallbackUrl('/market/reorder', new URL(appUrl).origin),
   )}`,
 )
 }

 return (
 <DashboardLayout>
 <div className="px-4 sm:px-6 lg:px-8 py-8">
 <PageHeader
 title="Reorder Alerts"
 />

 <div className="mt-8 flex flex-col items-center justify-center text-center py-16">
 <div className="relative">
 <Construction className="h-24 w-24 text-yellow-500 mb-6" />
 <Bell className="h-8 w-8 text-yellow-600 absolute -right-2 -top-2 animate-bounce" />
 <AlertTriangle className="h-8 w-8 text-yellow-600 absolute -left-2 bottom-0 animate-pulse" />
 </div>
 
 <h2 className="text-2xl font-bold text-slate-900 mb-4">
 Under Construction
 </h2>
 
 <p className="text-slate-600 max-w-md mb-8">
 We're building an intelligent reorder alert system to help you maintain optimal inventory levels. 
 Never run out of stock or overstock your warehouse again.
 </p>

 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-lg">
 <h3 className="text-lg font-semibold text-yellow-900 mb-2">
 Coming Soon Features:
 </h3>
 <ul className="text-left text-yellow-800 space-y-2">
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Automatic reorder point calculations</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Customizable alert thresholds per SKU</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Lead time tracking and optimization</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Email and SMS notifications</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Integration with supplier systems</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Seasonal demand forecasting</span>
 </li>
 </ul>
 </div>

 <p className="text-sm text-slate-500 mt-8">
 Expected availability: Q2 2024
 </p>
 </div>
 </div>
 </DashboardLayout>
 )
}
