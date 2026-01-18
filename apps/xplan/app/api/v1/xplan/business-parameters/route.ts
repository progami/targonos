import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategiesAccess, requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { parseNumber, parsePercent } from '@/lib/utils/numbers';

const SUPPLIER_SPLIT_LABELS = [
  'Supplier Payment Split 1 (%)',
  'Supplier Payment Split 2 (%)',
  'Supplier Payment Split 3 (%)',
] as const;
const SUPPLIER_SPLIT_DEFAULTS = [50, 30, 20] as const;
const SUPPLIER_SPLIT_EPSILON = 1e-6;

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

const SUPPLIER_SPLIT_LABEL_MAP = Object.fromEntries(
  SUPPLIER_SPLIT_LABELS.map((label, index) => [normalizeLabel(label), index]),
) as Record<string, number>;

function supplierSplitIndex(label: string | null | undefined): number | null {
  if (!label) return null;
  const idx = SUPPLIER_SPLIT_LABEL_MAP[normalizeLabel(label)];
  return typeof idx === 'number' ? idx : null;
}

function toPercentDecimal(value: unknown, fallbackPercent: number): number {
  const numeric = parseNumber(value);
  const percent = numeric ?? fallbackPercent;
  return parsePercent(percent) ?? 0;
}

function supplierSplitTotalWithinLimit(splits: number[]): boolean {
  const total = splits.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return total <= 1 + SUPPLIER_SPLIT_EPSILON;
}

type UpdatePayload = {
  id: string;
  valueNumeric?: string;
  valueText?: string;
};

type CreatePayload = {
  strategyId: string;
  label: string;
  valueNumeric?: number;
  valueText?: string;
};

export const POST = withXPlanAuth(async (request: Request, session) => {
  try {
    const body = await request.json();
    const payload = body as CreatePayload;

    if (!payload?.strategyId) {
      return NextResponse.json({ error: 'strategyId is required' }, { status: 400 });
    }

    const { response } = await requireXPlanStrategyAccess(payload.strategyId, session);
    if (response) return response;

    if (!payload?.label) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }

    const splitIdx = supplierSplitIndex(payload.label);
    if (splitIdx != null) {
      const existing = await prisma.businessParameter.findMany({
        where: {
          strategyId: payload.strategyId,
          OR: SUPPLIER_SPLIT_LABELS.map((label) => ({
            label: { equals: label, mode: 'insensitive' },
          })),
        },
        select: { label: true, valueNumeric: true, valueText: true },
      });

      const splitDecimals = SUPPLIER_SPLIT_DEFAULTS.map(
        (fallback) => parsePercent(fallback) ?? 0,
      ) as number[];
      for (const record of existing) {
        const idx = supplierSplitIndex(record.label);
        if (idx == null) continue;
        splitDecimals[idx] = toPercentDecimal(
          record.valueNumeric ?? record.valueText,
          SUPPLIER_SPLIT_DEFAULTS[idx],
        );
      }

      splitDecimals[splitIdx] = toPercentDecimal(
        payload.valueNumeric ?? payload.valueText,
        SUPPLIER_SPLIT_DEFAULTS[splitIdx],
      );

      if (!supplierSplitTotalWithinLimit(splitDecimals)) {
        return NextResponse.json(
          { error: 'Supplier payment splits must total 100% or less.' },
          { status: 400 },
        );
      }
    }

    const numericValue =
      'valueNumeric' in payload && payload.valueNumeric != null
        ? new Prisma.Decimal(payload.valueNumeric)
        : undefined;

    const textValue =
      'valueText' in payload && payload.valueText != null ? payload.valueText : undefined;

    const parameter = await prisma.businessParameter.upsert({
      where: { strategyId_label: { strategyId: payload.strategyId, label: payload.label } },
      update: {
        ...(numericValue !== undefined ? { valueNumeric: numericValue } : {}),
        ...(textValue !== undefined ? { valueText: textValue } : {}),
      },
      create: {
        strategyId: payload.strategyId,
        label: payload.label,
        ...(numericValue !== undefined ? { valueNumeric: numericValue } : {}),
        ...(textValue !== undefined ? { valueText: textValue } : {}),
      },
    });

    return NextResponse.json({ parameter });
  } catch (error) {
    console.error('[business-parameters][POST]', error);
    return NextResponse.json({ error: 'Unable to create business parameter' }, { status: 500 });
  }
});

