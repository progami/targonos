import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';

const SettlementMappingSchema = z.object({
  usSettlementBankAccountId: z.string().nullable().optional(),
  usSettlementPaymentAccountId: z.string().nullable().optional(),
  usSettlementAccountIdByMemo: z.record(z.string(), z.string()).optional(),
  usSettlementTaxCodeIdByMemo: z.record(z.string(), z.string().nullable()).optional(),
  ukSettlementBankAccountId: z.string().nullable().optional(),
  ukSettlementPaymentAccountId: z.string().nullable().optional(),
  ukSettlementAccountIdByMemo: z.record(z.string(), z.string()).optional(),
  ukSettlementTaxCodeIdByMemo: z.record(z.string(), z.string().nullable()).optional(),
});

export async function GET() {
  try {
    const [usConfig, ukConfig] = await Promise.all([
      db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.com' } }),
      db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.co.uk' } }),
    ]);

    return NextResponse.json({
      usSettlementBankAccountId: usConfig?.bankAccountId ?? null,
      usSettlementPaymentAccountId: usConfig?.paymentAccountId ?? null,
      usSettlementAccountIdByMemo: typeof usConfig?.accountIdByMemo === 'object' && usConfig.accountIdByMemo !== null ? usConfig.accountIdByMemo : {},
      usSettlementTaxCodeIdByMemo: typeof usConfig?.taxCodeIdByMemo === 'object' && usConfig.taxCodeIdByMemo !== null ? usConfig.taxCodeIdByMemo : {},
      ukSettlementBankAccountId: ukConfig?.bankAccountId ?? null,
      ukSettlementPaymentAccountId: ukConfig?.paymentAccountId ?? null,
      ukSettlementAccountIdByMemo: typeof ukConfig?.accountIdByMemo === 'object' && ukConfig.accountIdByMemo !== null ? ukConfig.accountIdByMemo : {},
      ukSettlementTaxCodeIdByMemo: typeof ukConfig?.taxCodeIdByMemo === 'object' && ukConfig.taxCodeIdByMemo !== null ? ukConfig.taxCodeIdByMemo : {},
    });
  } catch (error) {
    console.error('Failed to fetch settlement mapping:', error);
    return NextResponse.json({ error: 'Failed to fetch settlement mapping' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SettlementMappingSchema.parse(body);

    const [existingUs, existingUk] = await Promise.all([
      db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.com' } }),
      db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.co.uk' } }),
    ]);

    const writeUs =
      existingUs !== null ||
      parsed.usSettlementBankAccountId !== undefined ||
      parsed.usSettlementPaymentAccountId !== undefined ||
      parsed.usSettlementAccountIdByMemo !== undefined ||
      parsed.usSettlementTaxCodeIdByMemo !== undefined;

    const writeUk =
      existingUk !== null ||
      parsed.ukSettlementBankAccountId !== undefined ||
      parsed.ukSettlementPaymentAccountId !== undefined ||
      parsed.ukSettlementAccountIdByMemo !== undefined ||
      parsed.ukSettlementTaxCodeIdByMemo !== undefined;

    const nextUsBank =
      parsed.usSettlementBankAccountId === undefined
        ? existingUs?.bankAccountId ?? null
        : parsed.usSettlementBankAccountId;

    const nextUsPayment =
      parsed.usSettlementPaymentAccountId === undefined
        ? existingUs?.paymentAccountId ?? null
        : parsed.usSettlementPaymentAccountId;

    const nextUsMemoMapping =
      parsed.usSettlementAccountIdByMemo === undefined
        ? existingUs?.accountIdByMemo ?? {}
        : parsed.usSettlementAccountIdByMemo;

    const nextUsTaxMapping =
      parsed.usSettlementTaxCodeIdByMemo === undefined
        ? existingUs?.taxCodeIdByMemo ?? {}
        : parsed.usSettlementTaxCodeIdByMemo;

    const nextUkBank =
      parsed.ukSettlementBankAccountId === undefined
        ? existingUk?.bankAccountId ?? null
        : parsed.ukSettlementBankAccountId;

    const nextUkPayment =
      parsed.ukSettlementPaymentAccountId === undefined
        ? existingUk?.paymentAccountId ?? null
        : parsed.ukSettlementPaymentAccountId;

    const nextUkMemoMapping =
      parsed.ukSettlementAccountIdByMemo === undefined
        ? existingUk?.accountIdByMemo ?? {}
        : parsed.ukSettlementAccountIdByMemo;

    const nextUkTaxMapping =
      parsed.ukSettlementTaxCodeIdByMemo === undefined
        ? existingUk?.taxCodeIdByMemo ?? {}
        : parsed.ukSettlementTaxCodeIdByMemo;

    if (writeUs) {
      await db.settlementPostingConfig.upsert({
        where: { marketplace: 'amazon.com' },
        update: {
          bankAccountId: nextUsBank,
          paymentAccountId: nextUsPayment,
          accountIdByMemo: nextUsMemoMapping,
          taxCodeIdByMemo: nextUsTaxMapping,
        },
        create: {
          marketplace: 'amazon.com',
          bankAccountId: nextUsBank,
          paymentAccountId: nextUsPayment,
          accountIdByMemo: nextUsMemoMapping,
          taxCodeIdByMemo: nextUsTaxMapping,
        },
      });
    }

    if (writeUk) {
      await db.settlementPostingConfig.upsert({
        where: { marketplace: 'amazon.co.uk' },
        update: {
          bankAccountId: nextUkBank,
          paymentAccountId: nextUkPayment,
          accountIdByMemo: nextUkMemoMapping,
          taxCodeIdByMemo: nextUkTaxMapping,
        },
        create: {
          marketplace: 'amazon.co.uk',
          bankAccountId: nextUkBank,
          paymentAccountId: nextUkPayment,
          accountIdByMemo: nextUkMemoMapping,
          taxCodeIdByMemo: nextUkTaxMapping,
        },
      });
    }

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'CONFIG_UPDATED',
      entityType: 'SettlementPostingConfig',
      details: {
        ...(writeUs ? { usSettlementMemoMappings: Object.keys(nextUsMemoMapping ?? {}).length } : {}),
        ...(writeUs ? { usSettlementTaxMemoMappings: Object.keys(nextUsTaxMapping ?? {}).length } : {}),
        ...(writeUk ? { ukSettlementMemoMappings: Object.keys(nextUkMemoMapping ?? {}).length } : {}),
        ...(writeUk ? { ukSettlementTaxMemoMappings: Object.keys(nextUkTaxMapping ?? {}).length } : {}),
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
