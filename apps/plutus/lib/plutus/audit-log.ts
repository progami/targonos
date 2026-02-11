import { db } from '@/lib/db';
import type { Prisma } from '@targon/prisma-plutus';

export async function logAudit(params: {
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      userName: params.userName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: (params.details as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
