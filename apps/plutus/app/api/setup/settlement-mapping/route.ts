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

type CombinedMemoMappingEntry = { accountId: string; taxCodeId: string | null };
type CombinedMemoMapping = Record<string, CombinedMemoMappingEntry>;

function parseCombinedMemoMapping(value: unknown): CombinedMemoMapping {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const obj = value as Record<string, unknown>;
  const result: CombinedMemoMapping = {};

  for (const [memo, raw] of Object.entries(obj)) {
    if (typeof raw === 'string') {
      const accountId = raw.trim();
      if (accountId === '') {
        throw new Error(`Invalid account id for memo mapping: ${memo}`);
      }
      result[memo] = { accountId, taxCodeId: null };
      continue;
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`Invalid memo mapping entry: ${memo}`);
    }

    const entry = raw as Record<string, unknown>;
    const accountIdRaw = entry.accountId;
    if (typeof accountIdRaw !== 'string' || accountIdRaw.trim() === '') {
      throw new Error(`Invalid account id for memo mapping: ${memo}`);
    }
    const accountId = accountIdRaw.trim();

    const taxRaw = entry.taxCodeId;
    let taxCodeId: string | null = null;
    if (taxRaw === null || taxRaw === undefined) {
      taxCodeId = null;
    } else if (typeof taxRaw === 'string') {
      const trimmed = taxRaw.trim();
      taxCodeId = trimmed === '' ? null : trimmed;
    } else {
      throw new Error(`Invalid tax code id for memo mapping: ${memo}`);
    }

    result[memo] = { accountId, taxCodeId };
  }

  return result;
}

function splitCombinedMemoMapping(mapping: CombinedMemoMapping): {
  accountIdByMemo: Record<string, string>;
  taxCodeIdByMemo: Record<string, string | null>;
} {
  const accountIdByMemo: Record<string, string> = {};
  const taxCodeIdByMemo: Record<string, string | null> = {};

  for (const [memo, entry] of Object.entries(mapping)) {
    accountIdByMemo[memo] = entry.accountId;
    taxCodeIdByMemo[memo] = entry.taxCodeId;
  }

  return { accountIdByMemo, taxCodeIdByMemo };
}

function buildCombinedMemoMapping(input: {
  accountIdByMemo: Record<string, string>;
  taxCodeIdByMemo: Record<string, string | null>;
  existing: CombinedMemoMapping;
}): CombinedMemoMapping {
  const result: CombinedMemoMapping = {};

  for (const [memo, accountIdRaw] of Object.entries(input.accountIdByMemo)) {
    const accountId = accountIdRaw.trim();
    if (accountId === '') {
      throw new Error(`Invalid account id for memo mapping: ${memo}`);
    }

    let taxCodeId: string | null = null;
    if (Object.prototype.hasOwnProperty.call(input.taxCodeIdByMemo, memo)) {
      const raw = input.taxCodeIdByMemo[memo];
      if (raw === null || raw === undefined) {
        taxCodeId = null;
      } else {
        const trimmed = raw.trim();
        taxCodeId = trimmed === '' ? null : trimmed;
      }
    } else {
      taxCodeId = input.existing[memo]?.taxCodeId ?? null;
    }

    result[memo] = { accountId, taxCodeId };
  }

  return result;
}

