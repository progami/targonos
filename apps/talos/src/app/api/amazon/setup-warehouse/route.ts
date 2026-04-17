import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import {
  getAmazonWarehouseCodeForRegion,
  getAmazonWarehouseNameForRegion,
} from '@/lib/warehouses/amazon-warehouse'
import { WarehouseKind } from '@targon/prisma-talos'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (_request, session) => {
 try {
 if (session.user.role !== 'admin') {
 // console.log('Setup warehouse: User is not admin:', session.user.role)
 return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
 }

 const prisma = await getTenantPrisma()
 // console.log('Setup warehouse: Starting setup for user:', session.user.email)

 // Create or update Amazon FBA warehouse for the active tenant
 const amazonWarehouseCode = getAmazonWarehouseCodeForRegion(session.user.region)
 const amazonWarehouseName = getAmazonWarehouseNameForRegion(session.user.region)
 const amazonWarehouseAddress =
   session.user.region === 'US' ? 'Amazon Fulfillment Centers US' : 'Amazon Fulfillment Centers UK'

 const amazonWarehouse = await prisma.warehouse.upsert({
   where: { code: amazonWarehouseCode },
   update: {
     name: amazonWarehouseName,
     address: amazonWarehouseAddress,
     isActive: true,
     kind: WarehouseKind.AMAZON_FBA,
   },
   create: {
     code: amazonWarehouseCode,
     name: amazonWarehouseName,
     address: amazonWarehouseAddress,
     isActive: true,
     kind: WarehouseKind.AMAZON_FBA,
   },
 })
 
 // Note: Amazon FBA storage uses cubic feet, so pallet config records are not required here.
 
 // Create seasonal storage rates
 const currentYear = new Date().getFullYear()
 const amazonRates = [
 {
 name: 'Amazon FBA Storage - Standard (Jan-Sep)',
 value: 0.75,
 unit: 'cubic foot/month',
 category: 'Storage' as const,
 effectiveDate: new Date(`${currentYear}-01-01`),
 endDate: new Date(`${currentYear}-09-30`)
 },
 {
 name: 'Amazon FBA Storage - Oversize (Jan-Sep)',
 value: 0.53,
 unit: 'cubic foot/month',
 category: 'Storage' as const,
 effectiveDate: new Date(`${currentYear}-01-01`),
 endDate: new Date(`${currentYear}-09-30`)
 },
 {
 name: 'Amazon FBA Storage - Standard (Oct-Dec)',
 value: 2.40,
 unit: 'cubic foot/month',
 category: 'Storage' as const,
 effectiveDate: new Date(`${currentYear}-10-01`),
 endDate: new Date(`${currentYear}-12-31`)
 },
 {
 name: 'Amazon FBA Storage - Oversize (Oct-Dec)',
 value: 1.65,
 unit: 'cubic foot/month',
 category: 'Storage' as const,
 effectiveDate: new Date(`${currentYear}-10-01`),
 endDate: new Date(`${currentYear}-12-31`)
 }
 ]
 
  let ratesCreated = 0
  const uniqueRates = Array.from(
    amazonRates.reduce((map, rate) => {
      if (!map.has(rate.category)) {
        map.set(rate.category, rate)
      }
      return map
    }, new Map<string, typeof amazonRates[number]>()).values()
  )

  for (const rate of uniqueRates) {
    const fallbackName =
      typeof rate.name === 'string' && rate.name.trim().length > 0
        ? rate.name.trim()
        : `${rate.category} Rate`
    const safeName = sanitizeForDisplay(fallbackName)
    const existingRate = await prisma.costRate.findFirst({
      where: {
        warehouseId: amazonWarehouse.id,
        costName: safeName
      }
    })

    if (!existingRate) {
      await prisma.costRate.create({
        data: {
          warehouseId: amazonWarehouse.id,
          costCategory: rate.category,
          costName: safeName,
          costValue: rate.value,
          unitOfMeasure: rate.unit,
          effectiveDate: rate.effectiveDate,
          endDate: rate.endDate,
          createdById: session.user.id
        }
      })
      ratesCreated++
    }
  }
 
 return NextResponse.json({
 warehouse: amazonWarehouse,
 ratesCreated,
 message: ratesCreated > 0 
 ? `Amazon FBA warehouse setup complete. Created ${ratesCreated} new rates.`
 : 'Amazon FBA warehouse already configured.'
 })
 } catch (_error) {
 // console.error('Error setting up Amazon warehouse:', _error)
 return NextResponse.json(
 { 
 error: 'Failed to setup Amazon warehouse',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 },
 { status: 500 }
 )
 }
})
