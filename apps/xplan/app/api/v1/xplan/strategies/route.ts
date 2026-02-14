import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth, RATE_LIMIT_PRESETS } from '@/lib/api/auth';
import { buildAuditRequestMeta, emitAuditEvent } from '@/lib/audit-log';
import {
  areStrategyAssignmentFieldsAvailable,
  buildStrategyAccessWhere,
  getStrategyActor,
  isStrategyAssignmentFieldsMissingError,
  markStrategyAssignmentFieldsUnavailable,
  resolveAllowedXPlanAssigneeByIdWithCookie,
} from '@/lib/strategy-access';

const EXPENSIVE_RATE_LIMIT = RATE_LIMIT_PRESETS.expensive;

const prismaAny = prisma as unknown as Record<string, any>;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  region: z.enum(['US', 'UK']).optional(),
  strategyGroupId: z.string().min(1).optional(),
  strategyGroupCode: z.string().min(1).max(64).optional(),
  strategyGroupName: z.string().min(1).max(120).optional(),
  isPrimary: z.boolean().optional(),
  assigneeId: z.string().min(1).optional(),
  assigneeIds: z.array(z.string().min(1)).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  isPrimary: z.boolean().optional(),
  assigneeId: z.string().min(1).optional(),
  assigneeIds: z.array(z.string().min(1)).optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

const countsSelect = {
  products: true,
  purchaseOrders: true,
  salesWeeks: true,
};

const assigneeRelationSelect = {
  id: true,
  assigneeId: true,
  assigneeEmail: true,
};

const strategyGroupSelect = {
  id: true,
  code: true,
  name: true,
  region: true,
  createdById: true,
  createdByEmail: true,
  assigneeId: true,
  assigneeEmail: true,
  createdAt: true,
  updatedAt: true,
};

const listSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  region: true,
  isDefault: true,
  isPrimary: true,
  strategyGroupId: true,
  strategyGroup: { select: strategyGroupSelect },
  createdById: true,
  createdByEmail: true,
  assigneeId: true,
  assigneeEmail: true,
  strategyAssignees: {
    select: assigneeRelationSelect,
    orderBy: { assigneeEmail: 'asc' },
  },
  createdAt: true,
  updatedAt: true,
  _count: { select: countsSelect },
};

const legacyListSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  region: true,
  isDefault: true,
  isPrimary: true,
  strategyGroupId: true,
  strategyGroup: { select: strategyGroupSelect },
  createdAt: true,
  updatedAt: true,
  _count: { select: countsSelect },
};

const writeSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  region: true,
  isDefault: true,
  isPrimary: true,
  strategyGroupId: true,
  strategyGroup: { select: strategyGroupSelect },
  createdById: true,
  createdByEmail: true,
  assigneeId: true,
  assigneeEmail: true,
  strategyAssignees: {
    select: assigneeRelationSelect,
    orderBy: { assigneeEmail: 'asc' },
  },
  createdAt: true,
  updatedAt: true,
};

function strategyAccessUnavailableResponse() {
  return NextResponse.json(
    {
      error: 'Strategy access control is unavailable. Please contact an administrator.',
    },
    { status: 503 },
  );
}

type StrategyActor = ReturnType<typeof getStrategyActor>;

