import { NextResponse } from 'next/server'
import type { PrismaClient } from '@targon/prisma-talos'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import * as XLSX from 'xlsx'
import { getImportConfig, mapExcelRowToEntity } from '@/lib/import-config'
import { Prisma } from '@targon/prisma-talos'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'

export const dynamic = 'force-dynamic'

type ExcelRow = Record<string, unknown>

export const POST = withAuth(async (request, session) => {
  try {
    const prisma = await getTenantPrisma()
    const formData = await request.formData()
    const file = formData.get('file') as File
    const entityName = formData.get('entityName') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!entityName) {
      return NextResponse.json({ error: 'No entity name provided' }, { status: 400 })
    }

    const config = getImportConfig(entityName)
    if (!config) {
      return NextResponse.json({ error: 'Invalid entity name' }, { status: 400 })
    }

    // Read file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    // Get the first sheet
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[]

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Process based on entity type
    switch (entityName) {
      case 'skus':
        const result = await importSkus(data, session.user.id, prisma)
        imported = result.imported
        skipped = result.skipped
        errors.push(...result.errors)
        break

      case 'warehouses':
        const warehouseResult = await importWarehouses(data, session.user.id, prisma)
        imported = warehouseResult.imported
        skipped = warehouseResult.skipped
        errors.push(...warehouseResult.errors)
        break

      case 'suppliers':
        const supplierResult = await importSuppliers(data, session.user.id, prisma)
        imported = supplierResult.imported
        skipped = supplierResult.skipped
        errors.push(...supplierResult.errors)
        break

      default:
        return NextResponse.json(
          { error: 'Import not implemented for this entity' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      result: { imported, skipped, errors },
    })
  } catch (_error) {
    // console.error('Import error:', error)
    return NextResponse.json(
      {
        error: 'Failed to import file',
        details: _error instanceof Error ? _error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
})

async function importSkus(data: ExcelRow[], _userId: string, prisma: PrismaClient) {
  const config = getImportConfig('skus')!
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  const allowedSkuFields = new Set([
    'skuCode',
    'asin',
    'description',
    'packSize',
    'material',
    'itemDimensionsCm',
    'itemSide1Cm',
    'itemSide2Cm',
    'itemSide3Cm',
    'itemWeightKg',
    'unitsPerCarton',
    'cartonDimensionsCm',
    'cartonSide1Cm',
    'cartonSide2Cm',
    'cartonSide3Cm',
    'cartonWeightKg',
    'packagingType',
  ])

  for (const row of data) {
    try {
      const { data: mappedData, errors: mappingErrors } = mapExcelRowToEntity(row, config)

      if (mappingErrors.length > 0) {
        const skuLabel = String(row['SKU'] ?? mappedData.skuCode ?? 'unknown')
        errors.push(`Row ${skuLabel}: ${mappingErrors.join(', ')}`)
        skipped++
        continue
      }

      const skuCode = mappedData.skuCode as string | undefined

      if (!skuCode) {
        errors.push('Row unknown: Missing SKU code')
        skipped++
        continue
      }

      const itemDimensionsCm = mappedData.itemDimensionsCm as string | undefined
      const cartonDimensionsCm = mappedData.cartonDimensionsCm as string | undefined

      const itemTriplet = resolveDimensionTripletCm({
        legacy: itemDimensionsCm,
      })
      if (itemDimensionsCm && !itemTriplet) {
        errors.push(`SKU ${skuCode}: Item dimensions must be a valid LxWxH triple`)
        skipped++
        continue
      }

      const cartonTriplet = resolveDimensionTripletCm({
        legacy: cartonDimensionsCm,
      })
      if (cartonDimensionsCm && !cartonTriplet) {
        errors.push(`SKU ${skuCode}: Carton dimensions must be a valid LxWxH triple`)
        skipped++
        continue
      }

      if (itemTriplet) {
        mappedData.itemDimensionsCm = formatDimensionTripletCm(itemTriplet)
        mappedData.itemSide1Cm = itemTriplet.side1Cm
        mappedData.itemSide2Cm = itemTriplet.side2Cm
        mappedData.itemSide3Cm = itemTriplet.side3Cm
      }

      if (cartonTriplet) {
        mappedData.cartonDimensionsCm = formatDimensionTripletCm(cartonTriplet)
        mappedData.cartonSide1Cm = cartonTriplet.side1Cm
        mappedData.cartonSide2Cm = cartonTriplet.side2Cm
        mappedData.cartonSide3Cm = cartonTriplet.side3Cm
      }

      const skuPayload = Object.fromEntries(
        Object.entries(mappedData).filter(
          ([key, value]) => allowedSkuFields.has(key) && value !== undefined
        )
      )

      await prisma.sku.upsert({
        where: { skuCode },
        update: skuPayload as unknown as Prisma.SkuUpdateInput,
        create: skuPayload as unknown as Prisma.SkuCreateInput,
      })
      imported++
    } catch (_error) {
      const skuLabel = String(row['SKU'] ?? 'unknown')
      errors.push(`SKU ${skuLabel}: ${_error instanceof Error ? _error.message : 'Unknown error'}`)
      skipped++
    }
  }

  return { imported, skipped, errors }
}

async function importWarehouses(data: ExcelRow[], _userId: string, prisma: PrismaClient) {
  const config = getImportConfig('warehouses')!
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of data) {
    try {
      const { data: mappedData, errors: mappingErrors } = mapExcelRowToEntity(row, config)

      if (mappingErrors.length > 0) {
        const warehouseLabel = String(row['Code'] ?? mappedData.code ?? 'unknown')
        errors.push(`Row ${warehouseLabel}: ${mappingErrors.join(', ')}`)
        skipped++
        continue
      }

      await prisma.warehouse.upsert({
        where: { code: mappedData.code as string },
        update: mappedData as unknown as Prisma.WarehouseUpdateInput,
        create: mappedData as unknown as Prisma.WarehouseCreateInput,
      })
      imported++
    } catch (_error) {
      const warehouseLabel = String(row['Code'] ?? 'unknown')
      errors.push(
        `Warehouse ${warehouseLabel}: ${_error instanceof Error ? _error.message : 'Unknown error'}`
      )
      skipped++
    }
  }

  return { imported, skipped, errors }
}

async function importSuppliers(data: ExcelRow[], _userId: string, prisma: PrismaClient) {
  const config = getImportConfig('suppliers')!
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  const allowedSupplierFields = new Set([
    'name',
    'contactName',
    'email',
    'phone',
    'address',
    'notes',
    'defaultPaymentTerms',
    'defaultIncoterms',
  ])

  for (const row of data) {
    try {
      const { data: mappedData, errors: mappingErrors } = mapExcelRowToEntity(row, config)

      if (mappingErrors.length > 0) {
        const supplierLabel = String(row['Name'] ?? mappedData.name ?? 'unknown')
        errors.push(`Row ${supplierLabel}: ${mappingErrors.join(', ')}`)
        skipped++
        continue
      }

      const name = mappedData.name as string | undefined

      if (!name) {
        errors.push('Row unknown: Missing supplier name')
        skipped++
        continue
      }

      const supplierPayload = Object.fromEntries(
        Object.entries(mappedData).filter(
          ([key, value]) => allowedSupplierFields.has(key) && value !== undefined
        )
      )

      await prisma.supplier.upsert({
        where: { name },
        update: supplierPayload as unknown as Prisma.SupplierUpdateInput,
        create: supplierPayload as unknown as Prisma.SupplierCreateInput,
      })
      imported++
    } catch (_error) {
      const supplierLabel = String(row['Name'] ?? 'unknown')
      errors.push(
        `Supplier ${supplierLabel}: ${_error instanceof Error ? _error.message : 'Unknown error'}`
      )
      skipped++
    }
  }

  return { imported, skipped, errors }
}
