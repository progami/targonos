import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/setup - fetch current setup state
export async function GET() {
  try {
    const config = await db.setupConfig.findFirst();

    return NextResponse.json({
      accountMappings: config
        ? {
            amazonSales: config.amazonSales,
            amazonRefunds: config.amazonRefunds,
            amazonFbaInventoryReimbursement: config.amazonFbaInventoryReimbursement,
            amazonSellerFees: config.amazonSellerFees,
            amazonFbaFees: config.amazonFbaFees,
            amazonStorageFees: config.amazonStorageFees,
            amazonAdvertisingCosts: config.amazonAdvertisingCosts,
            amazonPromotions: config.amazonPromotions,
          }
        : {},
      accountsCreated: config ? config.accountsCreated : false,
    });
  } catch (error) {
    console.error('Failed to fetch setup:', error);
    return NextResponse.json({ error: 'Failed to fetch setup' }, { status: 500 });
  }
}
