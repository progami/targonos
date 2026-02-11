import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { evaluateListingImageCompliance } from '@/lib/listing-images/compliance';
import type { AttentionResponse } from '@/lib/attention/types';

export const GET = withArgusAuth(async () => {
  const [blockedJobs, failedJobs, alerts] = await Promise.all([
    prisma.captureJob.findMany({
      where: { status: 'BLOCKED', acknowledgedAt: null },
      take: 25,
      orderBy: [{ scheduledAt: 'desc' }],
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        lastError: true,
        target: { select: { id: true, label: true, marketplace: true, owner: true } },
      },
    }),
    prisma.captureJob.findMany({
      where: { status: 'FAILED', acknowledgedAt: null },
      take: 25,
      orderBy: [{ finishedAt: 'desc' }],
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        finishedAt: true,
        lastError: true,
        target: { select: { id: true, label: true, marketplace: true, owner: true } },
      },
    }),
    prisma.alertEvent.findMany({
      where: { acknowledgedAt: null },
      take: 30,
      orderBy: [{ sentAt: 'desc' }],
      select: {
        id: true,
        sentAt: true,
        subject: true,
        rule: { select: { target: { select: { id: true, label: true, marketplace: true, owner: true } } } },
      },
    }),
  ]);

  const signalChanges = await prisma.$queryRaw<
    Array<{
      id: string;
      startedAt: Date;
      changeSummary: unknown;
      targetId: string;
      label: string;
      marketplace: 'US' | 'UK';
      owner: 'OURS' | 'COMPETITOR';
    }>
  >`
    SELECT DISTINCT ON (r."targetId")
      r.id,
      r."startedAt",
      r."changeSummary",
      t.id as "targetId",
      t.label,
      t.marketplace,
      t.owner
    FROM "CaptureRun" r
    JOIN "WatchTarget" t ON t.id = r."targetId"
    WHERE r."acknowledgedAt" IS NULL AND r."changeSummary" IS NOT NULL AND jsonb_typeof(r."changeSummary") = 'object'
    ORDER BY r."targetId", r."startedAt" DESC
    LIMIT 100;
  `;

  const [assetsNoActiveSetTargets, complianceCandidates] = await Promise.all([
    prisma.watchTarget.findMany({
      where: { owner: 'OURS', enabled: true, activeImageVersionId: null },
      orderBy: [{ label: 'asc' }],
      take: 100,
      select: { id: true, label: true, marketplace: true, owner: true, updatedAt: true },
    }),
    prisma.watchTarget.findMany({
      where: { owner: 'OURS', enabled: true, activeImageVersionId: { not: null } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 75,
      select: {
        id: true,
        label: true,
        marketplace: true,
        owner: true,
        updatedAt: true,
        activeImageVersion: {
          select: {
            id: true,
            createdAt: true,
            slots: {
              select: {
                position: true,
                blob: { select: { byteSize: true, width: true, height: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const assetsComplianceErrors: AttentionResponse['assetsComplianceErrors'] = [];
  for (const t of complianceCandidates) {
    const v = t.activeImageVersion;
    if (!v) continue;

    const metrics = v.slots.map((s) => ({
      position: s.position,
      byteSize: s.blob.byteSize,
      width: s.blob.width,
      height: s.blob.height,
    }));
    const compliance = evaluateListingImageCompliance(metrics);

    const slotErrorsCount = compliance.slots.reduce((acc, slot) => acc + slot.errors.length, 0);
    const hasErrors = compliance.setErrors.length > 0 || slotErrorsCount > 0;
    if (!hasErrors) continue;

    assetsComplianceErrors.push({
      updatedAt: (v.createdAt ?? t.updatedAt).toISOString(),
      target: { id: t.id, label: t.label, marketplace: t.marketplace, owner: 'OURS' },
      setErrors: compliance.setErrors,
      slotErrorsCount,
    });
  }

  const payload: AttentionResponse = {
    blockedJobs: blockedJobs.map((j) => ({
      id: j.id,
      status: 'BLOCKED',
      scheduledAt: j.scheduledAt.toISOString(),
      lastError: j.lastError,
      target: {
        id: j.target.id,
        label: j.target.label,
        marketplace: j.target.marketplace,
        owner: j.target.owner,
      },
    })),
    failedJobs: failedJobs.map((j) => ({
      id: j.id,
      status: 'FAILED',
      scheduledAt: j.scheduledAt.toISOString(),
      finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
      lastError: j.lastError,
      target: {
        id: j.target.id,
        label: j.target.label,
        marketplace: j.target.marketplace,
        owner: j.target.owner,
      },
    })),
    alerts: alerts.map((e) => ({
      id: e.id,
      sentAt: e.sentAt.toISOString(),
      subject: e.subject,
      target: {
        id: e.rule.target.id,
        label: e.rule.target.label,
        marketplace: e.rule.target.marketplace,
        owner: e.rule.target.owner,
      },
    })),
    signalChanges: signalChanges.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      changeSummary: r.changeSummary,
      target: { id: r.targetId, label: r.label, marketplace: r.marketplace, owner: r.owner },
    })),
    assetsNoActiveSet: assetsNoActiveSetTargets.map((t) => ({
      updatedAt: t.updatedAt.toISOString(),
      target: { id: t.id, label: t.label, marketplace: t.marketplace, owner: 'OURS' },
    })),
    assetsComplianceErrors,
  };

  return NextResponse.json(payload);
});
