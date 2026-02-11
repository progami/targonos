import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit, validateBody, safeErrorResponse } from '@/lib/api-helpers';
import { getCurrentEmployeeId } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { isHROrAbove, isManagerOf } from '@/lib/permissions';

const TaskStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
const TaskCategoryEnum = z.enum(['GENERAL', 'CASE', 'POLICY']);

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).trim().optional().nullable(),
  actionUrl: z.string().max(2000).trim().optional().nullable(),
  category: TaskCategoryEnum.optional(),
  dueDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid dueDate' })
    .optional()
    .nullable(),
  assignedToId: z.string().min(1).max(100).optional().nullable(),
  subjectEmployeeId: z.string().min(1).max(100).optional().nullable(),
  caseId: z.string().min(1).max(100).optional().nullable(),
});

export async function GET(req: Request) {
  const rateLimitError = withRateLimit(req);
  if (rateLimitError) return rateLimitError;

  try {
    const currentEmployeeId = await getCurrentEmployeeId();
    if (!currentEmployeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scopeRaw = searchParams.get('scope');
    const takeRaw = searchParams.get('take');
    const skipRaw = searchParams.get('skip');
    const statusRaw = searchParams.get('status');
    const categoryRaw = searchParams.get('category');
    const assignedToId = searchParams.get('assignedToId');
    const subjectEmployeeId = searchParams.get('subjectEmployeeId');
    const caseId = searchParams.get('caseId');

    const take = Math.min(parseInt(takeRaw ?? '50', 10), 100);
    const skip = parseInt(skipRaw ?? '0', 10);

    const isHR = await isHROrAbove(currentEmployeeId);

    const where: any = {};

    const scope = scopeRaw?.toLowerCase() === 'all' ? 'all' : 'mine';

    if (scope === 'all' && !isHR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (scope === 'mine') {
      where.OR = [
        { createdById: currentEmployeeId },
        { assignedToId: currentEmployeeId },
        { subjectEmployeeId: currentEmployeeId },
      ];
    }

    if (assignedToId) where.assignedToId = assignedToId;
    if (subjectEmployeeId) where.subjectEmployeeId = subjectEmployeeId;
    if (caseId) where.caseId = caseId;

    if (statusRaw) {
      const parsed = TaskStatusEnum.safeParse(statusRaw.toUpperCase());
      if (parsed.success) where.status = parsed.data;
    }

    if (categoryRaw) {
      const parsed = TaskCategoryEnum.safeParse(categoryRaw.toUpperCase());
      if (parsed.success) where.category = parsed.data;
    }

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        take,
        skip,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          subjectEmployee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          case: { select: { id: true, caseNumber: true, title: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({ items, total });
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch tasks');
  }
}

export async function POST(req: Request) {
  const rateLimitError = withRateLimit(req);
  if (rateLimitError) return rateLimitError;

  try {
    const currentEmployeeId = await getCurrentEmployeeId();
    if (!currentEmployeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validation = validateBody(CreateTaskSchema, body);
    if (!validation.success) return validation.error;

    const data = validation.data;

    const isHR = await isHROrAbove(currentEmployeeId);

    if (data.assignedToId && data.assignedToId !== currentEmployeeId && !isHR) {
      const canAssign = await isManagerOf(currentEmployeeId, data.assignedToId);
      if (!canAssign) {
        return NextResponse.json(
          { error: 'Cannot assign tasks outside your reporting line' },
          { status: 403 },
        );
      }
    }

    if (data.subjectEmployeeId && data.subjectEmployeeId !== currentEmployeeId && !isHR) {
      const canTarget = await isManagerOf(currentEmployeeId, data.subjectEmployeeId);
      if (!canTarget) {
        return NextResponse.json(
          { error: 'Cannot create tasks for employees outside your reporting line' },
          { status: 403 },
        );
      }
    }

    if (data.caseId && !isHR) {
      return NextResponse.json({ error: 'Only HR can create case-linked tasks' }, { status: 403 });
    }

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        actionUrl: data.actionUrl ?? null,
        category: data.category ?? 'GENERAL',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdById: currentEmployeeId,
        assignedToId: data.assignedToId ?? null,
        subjectEmployeeId: data.subjectEmployeeId ?? null,
        caseId: data.caseId ?? null,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        subjectEmployee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
      },
    });

    if (task.assignedToId && task.assignedToId !== currentEmployeeId) {
      await prisma.notification.create({
        data: {
          type: 'SYSTEM',
          title: 'New task assigned',
          message: `You have been assigned: "${task.title}".`,
          link: `/tasks/${task.id}`,
          employeeId: task.assignedToId,
          relatedId: task.id,
          relatedType: 'TASK',
        },
      });
    }

    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    return safeErrorResponse(e, 'Failed to create task');
  }
}
