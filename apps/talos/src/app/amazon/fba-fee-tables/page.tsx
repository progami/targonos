'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import {
  SMALL_STANDARD_TABLE_2026,
  LARGE_STANDARD_OZ_TABLE_2026,
  LARGE_STANDARD_LB_TABLE_2026,
  getReferralFeePercent2026,
} from '@/lib/amazon/fees'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { DollarSign, Loader2 } from '@/lib/lucide-icons'

const ALLOWED_ROLES = ['admin', 'staff'] as const

const AMAZON_REFERRAL_CATEGORIES_2026 = [
  'Amazon Device Accessories',
  'Appliances - Compact',
  'Appliances - Full-size',
  'Automotive and Powersports',
  'Baby Products',
  'Backpacks, Handbags, Luggage',
  'Base Equipment Power Tools',
  'Beauty, Health, Personal Care',
  'Books',
  'Business, Industrial, Scientific',
  'Clothing and Accessories',
  'Computers',
  'Consumer Electronics',
  'DVD',
  'Electronics Accessories',
  'Everything Else',
  'Eyewear',
  'Fine Art',
  'Footwear',
  'Furniture',
  'Gift Cards',
  'Grocery and Gourmet',
  'Home and Kitchen',
  'Jewelry',
  'Lawn and Garden',
  'Lawn Mowers & Snow Throwers',
  'Mattresses',
  'Merchant Fulfilled Services',
  'Music',
  'Musical Instruments & AV',
  'Office Products',
  'Pet Supplies',
  'Software',
  'Sports and Outdoors',
  'Tires',
  'Tools and Home Improvement',
  'Toys and Games',
  'Video',
  'Video Game Consoles',
  'Video Games & Gaming Accessories',
  'Watches',
] as const

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