function normalizeAssigneeIds(input: string | string[] | undefined): string[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const id = value.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function normalizeStrategyGroupCode(raw: string) {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  if (!normalized) {
    throw new Error('StrategyGroupCodeInvalid');
  }

  return normalized;
}

async function resolveStrategyAssigneesByIds(
  assigneeIds: string[],
  actor: StrategyActor,
  cookieHeader: string | null,
) {
  const resolved: Array<{ id: string; email: string }> = [];
  const seen = new Set<string>();

  for (const assigneeId of assigneeIds) {
    if (seen.has(assigneeId)) {
      continue;
    }
    seen.add(assigneeId);

    if (actor.id === assigneeId && actor.email) {
      resolved.push({ id: actor.id, email: actor.email });
      continue;
    }

    const allowed = await resolveAllowedXPlanAssigneeByIdWithCookie(assigneeId, cookieHeader);
    if (!allowed) {
      return { error: 'Assignee must be an allowed X-Plan user' as const };
    }

    resolved.push({
      id: allowed.id,
      email: allowed.email.trim().toLowerCase(),
    });
  }

  return { assignees: resolved };
}

function canActorAccessStrategy(existing: any, actor: StrategyActor): boolean {
  if (actor.isSuperAdmin) {
    return true;
  }

  if (actor.id) {
    if (existing.createdById === actor.id || existing.assigneeId === actor.id) {
      return true;
    }
    if (
      Array.isArray(existing.strategyAssignees) &&
      existing.strategyAssignees.some((entry: any) => entry.assigneeId === actor.id)
    ) {
      return true;
    }
  }

  if (actor.email) {
    if (existing.createdByEmail === actor.email || existing.assigneeEmail === actor.email) {
      return true;
    }
    if (
      Array.isArray(existing.strategyAssignees) &&
      existing.strategyAssignees.some((entry: any) => entry.assigneeEmail === actor.email)
    ) {
      return true;
    }
  }

  return false;
}

function buildStrategyGroups(strategies: any[]) {
  const groups = new Map<string, any>();

  for (const strategy of strategies) {
    const group = strategy.strategyGroup;
    if (!group) continue;

    const existing = groups.get(group.id);
    if (existing) {
      existing.strategies.push(strategy);
      continue;
    }

    groups.set(group.id, {
      ...group,
      strategies: [strategy],
    });
  }

  const result = Array.from(groups.values()).map((group) => ({
    ...group,
    strategies: [...group.strategies].sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }),
  }));

  return result.sort((left, right) => {
    if (left.region !== right.region) {
      return left.region.localeCompare(right.region);
    }
    return left.name.localeCompare(right.name);
  });
}

function uniqueViolationResponse(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code !== 'P2002') return null;

  const errorMeta = (error as Prisma.PrismaClientKnownRequestError & { meta?: unknown }).meta as
    | { target?: unknown }
    | undefined;

  const target = Array.isArray(errorMeta?.target)
    ? errorMeta.target.map(String).join(',')
    : String(errorMeta?.target ?? '');

  if (target.includes('StrategyGroup_region_code_key')) {
    return NextResponse.json(
      { error: 'A strategy group with this code already exists in this region' },
      { status: 409 },
    );
  }

  if (target.includes('Strategy_strategyGroupId_name_key')) {
    return NextResponse.json(
      { error: 'A scenario with this name already exists in this strategy group' },
      { status: 409 },
    );
  }

  if (target.includes('Strategy_primary_per_group_key')) {
    return NextResponse.json(
      { error: 'This strategy group already has a primary scenario' },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: 'Unique constraint violation' }, { status: 409 });
}

export const GET = withXPlanAuth(async (_request, session) => {
  const actor = getStrategyActor(session);
  const orderBy = [{ isPrimary: 'desc' }, { updatedAt: 'desc' }];

  let strategies: any[];
  if (areStrategyAssignmentFieldsAvailable()) {
    try {
      strategies = await prismaAny.strategy.findMany({
        where: buildStrategyAccessWhere(actor),
        orderBy,
        select: listSelect,
      });
    } catch (error) {
      if (!isStrategyAssignmentFieldsMissingError(error)) {
        throw error;
      }
      markStrategyAssignmentFieldsUnavailable();
      strategies = await prismaAny.strategy.findMany({
        where: buildStrategyAccessWhere(actor),
        orderBy,
        select: legacyListSelect,
      });
    }
  } else {
    strategies = await prismaAny.strategy.findMany({
      where: buildStrategyAccessWhere(actor),
      orderBy,
      select: legacyListSelect,
    });
  }

  const strategyGroups = buildStrategyGroups(strategies);

  return NextResponse.json({ strategies, strategyGroups });
});

