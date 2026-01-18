import 'server-only';

import type { Session } from 'next-auth';
import { buildPortalUrl } from '@targon/auth';
import { getPortalAuthPrisma } from '@targon/auth/server';
import { Prisma } from '@targon/prisma-xplan';
import prisma from '@/lib/prisma';

type StrategyActor = {
  id: string | null;
  email: string | null;
  isSuperAdmin: boolean;
};

const FORBIDDEN_STRATEGY_ID = '__forbidden__';

export type AllowedAssignee = {
  id: string;
  email: string;
  fullName: string | null;
};

function parseEmailSet(raw: string | undefined) {
  return new Set(
    (raw ?? '')
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

const DEFAULT_SUPER_ADMINS = new Set(['jarrar@targonglobal.com']);

let strategyAssignmentFieldsAvailable = true;

function superAdminEmailSet() {
  const configured = parseEmailSet(process.env.XPLAN_SUPER_ADMIN_EMAILS);
  return configured.size > 0 ? configured : DEFAULT_SUPER_ADMINS;
}

export function isXPlanSuperAdmin(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return superAdminEmailSet().has(normalized);
}

export function markStrategyAssignmentFieldsUnavailable() {
  strategyAssignmentFieldsAvailable = false;
}

export function areStrategyAssignmentFieldsAvailable() {
  return strategyAssignmentFieldsAvailable;
}

export function isStrategyAssignmentFieldsMissingError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('createdById') ||
    message.includes('createdByEmail') ||
    message.includes('assigneeId') ||
    message.includes('assigneeEmail')
  );
}

export function getStrategyActor(session: Session | null): StrategyActor {
  const user = session?.user as (Session['user'] & { id?: unknown }) | undefined;
  const id = typeof user?.id === 'string' ? user.id : null;
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : null;

  return {
    id,
    email,
    isSuperAdmin: isXPlanSuperAdmin(email),
  };
}

export function buildStrategyAccessWhere(actor: StrategyActor) {
  if (actor.isSuperAdmin) return {};
  if (!strategyAssignmentFieldsAvailable) return { id: FORBIDDEN_STRATEGY_ID };

  const or: Array<Record<string, unknown>> = [];
  if (actor.id) {
    or.push({ createdById: actor.id }, { assigneeId: actor.id });
  }
  if (actor.email) {
    or.push({ createdByEmail: actor.email }, { assigneeEmail: actor.email });
  }

  if (or.length === 0) {
    return { id: FORBIDDEN_STRATEGY_ID };
  }

  return { OR: or };
}

export async function canAccessStrategy(
  strategyId: string,
  actor: StrategyActor,
): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  if (!strategyId) return false;
  if (!strategyAssignmentFieldsAvailable) return false;

  const prismaAny = prisma as unknown as Record<string, any>;

  try {
    const row = await prismaAny.strategy.findFirst({
      where: {
        id: strategyId,
        ...buildStrategyAccessWhere(actor),
      },
      select: { id: true },
    });

    return Boolean(row);
  } catch (error) {
    if (isStrategyAssignmentFieldsMissingError(error)) {
      markStrategyAssignmentFieldsUnavailable();
      return false;
    }
    throw error;
  }
}

export async function requireStrategyAccess(
  strategyId: string,
  actor: StrategyActor,
): Promise<void> {
  const ok = await canAccessStrategy(strategyId, actor);
  if (!ok) {
    throw new Error('StrategyAccessDenied');
  }
}

export async function listAllowedXPlanAssigneesWithCookie(
  cookieHeader: string | null,
): Promise<AllowedAssignee[]> {
  if (process.env.PORTAL_DB_URL) {
    const authPrisma = getPortalAuthPrisma();
    const users = await authPrisma.user.findMany({
      where: {
        isActive: true,
        appAccess: {
          some: {
            app: { slug: 'xplan' },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { email: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    }));
  }

  if (!cookieHeader) {
    return [];
  }

  try {
    const url = buildPortalUrl('/api/v1/directory/xplan-assignees');
    const response = await fetch(url, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as { assignees?: unknown } | null;
    if (!response.ok) {
      return [];
    }
    if (!Array.isArray(data?.assignees)) {
      return [];
    }

    return data.assignees
      .filter(
        (assignee): assignee is Record<string, unknown> =>
          Boolean(assignee) && typeof assignee === 'object',
      )
      .filter((record) => typeof record.id === 'string' && typeof record.email === 'string')
      .map((record) => ({
        id: record.id as string,
        email: record.email as string,
        fullName: typeof record.fullName === 'string' ? record.fullName : null,
      }));
  } catch {
    return [];
  }
}

export async function resolveAllowedXPlanAssigneeByIdWithCookie(
  id: string,
  cookieHeader: string | null,
): Promise<AllowedAssignee | null> {
  if (!id) return null;

  if (process.env.PORTAL_DB_URL) {
    const authPrisma = getPortalAuthPrisma();
    const user = await authPrisma.user.findFirst({
      where: {
        id,
        isActive: true,
        appAccess: {
          some: {
            app: { slug: 'xplan' },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    };
  }

  const assignees = await listAllowedXPlanAssigneesWithCookie(cookieHeader);
  return assignees.find((assignee) => assignee.id === id) ?? null;
}
