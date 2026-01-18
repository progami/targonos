import 'server-only';

import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { getStrategyActor, requireStrategyAccess } from '@/lib/strategy-access';

export async function requireXPlanStrategyAccess(
  strategyId: string | null | undefined,
  session: Session,
) {
  const actor = getStrategyActor(session);
  if (!strategyId) {
    return {
      actor,
      response: NextResponse.json({ error: 'strategyId is required' }, { status: 400 }),
    };
  }
  try {
    await requireStrategyAccess(strategyId, actor);
    return { actor, response: null };
  } catch {
    return {
      actor,
      response: NextResponse.json({ error: 'No access to strategy' }, { status: 403 }),
    };
  }
}

export async function requireXPlanStrategiesAccess(
  strategyIds: Array<string | null | undefined>,
  session: Session,
) {
  const actor = getStrategyActor(session);
  const unique = Array.from(
    new Set(
      strategyIds.filter(
        (strategyId): strategyId is string =>
          typeof strategyId === 'string' && strategyId.length > 0,
      ),
    ),
  );

  try {
    await Promise.all(unique.map((strategyId) => requireStrategyAccess(strategyId, actor)));
    return { actor, response: null };
  } catch {
    return {
      actor,
      response: NextResponse.json({ error: 'No access to strategy' }, { status: 403 }),
    };
  }
}
