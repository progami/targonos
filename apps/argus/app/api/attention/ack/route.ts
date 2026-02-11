import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

const AckSchema = z.object({
  kind: z.enum(['job', 'run', 'alert']),
  id: z.string().trim().min(1),
});

export const POST = withArgusAuth(async (request, session) => {
  const body = await request.json();
  const input = AckSchema.parse(body);

  const now = new Date();
  const user = session.user;
  if (!user || !user.id) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const userId = user.id;
  const email = user.email ?? null;

  if (input.kind === 'job') {
    await prisma.captureJob.update({
      where: { id: input.id },
      data: {
        acknowledgedAt: now,
        acknowledgedByUserId: userId,
        acknowledgedByEmail: email,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (input.kind === 'run') {
    await prisma.captureRun.update({
      where: { id: input.id },
      data: {
        acknowledgedAt: now,
        acknowledgedByUserId: userId,
        acknowledgedByEmail: email,
      },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.alertEvent.update({
    where: { id: input.id },
    data: {
      acknowledgedAt: now,
      acknowledgedByUserId: userId,
      acknowledgedByEmail: email,
    },
  });
  return NextResponse.json({ ok: true });
});