export async function GET() {
  try {
    const [usConfig, ukConfig] = await Promise.all([
      db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.com' } }),
      db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.co.uk' } }),
    ]);

    const usCombined = parseCombinedMemoMapping(usConfig?.accountIdByMemo);
    const ukCombined = parseCombinedMemoMapping(ukConfig?.accountIdByMemo);
    const usSplit = splitCombinedMemoMapping(usCombined);
    const ukSplit = splitCombinedMemoMapping(ukCombined);

    return NextResponse.json({
      usSettlementBankAccountId: usConfig?.bankAccountId ?? null,
      usSettlementPaymentAccountId: usConfig?.paymentAccountId ?? null,
      usSettlementAccountIdByMemo: usSplit.accountIdByMemo,
      usSettlementTaxCodeIdByMemo: usSplit.taxCodeIdByMemo,
      ukSettlementBankAccountId: ukConfig?.bankAccountId ?? null,
      ukSettlementPaymentAccountId: ukConfig?.paymentAccountId ?? null,
      ukSettlementAccountIdByMemo: ukSplit.accountIdByMemo,
      ukSettlementTaxCodeIdByMemo: ukSplit.taxCodeIdByMemo,
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

    const existingUsCombined = parseCombinedMemoMapping(existingUs?.accountIdByMemo);
    const existingUkCombined = parseCombinedMemoMapping(existingUk?.accountIdByMemo);
    const existingUsSplit = splitCombinedMemoMapping(existingUsCombined);
    const existingUkSplit = splitCombinedMemoMapping(existingUkCombined);

    const nextUsBank =
      parsed.usSettlementBankAccountId === undefined
        ? existingUs?.bankAccountId ?? null
        : parsed.usSettlementBankAccountId;

    const nextUsPayment =
      parsed.usSettlementPaymentAccountId === undefined
        ? existingUs?.paymentAccountId ?? null
        : parsed.usSettlementPaymentAccountId;

    const nextUsAccounts =
      parsed.usSettlementAccountIdByMemo === undefined ? existingUsSplit.accountIdByMemo : parsed.usSettlementAccountIdByMemo;
    const nextUsTax =
      parsed.usSettlementTaxCodeIdByMemo === undefined ? existingUsSplit.taxCodeIdByMemo : parsed.usSettlementTaxCodeIdByMemo;
    const nextUsCombined = buildCombinedMemoMapping({
      accountIdByMemo: nextUsAccounts,
      taxCodeIdByMemo: nextUsTax,
      existing: existingUsCombined,
    });

    const nextUkBank =
      parsed.ukSettlementBankAccountId === undefined
        ? existingUk?.bankAccountId ?? null
        : parsed.ukSettlementBankAccountId;

    const nextUkPayment =
      parsed.ukSettlementPaymentAccountId === undefined
        ? existingUk?.paymentAccountId ?? null
        : parsed.ukSettlementPaymentAccountId;

    const nextUkAccounts =
      parsed.ukSettlementAccountIdByMemo === undefined ? existingUkSplit.accountIdByMemo : parsed.ukSettlementAccountIdByMemo;
    const nextUkTax =
      parsed.ukSettlementTaxCodeIdByMemo === undefined ? existingUkSplit.taxCodeIdByMemo : parsed.ukSettlementTaxCodeIdByMemo;
    const nextUkCombined = buildCombinedMemoMapping({
      accountIdByMemo: nextUkAccounts,
      taxCodeIdByMemo: nextUkTax,
      existing: existingUkCombined,
    });

    if (writeUs) {
      await db.settlementPostingConfig.upsert({
        where: { marketplace: 'amazon.com' },
        update: {
          bankAccountId: nextUsBank,
          paymentAccountId: nextUsPayment,
          accountIdByMemo: nextUsCombined,
        },
        create: {
          marketplace: 'amazon.com',
          bankAccountId: nextUsBank,
          paymentAccountId: nextUsPayment,
          accountIdByMemo: nextUsCombined,
        },
      });
    }

    if (writeUk) {
      await db.settlementPostingConfig.upsert({
        where: { marketplace: 'amazon.co.uk' },
        update: {
          bankAccountId: nextUkBank,
          paymentAccountId: nextUkPayment,
          accountIdByMemo: nextUkCombined,
        },
        create: {
          marketplace: 'amazon.co.uk',
          bankAccountId: nextUkBank,
          paymentAccountId: nextUkPayment,
          accountIdByMemo: nextUkCombined,
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
        ...(writeUs ? { usSettlementMemoMappings: Object.keys(nextUsAccounts ?? {}).length } : {}),
        ...(writeUs ? { usSettlementTaxMemoMappings: Object.keys(nextUsTax ?? {}).length } : {}),
        ...(writeUk ? { ukSettlementMemoMappings: Object.keys(nextUkAccounts ?? {}).length } : {}),
        ...(writeUk ? { ukSettlementTaxMemoMappings: Object.keys(nextUkTax ?? {}).length } : {}),
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
