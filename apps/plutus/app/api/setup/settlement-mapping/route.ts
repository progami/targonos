import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';

const UsSettlementMappingSchema = z.object({
  usSettlementBankAccountId: z.string().nullable().optional(),
  usSettlementPaymentAccountId: z.string().nullable().optional(),
  usSettlementAccountIdByMemo: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  try {
    const config = await db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.com' } });
    const memoMapping = config?.accountIdByMemo;

    return NextResponse.json({
      usSettlementBankAccountId: config?.bankAccountId ?? null,
      usSettlementPaymentAccountId: config?.paymentAccountId ?? null,
      usSettlementAccountIdByMemo: typeof memoMapping === 'object' && memoMapping !== null ? memoMapping : {},
    });
  } catch (error) {
    console.error('Failed to fetch settlement mapping:', error);
    return NextResponse.json({ error: 'Failed to fetch settlement mapping' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = UsSettlementMappingSchema.parse(body);

    const existing = await db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.com' } });

    const nextBank =
      parsed.usSettlementBankAccountId === undefined
        ? existing?.bankAccountId ?? null
        : parsed.usSettlementBankAccountId;

    const nextPayment =
      parsed.usSettlementPaymentAccountId === undefined
        ? existing?.paymentAccountId ?? null
        : parsed.usSettlementPaymentAccountId;

    const nextMemoMapping =
      parsed.usSettlementAccountIdByMemo === undefined
        ? existing?.accountIdByMemo ?? {}
        : parsed.usSettlementAccountIdByMemo;

    await db.settlementPostingConfig.upsert({
      where: { marketplace: 'amazon.com' },
      update: {
        bankAccountId: nextBank,
        paymentAccountId: nextPayment,
        accountIdByMemo: nextMemoMapping,
      },
      create: {
        marketplace: 'amazon.com',
        bankAccountId: nextBank,
        paymentAccountId: nextPayment,
        accountIdByMemo: nextMemoMapping,
      },
    });

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'CONFIG_UPDATED',
      entityType: 'SettlementPostingConfig',
      details: {
        usSettlementMemoMappings: Object.keys(nextMemoMapping ?? {}).length,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Failed to save settlement mapping:', error);
    return NextResponse.json({ error: 'Failed to save settlement mapping' }, { status: 500 });
  }
}
