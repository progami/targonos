#!/usr/bin/env tsx

import { getTenantPrismaClient } from './src/lib/tenant/prisma-factory'
import { DEFAULT_TENANT, isValidTenantCode, type TenantCode } from './src/lib/tenant/constants'

const resolveTenantCode = (): TenantCode => {
  const candidate = process.env.TENANT_CODE ?? process.env.NEXT_PUBLIC_TENANT
  return isValidTenantCode(candidate) ? candidate : DEFAULT_TENANT
}

async function checkStorageLedger() {
  console.log('📊 Checking Storage Ledger entries...\n')
  
  const prisma = await getTenantPrismaClient(resolveTenantCode())
  try {
    // Check if we have storage ledger entries
    const entries = await prisma.storageLedger.findMany({
      orderBy: [
        { weekEndingDate: 'desc' },
        { warehouseCode: 'asc' },
        { skuCode: 'asc' }
      ],
      take: 10
    })

    console.log(`Found ${entries.length} storage ledger entries\n`)

    if (entries.length > 0) {
      console.log('Recent entries:')
      console.log('================')
      
      entries.forEach((entry, index) => {
        console.log(`${index + 1}. Week ending: ${entry.weekEndingDate.toISOString().split('T')[0]}`)
        console.log(`   Warehouse: ${entry.warehouseName} (${entry.warehouseCode})`)
        console.log(`   SKU: ${entry.skuCode} - ${entry.skuDescription}`)
        console.log(`   Batch: ${entry.batchLot}`)
        console.log(`   Closing Balance: ${entry.closingBalance} cartons`)
        console.log(`   Closing Pallets: ${entry.closingPallets} pallets`)
        console.log(`   Pallet Days: ${entry.palletDays} pallet-days`)
        console.log(`   Storage Rate: ${entry.storageRatePerPalletDay ? '$' + Number(entry.storageRatePerPalletDay).toFixed(4) : 'N/A'}/pallet/day`)
        console.log(`   Total Cost: ${entry.totalStorageCost ? '$' + Number(entry.totalStorageCost).toFixed(2) : 'N/A'}`)
        console.log(`   Cost Calculated: ${entry.isCostCalculated ? 'Yes' : 'No'}`)
        console.log(`   Created: ${entry.createdAt.toISOString()}`)
        console.log('   ---')
      })
    }

    // Check cost summary
    const costSummary = await prisma.storageLedger.aggregate({
      _sum: {
        totalStorageCost: true
      },
      _count: {
        id: true
      },
      where: {
        isCostCalculated: true
      }
    })

    console.log('\n💰 Cost Summary:')
    console.log('================')
    console.log(`Total entries with costs: ${costSummary._count.id}`)
    console.log(`Total storage costs: ${costSummary._sum.totalStorageCost ? '$' + Number(costSummary._sum.totalStorageCost).toFixed(2) : '$0.00'}`)

    // Check recent transactions that should trigger storage entries
  const recentTransactions = await prisma.inventoryTransaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      transactionType: true,
      referenceId: true,
      warehouseCode: true,
      skuCode: true,
      batchLot: true,
      transactionDate: true,
      createdAt: true
      }
    })

    console.log('\n📦 Recent Transactions:')
    console.log('========================')
    recentTransactions.forEach((tx, index) => {
      console.log(`${index + 1}. ${tx.transactionType} - ${tx.referenceId ?? 'N/A'}`)
      console.log(`   Warehouse: ${tx.warehouseCode}, SKU: ${tx.skuCode}`)
      console.log(`   Transaction Date: ${tx.transactionDate.toISOString().split('T')[0]}`)
      console.log(`   Created: ${tx.createdAt.toISOString()}`)
      console.log('   ---')
    })

  } catch (error) {
    console.error('❌ Error checking storage ledger:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkStorageLedger()
