import type { Marketplace } from '@targon/prisma-argus';
import { prisma } from '@/lib/prisma';
import { getTalosClient } from '@/lib/talos/db';

function labelForSku(input: { skuCode: string; description: string }): string {
  return `${input.skuCode} — ${input.description}`;
}

function defaultAsinThresholds() {
  return { titleChanged: true, priceDeltaPct: 5, priceDeltaAbs: 1, imagesChanged: true };
}

async function syncMarketplace(marketplace: Marketplace) {
  const talos = getTalosClient(marketplace);
  try {
    const skus = await talos.sku.findMany({
      where: { isActive: true, asin: { not: null } },
      select: { skuCode: true, description: true, asin: true },
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let disabledCount = 0;

    const now = new Date();
    const activeAsins = new Set<string>();

    for (const sku of skus) {
      if (!sku.asin) {
        skippedCount += 1;
        continue;
      }

      const asin = sku.asin.trim().toUpperCase();
      if (!asin) {
        skippedCount += 1;
        continue;
      }

      activeAsins.add(asin);

      const existing = await prisma.watchTarget.findUnique({
        where: { marketplace_asin: { marketplace, asin } },
      });

      if (!existing) {
        const created = await prisma.watchTarget.create({
          data: {
            marketplace,
            owner: 'OURS',
            source: 'TALOS',
            label: labelForSku({ skuCode: sku.skuCode, description: sku.description }),
            asin,
            cadenceMinutes: 360,
            enabled: true,
            nextRunAt: now,
          },
        });
        await prisma.alertRule.create({
          data: { targetId: created.id, enabled: false, thresholds: defaultAsinThresholds() },
        });
        createdCount += 1;
        continue;
      }

      const nextLabel = labelForSku({ skuCode: sku.skuCode, description: sku.description });
      if (existing.label === nextLabel && existing.source === 'TALOS' && existing.owner === 'OURS') {
        await prisma.alertRule.upsert({
          where: { targetId: existing.id },
          create: { targetId: existing.id, enabled: false, thresholds: defaultAsinThresholds() },
          update: {},
        });
        skippedCount += 1;
        continue;
      }

      await prisma.watchTarget.update({
        where: { id: existing.id },
        data: {
          label: nextLabel,
          source: 'TALOS',
          owner: 'OURS',
        },
      });
      await prisma.alertRule.upsert({
        where: { targetId: existing.id },
        create: { targetId: existing.id, enabled: false, thresholds: defaultAsinThresholds() },
        update: {},
      });
      updatedCount += 1;
    }

    const stale = await prisma.watchTarget.updateMany({
      where: {
        marketplace,
        owner: 'OURS',
        source: 'TALOS',
        enabled: true,
        asin: { notIn: Array.from(activeAsins) },
      },
      data: { enabled: false },
    });
    disabledCount = stale.count;

    return { createdCount, updatedCount, skippedCount, disabledCount };
  } finally {
    await talos.$disconnect();
  }
}

export async function runTalosSync() {
  const run = await prisma.importRun.create({
    data: {
      source: 'TALOS',
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    const us = await syncMarketplace('US');
    const uk = await syncMarketplace('UK');

    const createdCount = us.createdCount + uk.createdCount;
    const updatedCount = us.updatedCount + uk.updatedCount + us.disabledCount + uk.disabledCount;
    const skippedCount = us.skippedCount + uk.skippedCount;

    return await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        createdCount,
        updatedCount,
        skippedCount,
        details: { us, uk },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return await prisma.importRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message },
    });
  }
}

export async function shouldRunTalosSync(minHoursBetweenRuns: number): Promise<boolean> {
  const last = await prisma.importRun.findFirst({
    where: { source: 'TALOS', status: 'SUCCESS' },
    orderBy: { finishedAt: 'desc' },
  });
  if (!last?.finishedAt) return true;

  const ageMs = Date.now() - last.finishedAt.getTime();
  return ageMs >= minHoursBetweenRuns * 60 * 60 * 1000;
}