export const PUT = withXPlanAuth(async (request: Request, session) => {
  try {
    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? (body.updates as UpdatePayload[]) : [];
    if (updates.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const ids = updates
      .map((update) => update?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) {
      const existing = await prisma.businessParameter.findMany({
        where: { id: { in: ids } },
        select: { id: true, strategyId: true, label: true },
      });

      const { response } = await requireXPlanStrategiesAccess(
        existing
          .map((record) => record.strategyId)
          .filter(
            (strategyId): strategyId is string =>
              typeof strategyId === 'string' && strategyId.length > 0,
          ),
        session,
      );
      if (response) return response;

      const recordById = new Map(existing.map((record) => [record.id, record]));

      const strategiesToValidate = new Set<string>();
      const updatesByStrategy = new Map<
        string,
        Array<{ idx: number; raw: string | null | undefined }>
      >();

      updates.forEach((update) => {
        if (!update?.id) return;
        if (!('valueNumeric' in update)) return;
        const record = recordById.get(update.id);
        if (!record) return;
        const strategyId = record.strategyId;
        if (!strategyId) return;
        const idx = supplierSplitIndex(record.label);
        if (idx == null) return;
        strategiesToValidate.add(strategyId);
        const list = updatesByStrategy.get(strategyId) ?? [];
        list.push({ idx, raw: update.valueNumeric });
        updatesByStrategy.set(strategyId, list);
      });

      if (strategiesToValidate.size > 0) {
        const splitRecords = await prisma.businessParameter.findMany({
          where: {
            strategyId: { in: Array.from(strategiesToValidate) },
            OR: SUPPLIER_SPLIT_LABELS.map((label) => ({
              label: { equals: label, mode: 'insensitive' },
            })),
          },
          select: { strategyId: true, label: true, valueNumeric: true, valueText: true },
        });

        const splitsByStrategy = new Map<string, number[]>();
        for (const record of splitRecords) {
          const idx = supplierSplitIndex(record.label);
          if (idx == null) continue;
          const strategyId = record.strategyId;
          if (!strategyId) continue;
          const splits =
            splitsByStrategy.get(strategyId) ??
            (SUPPLIER_SPLIT_DEFAULTS.map((fallback) => parsePercent(fallback) ?? 0) as number[]);
          splits[idx] = toPercentDecimal(
            record.valueNumeric ?? record.valueText,
            SUPPLIER_SPLIT_DEFAULTS[idx],
          );
          splitsByStrategy.set(strategyId, splits);
        }

        for (const strategyId of strategiesToValidate) {
          const splits =
            splitsByStrategy.get(strategyId) ??
            (SUPPLIER_SPLIT_DEFAULTS.map((fallback) => parsePercent(fallback) ?? 0) as number[]);
          const pending = updatesByStrategy.get(strategyId) ?? [];
          for (const update of pending) {
            const numeric = parseNumber(update.raw);
            const rounded =
              numeric != null && Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
            splits[update.idx] = toPercentDecimal(rounded, SUPPLIER_SPLIT_DEFAULTS[update.idx]);
          }
          if (!supplierSplitTotalWithinLimit(splits)) {
            return NextResponse.json(
              { error: 'Supplier payment splits must total 100% or less.' },
              { status: 400 },
            );
          }
        }
      }
    }

    await Promise.all(
      updates.map(async (update) => {
        if (!update?.id) return;

        const data: Record<string, unknown> = {};

        if ('valueNumeric' in update) {
          if (update.valueNumeric === '' || update.valueNumeric == null) {
            data.valueNumeric = null;
          } else {
            const numeric = Number(update.valueNumeric);
            if (!Number.isNaN(numeric)) {
              data.valueNumeric = new Prisma.Decimal(numeric.toFixed(2));
            }
          }
        }

        if ('valueText' in update) {
          data.valueText = update.valueText ?? null;
        }

        if (Object.keys(data).length === 0) return;

        await prisma.businessParameter.update({
          where: { id: update.id },
          data,
        });
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[business-parameters][PUT]', error);
    return NextResponse.json({ error: 'Unable to update business parameters' }, { status: 500 });
  }
});
