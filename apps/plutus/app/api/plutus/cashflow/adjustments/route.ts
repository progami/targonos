import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { z } from 'zod';
import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-cashflow-adjustments-route' });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const AdjustmentCreateSchema = z
  .object({
    date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD'),
    amountCents: z.number().int(),
    description: z.string().min(1).max(500),
    notes: z.string().max(2000).optional(),
  })
  .strict();

const AdjustmentQuerySchema = z
  .object({
    startDate: z.string().regex(DATE_RE, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(DATE_RE, 'endDate must be YYYY-MM-DD').optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    const raw = {
      startDate: req.nextUrl.searchParams.get('startDate') === null ? undefined : req.nextUrl.searchParams.get('startDate') ?? undefined,
      endDate: req.nextUrl.searchParams.get('endDate') === null ? undefined : req.nextUrl.searchParams.get('endDate') ?? undefined,
    };

    const parsed = AdjustmentQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid query params',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const where: {
      date?: {
        gte?: string;
        lte?: string;
      };
    } = {};

    if (parsed.data.startDate !== undefined || parsed.data.endDate !== undefined) {
      where.date = {};
      if (parsed.data.startDate !== undefined) {
        where.date.gte = parsed.data.startDate;
      }
      if (parsed.data.endDate !== undefined) {
        where.date.lte = parsed.data.endDate;
      }
    }

    const adjustments = await db.cashflowForecastAdjustment.findMany({
      where,
      orderBy: [
        { date: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json({ adjustments });
  } catch (error) {
    logger.error('Cashflow adjustments GET failed', error);
    return NextResponse.json(
      {
        error: 'Failed to load adjustments',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const parsed = AdjustmentCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid adjustment payload',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const adjustment = await db.cashflowForecastAdjustment.create({
      data: {
        date: parsed.data.date,
        amountCents: parsed.data.amountCents,
        description: parsed.data.description,
        notes: parsed.data.notes,
      },
    });

    return NextResponse.json({ adjustment });
  } catch (error) {
    logger.error('Cashflow adjustment POST failed', error);
    return NextResponse.json(
      {
        error: 'Failed to create adjustment',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
