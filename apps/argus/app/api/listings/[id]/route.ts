import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

const paramsSchema = z.object({
  id: z.string().min(1),
});

const PatchSchema = z.object({
  label: z.string().trim().min(1).optional(),
  cadenceMinutes: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

export const GET = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const listing = await prisma.watchTarget.findUnique({
    where: { id },
  });
  if (!listing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ listing });
});

export const PATCH = withArgusAuth(async (request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const body = await request.json();
  const input = PatchSchema.parse(body);

  const listing = await prisma.watchTarget.findUnique({ where: { id } });
  if (!listing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isTalosOurs = listing.owner === 'OURS' && listing.source === 'TALOS';
  if (isTalosOurs) {
    const attemptedLabelChange = input.label !== undefined && input.label !== listing.label;
    const attemptedCadenceChange =
      input.cadenceMinutes !== undefined && input.cadenceMinutes !== listing.cadenceMinutes;

    if (attemptedLabelChange || attemptedCadenceChange) {
      return NextResponse.json({ error: 'Talos-sourced listings cannot be edited' }, { status: 403 });
    }
  }

  const updated = await prisma.watchTarget.update({
    where: { id },
    data: {
      label: input.label,
      cadenceMinutes: input.cadenceMinutes,
      enabled: input.enabled,
    },
  });

  return NextResponse.json({ listing: updated });
});

export const DELETE = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const listing = await prisma.watchTarget.findUnique({ where: { id } });
  if (!listing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (listing.owner !== 'COMPETITOR') {
    return NextResponse.json({ error: 'Only competitor listings can be deleted' }, { status: 403 });
  }

  await prisma.watchTarget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});

