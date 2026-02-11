import { prisma } from '@/lib/prisma';
import { loadEnvFromFiles } from './load-env';
import { runTalosSync, shouldRunTalosSync } from '@/lib/imports/talos-sync';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

async function enqueueDueTargets(limit: number): Promise<number> {
  const now = new Date();
  const due = await prisma.watchTarget.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: 'asc' },
    take: limit,
  });

  if (due.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const target of due) {
      await tx.captureJob.create({
        data: {
          targetId: target.id,
          scheduledAt: now,
          status: 'QUEUED',
        },
      });

      await tx.watchTarget.update({
        where: { id: target.id },
        data: { nextRunAt: addMinutes(now, target.cadenceMinutes) },
      });
    }
  });

  return due.length;
}

async function main() {
  loadEnvFromFiles();

  // eslint-disable-next-line no-console
  console.log('[argus-scheduler] starting');

  let lastTalosCheckAt: number | null = null;

  while (true) {
    try {
      const count = await enqueueDueTargets(50);
      if (count > 0) {
        // eslint-disable-next-line no-console
        console.log(`[argus-scheduler] enqueued ${count} job(s)`);
      }

      const now = Date.now();
      const shouldCheckTalos = lastTalosCheckAt === null || now - lastTalosCheckAt >= 15 * 60_000;
      if (shouldCheckTalos) {
        lastTalosCheckAt = now;
        if (await shouldRunTalosSync(24)) {
          // eslint-disable-next-line no-console
          console.log('[argus-scheduler] running Talos sync');
          await runTalosSync();
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[argus-scheduler] tick failed', error);
    }

    await sleep(60_000);
  }
}

void main();
