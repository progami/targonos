import type { Marketplace } from '@targon/prisma-argus';
import { prisma } from '@/lib/prisma';
import { getTalosClient } from '@/lib/talos/db';

function labelForSku(input: { skuCode: string; description: string }): string {
  return `${input.skuCode} — ${input.description}`;
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

    const now = new Date();

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

      const existing = await prisma.watchTarget.findUnique({
        where: { marketplace_type_asin: { marketplace, type: 'ASIN', asin } },
      });

      if (!existing) {
        await prisma.watchTarget.create({
          data: {
            type: 'ASIN',
            marketplace,
            owner: 'OURS',
            source: 'TALOS',
            label: labelForSku({ skuCode: sku.skuCode, description: sku.description }),
            asin,
            trackedAsins: [],
            cadenceMinutes: 360,
            enabled: true,
            nextRunAt: now,
          },
        });
        createdCount += 1;
        continue;
      }

      const nextLabel = labelForSku({ skuCode: sku.skuCode, description: sku.description });
      if (existing.label === nextLabel && existing.source === 'TALOS' && existing.owner === 'OURS') {
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
      updatedCount += 1;
    }

    return { createdCount, updatedCount, skippedCount };
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
    const updatedCount = us.updatedCount + uk.updatedCount;
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

