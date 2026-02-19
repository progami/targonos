import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { z } from 'zod';
import { fetchAccounts } from '@/lib/qbo/api';
import { getQboConnection } from '@/lib/qbo/connection-store';
import { parseAutoRefreshTimeLocal } from '@/lib/plutus/cashflow/auto-refresh';
import {
  buildCashAccountCandidates,
  ensureCashflowConfigWithAccounts,
  updateCashflowConfig,
} from '@/lib/plutus/cashflow/snapshot';

const logger = createLogger({ name: 'plutus-cashflow-config-route' });

const ConfigUpdateSchema = z
  .object({
    cashAccountIds: z.array(z.string().min(1)).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    settlementLookbackDays: z.number().int().min(1).max(3650).optional(),
    settlementAverageCount: z.number().int().min(1).max(100).optional(),
    settlementDefaultIntervalDays: z.number().int().min(1).max(365).optional(),
    includeProjectedSettlements: z.boolean().optional(),
    includeOpenBills: z.boolean().optional(),
    includeOpenInvoices: z.boolean().optional(),
    includeRecurring: z.boolean().optional(),
    autoRefreshEnabled: z.boolean().optional(),
    autoRefreshTimeLocal: z.string().optional(),
    autoRefreshMinSnapshotAgeMinutes: z.number().int().min(0).max(10080).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.autoRefreshTimeLocal === undefined) {
      return;
    }

    try {
      parseAutoRefreshTimeLocal(value.autoRefreshTimeLocal);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoRefreshTimeLocal'],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

export async function GET() {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const accountResult = await fetchAccounts(connection, { includeInactive: true });
    const { config } = await ensureCashflowConfigWithAccounts(accountResult.accounts);

    const candidates = buildCashAccountCandidates(accountResult.accounts);

    return NextResponse.json({
      config,
      candidates,
    });
  } catch (error) {
    logger.error('Cashflow config GET failed', error);
    return NextResponse.json(
      {
        error: 'Failed to load cashflow config',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const parsed = ConfigUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid config payload',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const config = await updateCashflowConfig(parsed.data);
    return NextResponse.json({ config });
  } catch (error) {
    logger.error('Cashflow config POST failed', error);
    return NextResponse.json(
      {
        error: 'Failed to update cashflow config',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
