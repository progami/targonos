import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalAuthPrisma } from '@targon/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const apps = (session.user as unknown as { apps?: unknown }).apps;
  const appList = Array.isArray(apps) ? apps : [];
  if (!appList.includes('xplan')) {
    return NextResponse.json({ error: 'No access to xplan directory' }, { status: 403 });
  }

  const prisma = getPortalAuthPrisma();
  const users = await prisma.user.findMany({
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

  const assignees = users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
  }));

  return NextResponse.json({ assignees });
}
