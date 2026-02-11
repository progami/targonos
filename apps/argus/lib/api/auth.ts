import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { hasCapability } from '@targon/auth';

import { auth } from '@/lib/auth';

export type ArgusAuthedHandler<TContext = unknown> = (
  request: Request,
  session: Session,
  context: TContext,
) => Promise<Response>;

export function withArgusAuth<TContext = unknown>(handler: ArgusAuthedHandler<TContext>) {
  return async (request: Request, context: TContext) => {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const canEnter = hasCapability({ session, appId: 'argus', capability: 'enter' });
    if (!canEnter) {
      return NextResponse.json({ error: 'No access to Argus' }, { status: 403 });
    }

    return handler(request, session, context);
  };
}