export default function FbaFeeTablesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const isAllowed = useMemo(() => {
    if (!session) return false
    type AllowedRole = (typeof ALLOWED_ROLES)[number]
    return ALLOWED_ROLES.includes(session.user.role as AllowedRole)
  }, [session])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
      redirectToPortal('/login', `${window.location.origin}${basePath}/amazon/fba-fee-tables`)
      return
    }

    if (!isAllowed) {
      toast.error('You are not authorised to view this page')
      router.push('/dashboard')
    }
  }, [isAllowed, router, session, status])

  const referralFeeData = useMemo(() => {
    return AMAZON_REFERRAL_CATEGORIES_2026.map(category => {
      const feeAt5 = getReferralFeePercent2026(category, 5)
      const feeAt15 = getReferralFeePercent2026(category, 15)
      const feeAt25 = getReferralFeePercent2026(category, 25)
      const feeAt100 = getReferralFeePercent2026(category, 100)
      const feeAt300 = getReferralFeePercent2026(category, 300)
      const feeAt1000 = getReferralFeePercent2026(category, 1000)
      return {
        category,
        feeAt5,
        feeAt15,
        feeAt25,
        feeAt100,
        feeAt300,
        feeAt1000,
      }
    })
  }, [])

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
            <span className="text-sm text-slate-500">Loading...</span>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!session || !isAllowed) return null

  return (
    <DashboardLayout>
    <PageContainer>
      <PageHeaderSection
        title="FBA Fee Tables"
        description="Amazon US Rate Card 2026 (after Jan 15, 2026)"
        icon={DollarSign}
      />

      <PageContent className="space-y-8">
        {/* UK Rate Card Link */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Note:</strong> These are US FBA fees (USD). For UK FBA fees (GBP), see the{' '}
            <a
              href="https://sellercentral.amazon.co.uk/help/hub/reference/G201411300"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
            >
              Amazon UK FBA Rate Card
            </a>.
          </p>
        </div>

        {/* Small Standard-Size Table */}
        <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Small Standard-Size FBA Fulfillment Fee
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Unit weight up to 16 oz, dimensions up to 15" x 12" x 0.75"
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Shipping Weight (oz)</th>
                  <th className="px-4 py-3 text-right">Under $10</th>
                  <th className="px-4 py-3 text-right">$10 to $50</th>
                  <th className="px-4 py-3 text-right">Over $50</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {SMALL_STANDARD_TABLE_2026.map((row, index) => {
                  const minOz = index === 0 ? 0 : SMALL_STANDARD_TABLE_2026[index - 1].maxOz
                  return (
                    <tr key={row.maxOz} className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                        {minOz} to {row.maxOz} oz
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.under10)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.tenToFifty)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.over50)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Large Standard-Size (Ounces) Table */}
        <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Large Standard-Size FBA Fulfillment Fee (Under 1 lb)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Chargeable weight under 1 lb, dimensions up to 18" x 14" x 8"
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Shipping Weight (oz)</th>
                  <th className="px-4 py-3 text-right">Under $10</th>
                  <th className="px-4 py-3 text-right">$10 to $50</th>
                  <th className="px-4 py-3 text-right">Over $50</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {LARGE_STANDARD_OZ_TABLE_2026.map((row, index) => {
                  const minOz = index === 0 ? 0 : LARGE_STANDARD_OZ_TABLE_2026[index - 1].maxOz
                  return (
                    <tr key={row.maxOz} className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                        {minOz} to {row.maxOz} oz
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.under10)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.tenToFifty)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.over50)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Large Standard-Size (Pounds) Table */}
        <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Large Standard-Size FBA Fulfillment Fee (1 to 3 lb)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Chargeable weight 1 to 3 lb, dimensions up to 18" x 14" x 8". Over 3 lb: $6.15/$6.97/$7.23 + $0.08 per 1/4 lb.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Shipping Weight (lb)</th>
                  <th className="px-4 py-3 text-right">Under $10</th>
                  <th className="px-4 py-3 text-right">$10 to $50</th>
                  <th className="px-4 py-3 text-right">Over $50</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {LARGE_STANDARD_LB_TABLE_2026.map((row, index) => {
                  const minLb = index === 0 ? 1 : LARGE_STANDARD_LB_TABLE_2026[index - 1].maxLb
                  return (
                    <tr key={row.maxLb} className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                        {minLb} to {row.maxLb} lb
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.under10)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.tenToFifty)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(row.fee.over50)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bulky and Extra-Large Fees */}
        <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Bulky and Extra-Large FBA Fulfillment Fees
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Base fee + per-lb overage. Chargeable weight = max(unit weight, dimensional weight).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Size Tier</th>
                  <th className="px-4 py-3 text-right">Under $10</th>
                  <th className="px-4 py-3 text-right">$10 to $50</th>
                  <th className="px-4 py-3 text-right">Over $50</th>
                  <th className="px-4 py-3 text-right">Overage Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Small Bulky</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$6.78</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$7.55</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$7.55</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">+$0.38/lb over 1 lb</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Large Bulky</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$8.58</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$9.35</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$9.35</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">+$0.38/lb over 1 lb</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-Large 0 to 50 lb</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$25.56</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$26.33</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$26.33</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">+$0.38/lb over 1 lb</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-Large 50+ to 70 lb</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$36.55</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$37.32</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$37.32</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">+$0.75/lb over 51 lb</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-Large 70+ to 150 lb</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$50.55</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$51.32</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$51.32</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">+$0.75/lb over 71 lb</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-Large 150+ lb</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$194.18</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$194.95</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">$194.95</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">+$0.19/lb over 151 lb</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Size Tier Definitions */}
        <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Size Tier Definitions
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              How Amazon determines the size tier for a product (dimensions in inches, weight in lb/oz).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Size Tier</th>
                  <th className="px-4 py-3">Unit Weight</th>
                  <th className="px-4 py-3">Longest Side</th>
                  <th className="px-4 py-3">Median Side</th>
                  <th className="px-4 py-3">Shortest Side</th>
                  <th className="px-4 py-3">Length + Girth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Small Standard-Size</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">16 oz or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">15" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">12" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">0.75" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">-</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Large Standard-Size</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">20 lb or less*</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">18" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">14" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">8" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">-</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Small Bulky</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">50 lb or less*</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">37" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">28" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">20" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">130" or less</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Large Bulky</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">50 lb or less*</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">59" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33" or less</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">130" or less</td>
                </tr>
                <tr className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-Large</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 50 lb*</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 59"</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 33"</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 33"</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 130"</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              * Chargeable weight = max(unit weight, dimensional weight). Dimensional weight = (L x W x H) / 139.
              For bulky/extra-large: minimum 2" assumed for width and height.
            </p>
          </div>
        </section>

        {/* Referral Fee Table */}
        <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Referral Fee Percentages by Category
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Referral fee percentage varies by category and sometimes by listing price.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">@ $5</th>
                  <th className="px-4 py-3 text-right">@ $15</th>
                  <th className="px-4 py-3 text-right">@ $25</th>
                  <th className="px-4 py-3 text-right">@ $100</th>
                  <th className="px-4 py-3 text-right">@ $300</th>
                  <th className="px-4 py-3 text-right">@ $1000</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {referralFeeData.map(row => (
                  <tr key={row.category} className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">{row.category}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {row.feeAt5 !== null ? `${row.feeAt5}%` : '-'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {row.feeAt15 !== null ? `${row.feeAt15}%` : '-'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {row.feeAt25 !== null ? `${row.feeAt25}%` : '-'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {row.feeAt100 !== null ? `${row.feeAt100}%` : '-'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {row.feeAt300 !== null ? `${row.feeAt300}%` : '-'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {row.feeAt1000 !== null ? `${row.feeAt1000}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          US fee tables effective January 15, 2026 (non-peak, excluding apparel). Source:{' '}
          <a
            href="https://sellercentral.amazon.com/help/hub/reference/G201411300"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600 dark:hover:text-slate-400"
          >
            Amazon US FBA Fee Schedule
          </a>
        </p>
      </PageContent>
    </PageContainer>
    </DashboardLayout>
  )
}
