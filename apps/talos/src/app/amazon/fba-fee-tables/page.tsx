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
  UK_LOW_PRICE_FBA_TABLE_2026,
  UK_STANDARD_FBA_TABLE_2026,
  UK_STANDARD_FBA_OVERSIZE_TABLE_2026,
  getReferralFeePercentForTenant,
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

// UK-specific categories (some differ from US)
const UK_REFERRAL_CATEGORIES_2026 = [
  'Amazon Device Accessories',
  'Automotive and Powersports',
  'Baby Products',
  'Rucksacks and Handbags',
  'Beauty, Health, Personal Care',
  'Beer, Wine, and Spirits',
  'Books',
  'Business, Industrial, Scientific',
  'Compact Appliances',
  'Clothing and Accessories',
  'Commercial Electrical and Energy Supplies',
  'Computers',
  'Consumer Electronics',
  'Cycling Accessories',
  'Electronic Accessories',
  'Eyewear',
  'Footwear',
  'Full-Size Appliances',
  'Furniture',
  'Grocery and Gourmet',
  'Handmade',
  'Home Products',
  'Home and Kitchen',
  'Jewellery',
  'Lawn and Garden',
  'Luggage',
  'Mattresses',
  'Music, Video and DVD',
  'Musical Instruments and AV Production',
  'Office Products',
  'Pet Supplies',
  'Pet Clothing and Food',
  'Software',
  'Sports and Outdoors',
  'Tyres',
  'Tools and Home Improvement',
  'Toys and Games',
  'Video Games and Gaming Accessories',
  'Video Game Consoles',
  'Vitamins, Minerals & Supplements',
  'Watches',
  'Everything Else',
] as const

