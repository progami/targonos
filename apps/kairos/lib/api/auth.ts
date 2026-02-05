import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { hasCapability } from '@targon/auth';

import { auth } from '@/lib/auth';

export type KairosAuthedHandler<TContext = unknown> = (
  request: Request,
  session: Session,
  context: TContext,
) => Promise<Response>;

export function withKairosAuth<TContext = unknown>(handler: KairosAuthedHandler<TContext>) {
  return async (request: Request, context: TContext) => {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const canEnter = hasCapability({ session, appId: 'kairos', capability: 'enter' });
    if (!canEnter) {
      return NextResponse.json({ error: 'No access to Kairos' }, { status: 403 });
    }

    return handler(request, session, context);
  };
}
