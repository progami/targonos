import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/setup - fetch current setup state
export async function GET() {
  try {
    const [brands, skus, config] = await Promise.all([
      db.brand.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      db.sku.findMany({
        include: { brand: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.setupConfig.findFirst(),
    ]);

    return NextResponse.json({
      brands: brands.map((b: { id: string; name: string; marketplace: string; currency: string }) => ({
        id: b.id,
        name: b.name,
        marketplace: b.marketplace,
        currency: b.currency,
      })),
      skus: skus.map((s: { id: string; sku: string; productName: string | null; brand: { name: string }; asin: string | null }) => ({
        id: s.id,
        sku: s.sku,
        productName: s.productName,
        brand: s.brand.name,
        asin: s.asin,
      })),
      accountMappings: config
        ? {
            invManufacturing: config.invManufacturing,
            invFreight: config.invFreight,
            invDuty: config.invDuty,
            invMfgAccessories: config.invMfgAccessories,
            cogsManufacturing: config.cogsManufacturing,
            cogsFreight: config.cogsFreight,
            cogsDuty: config.cogsDuty,
            cogsMfgAccessories: config.cogsMfgAccessories,
            cogsShrinkage: config.cogsShrinkage,
            warehousing3pl: config.warehousing3pl,
            warehousingAmazonFc: config.warehousingAmazonFc,
            warehousingAwd: config.warehousingAwd,
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