export const POST = withXPlanAuth(async (request: Request, session) => {
  const cookieHeader = request.headers.get('cookie');
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const actor = getStrategyActor(session);
  if (!actor.id || !actor.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!areStrategyAssignmentFieldsAvailable()) {
    return strategyAccessUnavailableResponse();
  }

  const requestedAssigneeIds = normalizeAssigneeIds(
    parsed.data.assigneeIds ?? parsed.data.assigneeId ?? actor.id,
  );
  const resolvedAssigneesResult = await resolveStrategyAssigneesByIds(
    requestedAssigneeIds,
    actor,
    cookieHeader,
  );
  if ('error' in resolvedAssigneesResult) {
    return NextResponse.json({ error: resolvedAssigneesResult.error }, { status: 400 });
  }

  const resolvedAssignees = resolvedAssigneesResult.assignees;
  const primaryAssignee = resolvedAssignees[0] ?? null;

  try {
    const result = await prismaAny.$transaction(async (tx: any) => {
      let group: any = null;

      if (parsed.data.strategyGroupId) {
        group = await tx.strategyGroup.findUnique({
          where: { id: parsed.data.strategyGroupId },
          select: strategyGroupSelect,
        });

        if (!group) {
          throw new Error('StrategyGroupNotFound');
        }

        if (!actor.isSuperAdmin) {
          const canAccessGroup = await tx.strategy.findFirst({
            where: {
              strategyGroupId: group.id,
              ...buildStrategyAccessWhere(actor),
            },
            select: { id: true },
          });
          if (!canAccessGroup) {
            throw new Error('StrategyGroupAccessDenied');
          }
        }
      } else {
        const groupName = parsed.data.strategyGroupName?.trim();
        const groupCodeRaw = parsed.data.strategyGroupCode?.trim();

        if (!groupName || !groupCodeRaw) {
          throw new Error('StrategyGroupRequired');
        }

        const groupCode = normalizeStrategyGroupCode(groupCodeRaw);

        group = await tx.strategyGroup.create({
          data: {
            code: groupCode,
            name: groupName,
            region: parsed.data.region ?? 'US',
            createdById: actor.id,
            createdByEmail: actor.email,
            assigneeId: primaryAssignee?.id ?? null,
            assigneeEmail: primaryAssignee?.email ?? null,
          },
          select: strategyGroupSelect,
        });
      }

      const existingScenarioCount = await tx.strategy.count({
        where: { strategyGroupId: group.id },
      });

      const shouldBePrimary = parsed.data.isPrimary === true || existingScenarioCount === 0;

      if (shouldBePrimary) {
        await tx.strategy.updateMany({
          where: { strategyGroupId: group.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const desiredStatus = parsed.data.status ?? 'DRAFT';
      if (desiredStatus === 'ACTIVE') {
        await tx.strategy.updateMany({
          where: { strategyGroupId: group.id, status: 'ACTIVE' },
          data: { status: 'DRAFT' },
        });
      }

      const strategy = await tx.strategy.create({
        data: {
          name: parsed.data.name.trim(),
          description: parsed.data.description?.trim(),
          status: desiredStatus,
          region: group.region,
          isDefault: false,
          isPrimary: shouldBePrimary,
          strategyGroupId: group.id,
          createdById: actor.id,
          createdByEmail: actor.email,
          assigneeId: primaryAssignee?.id ?? null,
          assigneeEmail: primaryAssignee?.email ?? null,
          strategyAssignees: {
            create: resolvedAssignees.map((assignee) => ({
              assigneeId: assignee.id,
              assigneeEmail: assignee.email,
            })),
          },
        },
        select: writeSelect,
      });

      return { strategy, group };
    });

    emitAuditEvent({
      event: 'xplan.strategy.create',
      actor,
      strategy: {
        id: result.strategy.id,
        name: result.strategy.name,
        region: result.strategy.region,
        isDefault: result.strategy.isDefault,
        isPrimary: result.strategy.isPrimary,
        strategyGroupId: result.strategy.strategyGroupId,
        strategyGroupCode: result.strategy.strategyGroup?.code,
        strategyGroupName: result.strategy.strategyGroup?.name,
        createdByEmail: result.strategy.createdByEmail,
        assigneeEmail: result.strategy.assigneeEmail,
        assigneeEmails: Array.isArray(result.strategy.strategyAssignees)
          ? result.strategy.strategyAssignees.map((entry: any) => entry.assigneeEmail)
          : [],
      },
      request: buildAuditRequestMeta(request),
    });

    return NextResponse.json({ strategy: result.strategy, strategyGroup: result.group });
  } catch (error) {
    const uniqueResponse = uniqueViolationResponse(error);
    if (uniqueResponse) {
      return uniqueResponse;
    }

    if (error instanceof Error) {
      if (error.message === 'StrategyGroupNotFound') {
        return NextResponse.json({ error: 'Strategy group not found' }, { status: 404 });
      }
      if (error.message === 'StrategyGroupAccessDenied') {
        return NextResponse.json({ error: 'No access to strategy group' }, { status: 403 });
      }
      if (error.message === 'StrategyGroupRequired') {
        return NextResponse.json(
          { error: 'strategyGroupName and strategyGroupCode are required for a new group' },
          { status: 400 },
        );
      }
      if (error.message === 'StrategyGroupCodeInvalid') {
        return NextResponse.json({ error: 'Invalid strategy group code' }, { status: 400 });
      }
    }

    throw error;
  }
});

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const cookieHeader = request.headers.get('cookie');
  const body = await request.json().catch(() => null);

  if (body && typeof body === 'object' && 'isDefault' in body) {
    return NextResponse.json({ error: 'Default strategy cannot be changed' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id, ...data } = parsed.data;
  const { assigneeId, assigneeIds, ...strategyUpdates } = data;
  const shouldUpdateAssignees =
    Boolean(body) && typeof body === 'object' && ('assigneeId' in body || 'assigneeIds' in body);
  const hasPrimaryFlag =
    Boolean(body) && typeof body === 'object' && 'isPrimary' in body;

  const actor = getStrategyActor(session);

  if (!areStrategyAssignmentFieldsAvailable()) {
    return strategyAccessUnavailableResponse();
  }

  let existing: any;
  try {
    existing = await prismaAny.strategy.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        region: true,
        isDefault: true,
        isPrimary: true,
        strategyGroupId: true,
        createdById: true,
        createdByEmail: true,
        assigneeId: true,
        assigneeEmail: true,
        strategyGroup: { select: strategyGroupSelect },
        strategyAssignees: {
          select: assigneeRelationSelect,
        },
      },
    });
  } catch (error) {
    if (!isStrategyAssignmentFieldsMissingError(error)) {
      throw error;
    }
    markStrategyAssignmentFieldsUnavailable();
    return strategyAccessUnavailableResponse();
  }

  if (!existing) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  if (!canActorAccessStrategy(existing, actor)) {
    return NextResponse.json({ error: 'No access to strategy' }, { status: 403 });
  }

  if (hasPrimaryFlag && strategyUpdates.isPrimary === false) {
    return NextResponse.json(
      { error: 'A scenario cannot be explicitly demoted without promoting another scenario' },
      { status: 400 },
    );
  }

  let resolvedAssignees: Array<{ id: string; email: string }> | undefined;

  if (shouldUpdateAssignees) {
    const actorCanAssign =
      actor.isSuperAdmin ||
      (actor.id != null && existing.createdById === actor.id) ||
      (actor.email != null && existing.createdByEmail === actor.email);

    if (!actorCanAssign) {
      return NextResponse.json(
        { error: 'Only the strategy creator can assign an assignee' },
        { status: 403 },
      );
    }

    const requestedAssigneeIds = normalizeAssigneeIds(assigneeIds ?? assigneeId);
    const resolvedAssigneesResult = await resolveStrategyAssigneesByIds(
      requestedAssigneeIds,
      actor,
      cookieHeader,
    );
    if ('error' in resolvedAssigneesResult) {
      return NextResponse.json({ error: resolvedAssigneesResult.error }, { status: 400 });
    }
    resolvedAssignees = resolvedAssigneesResult.assignees;
  }

  const shouldPromotePrimary = hasPrimaryFlag && strategyUpdates.isPrimary === true;

  const updateData: Record<string, unknown> = {
    ...(strategyUpdates.name && { name: strategyUpdates.name.trim() }),
    ...(strategyUpdates.description !== undefined && {
      description: strategyUpdates.description?.trim(),
    }),
    ...(strategyUpdates.status && { status: strategyUpdates.status }),
    ...(shouldPromotePrimary ? { isPrimary: true } : {}),
  };

  if (resolvedAssignees) {
    const primaryAssignee = resolvedAssignees[0] ?? null;
    updateData.assigneeId = primaryAssignee?.id ?? null;
    updateData.assigneeEmail = primaryAssignee?.email ?? null;
    updateData.strategyAssignees = {
      deleteMany: {},
      create: resolvedAssignees.map((assignee) => ({
        assigneeId: assignee.id,
        assigneeEmail: assignee.email,
      })),
    };
  }

  try {
    const strategy = await prismaAny.$transaction(async (tx: any) => {
      if (strategyUpdates.status === 'ACTIVE') {
        await tx.strategy.updateMany({
          where: {
            strategyGroupId: existing.strategyGroupId,
            status: 'ACTIVE',
            id: { not: id },
          },
          data: { status: 'DRAFT' },
        });
      }

      if (shouldPromotePrimary) {
        await tx.strategy.updateMany({
          where: {
            strategyGroupId: existing.strategyGroupId,
            isPrimary: true,
            id: { not: id },
          },
          data: { isPrimary: false },
        });
      }

      return tx.strategy.update({
        where: { id },
        data: updateData,
        select: writeSelect,
      });
    });

    emitAuditEvent({
      event: 'xplan.strategy.update',
      actor,
      strategy: {
        id: strategy.id,
        name: strategy.name,
        region: strategy.region,
        isDefault: strategy.isDefault,
        isPrimary: strategy.isPrimary,
        strategyGroupId: strategy.strategyGroupId,
        strategyGroupCode: strategy.strategyGroup?.code,
        strategyGroupName: strategy.strategyGroup?.name,
        createdByEmail: strategy.createdByEmail,
        assigneeEmail: strategy.assigneeEmail,
        assigneeEmails: Array.isArray(strategy.strategyAssignees)
          ? strategy.strategyAssignees.map((entry: any) => entry.assigneeEmail)
          : [],
      },
      changes: updateData,
      request: buildAuditRequestMeta(request),
    });

    return NextResponse.json({ strategy });
  } catch (error) {
    const uniqueResponse = uniqueViolationResponse(error);
    if (uniqueResponse) {
      return uniqueResponse;
    }

    throw error;
  }
});

export const DELETE = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id } = parsed.data;

  const actor = getStrategyActor(session);

  if (!areStrategyAssignmentFieldsAvailable()) {
    return strategyAccessUnavailableResponse();
  }

  let existing: any;
  try {
    existing = await prismaAny.strategy.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        region: true,
        isDefault: true,
        isPrimary: true,
        strategyGroupId: true,
        createdById: true,
        createdByEmail: true,
        assigneeId: true,
        assigneeEmail: true,
        strategyGroup: { select: strategyGroupSelect },
        strategyAssignees: {
          select: assigneeRelationSelect,
        },
      },
    });
  } catch (error) {
    if (!isStrategyAssignmentFieldsMissingError(error)) {
      throw error;
    }
    markStrategyAssignmentFieldsUnavailable();
    return strategyAccessUnavailableResponse();
  }

  if (!existing) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  if (!canActorAccessStrategy(existing, actor)) {
    return NextResponse.json({ error: 'No access to strategy' }, { status: 403 });
  }

  emitAuditEvent({
    event: 'xplan.strategy.delete',
    actor,
    strategy: {
      id,
      name: existing.name,
      region: existing.region,
      isDefault: existing.isDefault,
      isPrimary: existing.isPrimary,
      strategyGroupId: existing.strategyGroupId,
      strategyGroupCode: existing.strategyGroup?.code,
      strategyGroupName: existing.strategyGroup?.name,
      createdByEmail: existing.createdByEmail,
      assigneeEmail: existing.assigneeEmail,
      assigneeEmails: Array.isArray(existing.strategyAssignees)
        ? existing.strategyAssignees.map((entry: any) => entry.assigneeEmail)
        : [],
    },
    request: buildAuditRequestMeta(request),
  });

  const txResult = await prismaAny.$transaction(async (tx: any) => {
    await tx.batchTableRow.deleteMany({
      where: { purchaseOrder: { strategyId: id } },
    });
    await tx.purchaseOrderPayment.deleteMany({
      where: { purchaseOrder: { strategyId: id } },
    });
    await tx.logisticsEvent.deleteMany({
      where: { purchaseOrder: { strategyId: id } },
    });
    await tx.purchaseOrder.deleteMany({ where: { strategyId: id } });
    await tx.salesWeek.deleteMany({ where: { strategyId: id } });
    await tx.leadTimeOverride.deleteMany({
      where: { product: { strategyId: id } },
    });
    await tx.businessParameter.deleteMany({ where: { strategyId: id } });
    await tx.profitAndLossWeek.deleteMany({ where: { strategyId: id } });
    await tx.cashFlowWeek.deleteMany({ where: { strategyId: id } });
    await tx.monthlySummary.deleteMany({ where: { strategyId: id } });
    await tx.quarterlySummary.deleteMany({ where: { strategyId: id } });
    await tx.product.deleteMany({ where: { strategyId: id } });
    await tx.strategy.delete({ where: { id } });

    const remainingStrategies = await tx.strategy.findMany({
      where: { strategyGroupId: existing.strategyGroupId },
      select: { id: true, isPrimary: true, updatedAt: true },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });

    if (remainingStrategies.length === 0) {
      await tx.strategyGroup.delete({ where: { id: existing.strategyGroupId } });
      return { deletedGroup: true, promotedId: null as string | null };
    }

    const hasPrimary = remainingStrategies.some((strategy: { isPrimary: boolean }) => strategy.isPrimary);
    if (!hasPrimary) {
      const promoted = remainingStrategies[0];
      await tx.strategy.update({
        where: { id: promoted.id },
        data: { isPrimary: true },
      });
      return { deletedGroup: false, promotedId: promoted.id };
    }

    return { deletedGroup: false, promotedId: null as string | null };
  });

  return NextResponse.json({ ok: true, ...txResult });
}, { rateLimit: EXPENSIVE_RATE_LIMIT });
