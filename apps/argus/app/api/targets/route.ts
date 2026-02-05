import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { WatchTargetInputSchema } from '@/lib/targets/target-input';

export const GET = withArgusAuth(async () => {
  const targets = await prisma.watchTarget.findMany({
    orderBy: [{ createdAt: 'desc' }],
  });
  return NextResponse.json({ targets });
});

export const POST = withArgusAuth(async (request) => {
  const body = await request.json();
  const input = WatchTargetInputSchema.parse(body);

  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const target = await tx.watchTarget.create({
      data: {
        type: input.type,
        marketplace: input.marketplace,
        owner: input.owner,
        label: input.label,
        asin: input.asin,
        keyword: input.keyword,
        trackedAsins: input.trackedAsins,
        sourceUrl: input.sourceUrl,
        browseNodeId: input.browseNodeId,
        cadenceMinutes: input.cadenceMinutes,
        enabled: input.enabled,
        nextRunAt: now,
      },
    });

    const thresholds =
      target.type === 'ASIN'
        ? { titleChanged: true, priceDeltaPct: 5, priceDeltaAbs: 1, ratingDelta: 0.2 }
        : target.type === 'SEARCH'
          ? { enterExitTop10: true, positionDelta: 5 }
          : target.type === 'BROWSE_BESTSELLERS'
            ? { enterExitTop100: true, positionDelta: 10 }
            : {};

    await tx.alertRule.create({
      data: {
        targetId: target.id,
        enabled: false,
        thresholds,
      },
    });

    return target;
  });

  return NextResponse.json({ target: created }, { status: 201 });
});