export default function FbaFeeTablesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const tenantCode = session?.user?.region ?? 'US'
  const isUK = tenantCode === 'UK'

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
    const categories = isUK ? UK_REFERRAL_CATEGORIES_2026 : AMAZON_REFERRAL_CATEGORIES_2026
    const pricePoints = isUK ? [5, 10, 15, 25, 100, 225] : [5, 15, 25, 100, 300, 1000]
    
    return categories.map(category => {
      const fees = pricePoints.map(price => getReferralFeePercentForTenant(tenantCode, category, price))
      return { category, fees, pricePoints }
    })
  }, [isUK, tenantCode])

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

  // UK Tables
  if (isUK) {
    return (
      <DashboardLayout>
        <PageContainer>
          <PageHeaderSection
            title="FBA Fee Tables"
            description="Amazon UK Rate Card 2026"
            icon={DollarSign}
          />

          <PageContent className="space-y-8">
            {/* Low-Price FBA Table */}
            <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
              <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Low-Price FBA Fulfillment Fee
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  For products priced at or below £10 (or £20 for most categories). Dimensions in cm, weight in grams.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3">Size Tier</th>
                      <th className="px-4 py-3">Max Weight</th>
                      <th className="px-4 py-3 text-right">Fee (£)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {UK_LOW_PRICE_FBA_TABLE_2026.map((row, index) => (
                      <tr key={`${row.sizeTier}-${row.maxWeightG}-${index}`} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                          {row.sizeTier}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {row.maxWeightG >= 1000 ? `${(row.maxWeightG / 1000).toFixed(1)} kg` : `${row.maxWeightG}g`}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          £{row.fee.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Standard FBA Table - Envelope and Parcel */}
            <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
              <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Standard FBA Fulfillment Fee (Envelope & Parcel)
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  For products priced above Low-Price thresholds. Local and Pan-European FBA.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3">Size Tier</th>
                      <th className="px-4 py-3">Max Weight</th>
                      <th className="px-4 py-3 text-right">Fee (£)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {UK_STANDARD_FBA_TABLE_2026.map((row, index) => (
                      <tr key={`${row.sizeTier}-${row.maxWeightG}-${index}`} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                          {row.sizeTier}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {row.maxWeightG >= 1000 ? `${(row.maxWeightG / 1000).toFixed(1)} kg` : `${row.maxWeightG}g`}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          £{row.fee.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Standard FBA Oversize Table */}
            <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
              <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Standard FBA Oversize Fees
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Base fee + per-kg overage for weight above base threshold.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3">Size Tier</th>
                      <th className="px-4 py-3 text-right">Base Fee (£)</th>
                      <th className="px-4 py-3 text-right">Per kg Overage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {UK_STANDARD_FBA_OVERSIZE_TABLE_2026.map((row) => (
                      <tr key={row.sizeTier} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                          {row.sizeTier}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          £{row.baseFee.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          +£{row.perKgOverage.toFixed(2)}/kg over {(row.baseWeightG / 1000).toFixed(1)} kg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* UK Size Tier Definitions */}
            <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
              <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Size Tier Definitions
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  How Amazon determines the size tier for a product (dimensions in cm, weight in g/kg).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3">Size Tier</th>
                      <th className="px-4 py-3">Max Dimensions</th>
                      <th className="px-4 py-3">Max Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Light Envelope</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33 x 23 x 2.5 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">100g</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Standard Envelope</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33 x 23 x 2.5 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">460g</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Large Envelope</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33 x 23 x 4 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">960g</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-large Envelope</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33 x 23 x 6 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">960g</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Small Parcel</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">35 x 25 x 12 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">3.9 kg</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Standard Parcel</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">45 x 34 x 26 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">11.9 kg</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Small Oversize</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">61 x 46 x 46 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">1.76 kg unit / 25.82 kg dim</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Standard Oversize Light</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">101 x 60 x 60 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">15 kg unit / 72.72 kg dim</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Standard Oversize Heavy</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">101 x 60 x 60 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">&gt;15 kg, ≤23 kg unit</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Standard Oversize Large</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">120 x 60 x 60 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">23 kg unit / 86.4 kg dim</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Bulky Oversize</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">&gt;120 x 60 x 60 cm</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">23 kg unit / 126 kg dim</td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Heavy Oversize</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">-</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">&gt;23 kg, ≤31.5 kg unit</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* UK Referral Fee Table */}
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
                      {referralFeeData[0]?.pricePoints.map(price => (
                        <th key={price} className="px-4 py-3 text-right">@ £{price}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {referralFeeData.map(row => (
                      <tr key={row.category} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">{row.category}</td>
                        {row.fees.map((fee, idx) => (
                          <td key={idx} className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                            {fee !== null ? `${fee}%` : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              UK fee tables effective 2026. Source:{' '}
              <a
                href="https://sellercentral.amazon.co.uk/help/hub/reference/G201411300"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-600 dark:hover:text-slate-400"
              >
                Amazon UK FBA Fee Schedule
              </a>
            </p>
          </PageContent>
        </PageContainer>
      </DashboardLayout>
    )
  }

  // US Tables (original)
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection
          title="FBA Fee Tables"
          description="Amazon US Rate Card 2026 (after Jan 15, 2026)"
          icon={DollarSign}
        />

        <PageContent className="space-y-8">
          {/* Small Standard-Size Table */}
          <section className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
            <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Small Standard-Size FBA Fulfillment Fee
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Unit weight up to 16 oz, dimensions up to 15&quot; x 12&quot; x 0.75&quot;
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
                          ${row.fee.under10.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          ${row.fee.tenToFifty.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          ${row.fee.over50.toFixed(2)}
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
                Chargeable weight under 1 lb, dimensions up to 18&quot; x 14&quot; x 8&quot;
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
                          ${row.fee.under10.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          ${row.fee.tenToFifty.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          ${row.fee.over50.toFixed(2)}
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
                Chargeable weight 1 to 3 lb, dimensions up to 18&quot; x 14&quot; x 8&quot;. Over 3 lb: $6.15/$6.97/$7.23 + $0.08 per 1/4 lb.
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
                          ${row.fee.under10.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          ${row.fee.tenToFifty.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          ${row.fee.over50.toFixed(2)}
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
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">15&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">12&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">0.75&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">-</td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Large Standard-Size</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">20 lb or less*</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">18&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">14&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">8&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">-</td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Small Bulky</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">50 lb or less*</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">37&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">28&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">20&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">130&quot; or less</td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Large Bulky</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">50 lb or less*</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">59&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">33&quot; or less</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">130&quot; or less</td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Extra-Large</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 50 lb*</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 59&quot;</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 33&quot;</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 33&quot;</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">Over 130&quot;</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                * Chargeable weight = max(unit weight, dimensional weight). Dimensional weight = (L x W x H) / 139.
                For bulky/extra-large: minimum 2&quot; assumed for width and height.
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
                  {AMAZON_REFERRAL_CATEGORIES_2026.map(category => {
                    const feeAt5 = getReferralFeePercent2026(category, 5)
                    const feeAt15 = getReferralFeePercent2026(category, 15)
                    const feeAt25 = getReferralFeePercent2026(category, 25)
                    const feeAt100 = getReferralFeePercent2026(category, 100)
                    const feeAt300 = getReferralFeePercent2026(category, 300)
                    const feeAt1000 = getReferralFeePercent2026(category, 1000)
                    return (
                      <tr key={category} className="bg-white dark:bg-slate-800">
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">{category}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {feeAt5 !== null ? `${feeAt5}%` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {feeAt15 !== null ? `${feeAt15}%` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {feeAt25 !== null ? `${feeAt25}%` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {feeAt100 !== null ? `${feeAt100}%` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {feeAt300 !== null ? `${feeAt300}%` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {feeAt1000 !== null ? `${feeAt1000}%` : '-'}
                        </td>
                      </tr>
                    )
                  })}
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
