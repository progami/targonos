import { Prisma } from '@targon/prisma-argus';
import { prisma } from '@/lib/prisma';
import { getS3 } from '@/lib/s3';
import { requireEnv } from '@/lib/env';
import { loadEnvFromFiles } from './load-env';
import { launchDefaultBrowser, captureTarget } from '@/lib/capture/run';
import { sha256Hex, stableStringify } from '@/lib/capture/hash';
import { diffObjects } from '@/lib/capture/diff';
import { dispatchAlertsForRun } from '@/lib/alerts/dispatch';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgusEnv() {
  const value = requireEnv('ARGUS_ENV');
  if (value !== 'dev' && value !== 'main') {
    throw new Error(`Invalid ARGUS_ENV "${value}". Expected "dev" or "main".`);
  }
  return value;
}

function getWorkerId() {
  const host = process.env.HOSTNAME ? process.env.HOSTNAME.trim() : '';
  const pid = process.pid;
  return host ? `${host}:${pid}` : String(pid);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function backoffMinutesForAttempt(attemptCount: number): number | null {
  if (attemptCount === 1) return 5;
  if (attemptCount === 2) return 30;
  if (attemptCount === 3) return 120;
  return null;
}

async function claimNextJob(workerId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; targetId: string; attemptCount: number; scheduledAt: Date }>
  >`
    WITH cte AS (
      SELECT id
      FROM "CaptureJob"
      WHERE status = 'QUEUED' AND "scheduledAt" <= (NOW() AT TIME ZONE 'UTC')
      ORDER BY "scheduledAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "CaptureJob"
    SET
      status = 'RUNNING',
      "lockedAt" = (NOW() AT TIME ZONE 'UTC'),
      "lockedBy" = ${workerId},
      "startedAt" = (NOW() AT TIME ZONE 'UTC'),
      "attemptCount" = "attemptCount" + 1,
      "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    FROM cte
    WHERE "CaptureJob".id = cte.id
    RETURNING "CaptureJob".id, "CaptureJob"."targetId", "CaptureJob"."attemptCount", "CaptureJob"."scheduledAt";
  `;

  return rows[0] ?? null;
}

async function markJobFailed(options: { jobId: string; attemptCount: number; error: unknown }) {
  const message = options.error instanceof Error ? options.error.message : String(options.error);
  const now = new Date();
  const backoff = backoffMinutesForAttempt(options.attemptCount);

  if (backoff !== null) {
    await prisma.captureJob.update({
      where: { id: options.jobId },
      data: {
        status: 'QUEUED',
        scheduledAt: addMinutes(now, backoff),
        lastError: message,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return;
  }

  await prisma.captureJob.update({
    where: { id: options.jobId },
    data: {
      status: 'FAILED',
      finishedAt: now,
      lastError: message,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

async function main() {
  loadEnvFromFiles();

  const workerId = getWorkerId();
  const argusEnv = getArgusEnv();
  const s3 = getS3();

  // eslint-disable-next-line no-console
  console.log('[argus-capture] starting', { workerId, argusEnv });

  const browser = await launchDefaultBrowser();

  while (true) {
    const job = await claimNextJob(workerId);
    if (!job) {
      await sleep(5_000);
      continue;
    }

    // eslint-disable-next-line no-console
    console.log('[argus-capture] claimed job', { id: job.id, targetId: job.targetId, attemptCount: job.attemptCount });

    try {
      const target = await prisma.watchTarget.findUnique({ where: { id: job.targetId } });
      if (!target) {
        throw new Error(`Target not found: ${job.targetId}`);
      }

      const previous = await prisma.captureRun.findFirst({
        where: { targetId: target.id, normalizedExtracted: { not: Prisma.DbNull } },
        orderBy: { startedAt: 'desc' },
      });

      const result = await captureTarget(browser, target);

      const now = new Date();
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');

      if (result.status === 'BLOCKED') {
        const run = await prisma.captureRun.create({
          data: {
            targetId: target.id,
            startedAt: now,
            finalUrl: result.finalUrl,
            contentHash: sha256Hex(stableStringify({ blocked: true, url: result.finalUrl })),
            changedFromRunId: previous?.id,
            notes: result.notes,
            finishedAt: now,
          },
        });

        for (const artifact of result.artifacts) {
          const sha = sha256Hex(artifact.buffer);
          const key = `argus/${argusEnv}/${target.marketplace}/${target.type}/${target.id}/${year}/${month}/${day}/${run.id}/${artifact.kind}.png`;
          await s3.uploadFile(artifact.buffer, key, { contentType: 'image/png' });
          await prisma.runArtifact.create({
            data: {
              runId: run.id,
              kind: artifact.kind,
              marketplace: artifact.marketplace,
              asin: artifact.asin,
              position: artifact.position,
              s3Key: key,
              sha256: sha,
            },
          });
        }

        await prisma.captureJob.update({
          where: { id: job.id },
          data: {
            status: 'BLOCKED',
            finishedAt: now,
            runId: run.id,
            lockedAt: null,
            lockedBy: null,
          },
        });

        continue;
      }

      const changedFromRunId = previous?.id ?? null;
      const hasPrevious = previous && previous.normalizedExtracted !== null;
      const changeSummary =
        hasPrevious && previous.contentHash !== result.contentHash
          ? diffObjects(previous.normalizedExtracted, result.normalizedExtracted).map((change) => ({
              path: change.path,
              before: stableStringify(change.before),
              after: stableStringify(change.after),
            }))
          : undefined;

      const run = await prisma.captureRun.create({
        data: {
          targetId: target.id,
          startedAt: now,
          finalUrl: result.finalUrl,
          contentHash: result.contentHash,
          rawExtracted: result.rawExtracted as Prisma.InputJsonValue,
          normalizedExtracted: result.normalizedExtracted as Prisma.InputJsonValue,
          changedFromRunId,
          changeSummary,
          notes: result.notes,
          finishedAt: now,
        },
      });

      for (const artifact of result.artifacts) {
        const sha = sha256Hex(artifact.buffer);
        const key = `argus/${argusEnv}/${target.marketplace}/${target.type}/${target.id}/${year}/${month}/${day}/${run.id}/${artifact.kind}.png`;
        await s3.uploadFile(artifact.buffer, key, { contentType: 'image/png' });
        await prisma.runArtifact.create({
          data: {
            runId: run.id,
            kind: artifact.kind,
            marketplace: artifact.marketplace,
            asin: artifact.asin,
            position: artifact.position,
            s3Key: key,
            sha256: sha,
          },
        });
      }

      await prisma.captureJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          finishedAt: now,
          runId: run.id,
          lockedAt: null,
          lockedBy: null,
        },
      });

      // eslint-disable-next-line no-console
      console.log('[argus-capture] job complete', { id: job.id, runId: run.id, status: 'SUCCEEDED' });

      try {
        await dispatchAlertsForRun({
          target,
          runId: run.id,
          previousNormalizedExtracted: previous?.normalizedExtracted ?? null,
          currentNormalizedExtracted: result.normalizedExtracted,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[argus-capture] alert dispatch failed', { runId: run.id, error });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[argus-capture] job failed', { id: job.id, error });
      await markJobFailed({ jobId: job.id, attemptCount: job.attemptCount, error });
    }
  }
}

void main();
