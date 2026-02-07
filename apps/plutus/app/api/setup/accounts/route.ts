import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';

const AccountMappingsSchema = z.object({
  accountMappings: z.object({
    invManufacturing: z.string().optional(),
    invFreight: z.string().optional(),
    invDuty: z.string().optional(),
    invMfgAccessories: z.string().optional(),
    cogsManufacturing: z.string().optional(),
    cogsFreight: z.string().optional(),
    cogsDuty: z.string().optional(),
    cogsMfgAccessories: z.string().optional(),
    cogsShrinkage: z.string().optional(),
    warehousing3pl: z.string().optional(),
    warehousingAmazonFc: z.string().optional(),
    warehousingAwd: z.string().optional(),
    amazonSales: z.string().optional(),
    amazonRefunds: z.string().optional(),
    amazonFbaInventoryReimbursement: z.string().optional(),
    amazonSellerFees: z.string().optional(),
    amazonFbaFees: z.string().optional(),
    amazonStorageFees: z.string().optional(),
    amazonAdvertisingCosts: z.string().optional(),
    amazonPromotions: z.string().optional(),
  }),
  accountsCreated: z.boolean().optional(),
});

// POST /api/setup/accounts - save account mappings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountMappings, accountsCreated } = AccountMappingsSchema.parse(body);

    // Upsert the setup config (there should only be one)
    const existing = await db.setupConfig.findFirst();

    if (existing) {
      const nextAccountsCreated =
        accountsCreated === undefined ? existing.accountsCreated : accountsCreated;

      await db.setupConfig.update({
        where: { id: existing.id },
        data: {
          ...accountMappings,
          accountsCreated: nextAccountsCreated,
        },
      });
    } else {
      await db.setupConfig.create({
        data: {
          ...accountMappings,
          accountsCreated: accountsCreated === undefined ? false : accountsCreated,
        },
      });
    }

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'CONFIG_UPDATED',
      entityType: 'SetupConfig',
      details: {
        accountsCreated: accountsCreated ?? existing?.accountsCreated ?? false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Failed to save account mappings:', error);
    return NextResponse.json({ error: 'Failed to save account mappings' }, { status: 500 });
  }
}
