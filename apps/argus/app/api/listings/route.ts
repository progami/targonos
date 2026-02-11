import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

const MarketplaceSchema = z.enum(['US', 'UK']);

const CreateCompetitorSchema = z.object({
  marketplace: MarketplaceSchema,
  asin: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.toUpperCase()),
  label: z.string().trim().min(1),
  cadenceMinutes: z.number().int().positive().default(360),
  enabled: z.boolean().default(true),
});

function defaultAsinThresholds() {
  return { titleChanged: true, priceDeltaPct: 5, priceDeltaAbs: 1, imagesChanged: true };
}

export const GET = withArgusAuth(async () => {
  const listings = await prisma.watchTarget.findMany({
    orderBy: [{ updatedAt: 'desc' }],
  });
  return NextResponse.json({ listings });
});

export const POST = withArgusAuth(async (request) => {
  const body = await request.json();
  const input = CreateCompetitorSchema.parse(body);

  const now = new Date();

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.watchTarget.create({
      data: {
        marketplace: input.marketplace,
        owner: 'COMPETITOR',
        source: 'MANUAL',
        label: input.label,
        asin: input.asin,
        cadenceMinutes: input.cadenceMinutes,
        enabled: input.enabled,
        nextRunAt: now,
      },
    });

    await tx.alertRule.create({
      data: {
        targetId: created.id,
        enabled: false,
        thresholds: defaultAsinThresholds(),
      },
    });

    return created;
  });

  return NextResponse.json({ listing }, { status: 201 });
});

