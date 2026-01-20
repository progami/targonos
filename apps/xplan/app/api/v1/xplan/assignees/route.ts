import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { listAllowedXPlanAssigneesWithCookie } from '@/lib/strategy-access';

export const GET = withXPlanAuth(async (_request, session) => {
  const cookieHeader = _request.headers.get('cookie');
  const assignees = await listAllowedXPlanAssigneesWithCookie(cookieHeader);
  if (assignees.length > 0) {
    return NextResponse.json({ assignees, directoryConfigured: true });
  }

  const user = session.user as unknown as { id?: unknown; email?: unknown; name?: unknown };
  const fallbackId = typeof user.id === 'string' ? user.id : null;
  const fallbackEmail = typeof user.email === 'string' ? user.email : null;
  const fallbackName = typeof user.name === 'string' ? user.name : null;

  return NextResponse.json({
    assignees:
      fallbackId && fallbackEmail
        ? [{ id: fallbackId, email: fallbackEmail, fullName: fallbackName }]
        : [],
    directoryConfigured: false,
  });
});
