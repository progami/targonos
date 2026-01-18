import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth, RATE_LIMIT_PRESETS } from '@/lib/api/auth';
import {
  areStrategyAssignmentFieldsAvailable,
  buildStrategyAccessWhere,
  getStrategyActor,
  isStrategyAssignmentFieldsMissingError,
  markStrategyAssignmentFieldsUnavailable,
  resolveAllowedXPlanAssigneeByIdWithCookie,
} from '@/lib/strategy-access';

const EXPENSIVE_RATE_LIMIT = RATE_LIMIT_PRESETS.expensive;

// Type assertion for strategy model (Prisma types are generated but not resolved correctly at build time)
const prismaAny = prisma as unknown as Record<string, any>;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  region: z.enum(['US', 'UK']).optional(),
  assigneeId: z.string().min(1).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  region: z.enum(['US', 'UK']).optional(),
  assigneeId: z.string().min(1).optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

const countsSelect = {
  products: true,
  purchaseOrders: true,
  salesWeeks: true,
};

const listSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  region: true,
  isDefault: true,
  createdById: true,
  createdByEmail: true,
  assigneeId: true,
  assigneeEmail: true,
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
  createdById: true,
  createdByEmail: true,
  assigneeId: true,
  assigneeEmail: true,
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

export const GET = withXPlanAuth(async (_request, session) => {
  const actor = getStrategyActor(session);
  const orderBy = [{ updatedAt: 'desc' }];

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

  return NextResponse.json({ strategies });
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

  const requestedAssigneeId = parsed.data.assigneeId ?? actor.id;
  let assigneeEmail = actor.email;

  if (requestedAssigneeId !== actor.id) {
    const allowed = await resolveAllowedXPlanAssigneeByIdWithCookie(
      requestedAssigneeId,
      cookieHeader,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Assignee must be an allowed X-Plan user' },
        { status: 400 },
      );
    }
    assigneeEmail = allowed.email.trim().toLowerCase();
  }

  let strategy: any;
  try {
    strategy = await prismaAny.strategy.create({
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim(),
        region: parsed.data.region ?? 'US',
        isDefault: false,
        status: 'DRAFT',
        createdById: actor.id,
        createdByEmail: actor.email,
        assigneeId: requestedAssigneeId,
        assigneeEmail,
      },
      select: writeSelect,
    });
  } catch (error) {
    if (!isStrategyAssignmentFieldsMissingError(error)) {
      throw error;
    }
    markStrategyAssignmentFieldsUnavailable();
    return strategyAccessUnavailableResponse();
  }

  return NextResponse.json({ strategy });
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
  const { assigneeId: requestedAssigneeId, ...strategyUpdates } = data;

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
        isDefault: true,
        createdById: true,
        createdByEmail: true,
        assigneeId: true,
        assigneeEmail: true,
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

  const actorCanAccess =
    actor.isSuperAdmin ||
    (actor.id != null && (existing.createdById === actor.id || existing.assigneeId === actor.id)) ||
    (actor.email != null &&
      (existing.createdByEmail === actor.email || existing.assigneeEmail === actor.email));

  if (!actorCanAccess) {
    return NextResponse.json({ error: 'No access to strategy' }, { status: 403 });
  }

  let resolvedAssigneeId: string | undefined;
  let resolvedAssigneeEmail: string | undefined;

  if (requestedAssigneeId) {
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

    const allowed = await resolveAllowedXPlanAssigneeByIdWithCookie(
      requestedAssigneeId,
      cookieHeader,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Assignee must be an allowed X-Plan user' },
        { status: 400 },
      );
    }

    resolvedAssigneeId = allowed.id;
    resolvedAssigneeEmail = allowed.email.trim().toLowerCase();
  }

  // If setting this as ACTIVE, set others to DRAFT
  if (strategyUpdates.status === 'ACTIVE') {
    await prismaAny.strategy.updateMany({
      where: { status: 'ACTIVE', id: { not: id } },
      data: { status: 'DRAFT' },
    });
  }

  const updateData: Record<string, unknown> = {
    ...(strategyUpdates.name && { name: strategyUpdates.name.trim() }),
    ...(strategyUpdates.description !== undefined && {
      description: strategyUpdates.description?.trim(),
    }),
    ...(strategyUpdates.status && { status: strategyUpdates.status }),
    ...(strategyUpdates.region && { region: strategyUpdates.region }),
    ...(resolvedAssigneeId && { assigneeId: resolvedAssigneeId }),
    ...(resolvedAssigneeEmail && { assigneeEmail: resolvedAssigneeEmail }),
  };

  const strategy = await prismaAny.strategy.update({
    where: { id },
    data: updateData,
    select: writeSelect,
  });

  return NextResponse.json({ strategy });
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
        isDefault: true,
        createdById: true,
        createdByEmail: true,
        assigneeId: true,
        assigneeEmail: true,
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

  const actorCanAccess =
    actor.isSuperAdmin ||
    (actor.id != null && (existing.createdById === actor.id || existing.assigneeId === actor.id)) ||
    (actor.email != null &&
      (existing.createdByEmail === actor.email || existing.assigneeEmail === actor.email));

  if (!actorCanAccess) {
    return NextResponse.json({ error: 'No access to strategy' }, { status: 403 });
  }

  if (existing.isDefault) {
    return NextResponse.json({ error: 'Default strategy cannot be deleted' }, { status: 400 });
  }

  // Avoid runtime crashes caused by legacy DB constraints lacking cascades.
  await prismaAny.$transaction(async (tx: any) => {
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
  });

  return NextResponse.json({ ok: true });
}, { rateLimit: EXPENSIVE_RATE_LIMIT });
