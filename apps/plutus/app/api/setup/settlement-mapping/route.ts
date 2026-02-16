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
    const config = await db.setupConfig.findFirst();
    const memoMapping = config?.usSettlementAccountIdByMemo;

    return NextResponse.json({
      usSettlementBankAccountId: config?.usSettlementBankAccountId ?? null,
      usSettlementPaymentAccountId: config?.usSettlementPaymentAccountId ?? null,
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

    const existing = await db.setupConfig.findFirst();

    const nextBank =
      parsed.usSettlementBankAccountId === undefined
        ? existing?.usSettlementBankAccountId ?? null
        : parsed.usSettlementBankAccountId;

    const nextPayment =
      parsed.usSettlementPaymentAccountId === undefined
        ? existing?.usSettlementPaymentAccountId ?? null
        : parsed.usSettlementPaymentAccountId;

    const nextMemoMapping =
      parsed.usSettlementAccountIdByMemo === undefined
        ? existing?.usSettlementAccountIdByMemo ?? {}
        : parsed.usSettlementAccountIdByMemo;

    if (existing) {
      await db.setupConfig.update({
        where: { id: existing.id },
        data: {
          usSettlementBankAccountId: nextBank,
          usSettlementPaymentAccountId: nextPayment,
          usSettlementAccountIdByMemo: nextMemoMapping,
        },
      });
    } else {
      await db.setupConfig.create({
        data: {
          usSettlementBankAccountId: nextBank,
          usSettlementPaymentAccountId: nextPayment,
          usSettlementAccountIdByMemo: nextMemoMapping,
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

