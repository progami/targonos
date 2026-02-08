import { NextResponse } from 'next/server';
import { getPortalAuthPrisma } from '@targon/auth/server';

export async function GET() {
  const prisma = getPortalAuthPrisma();

  const app = await prisma.app.findUnique({
    where: { slug: 'plutus' },
    select: { id: true },
  });

  if (!app) {
    return NextResponse.json({ users: [] });
  }

  const userApps = await prisma.userApp.findMany({
    where: { appId: app.id },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
  });

  const users = userApps
    .filter((ua: { user: { isActive: boolean } }) => ua.user.isActive)
    .map((ua: { role: string; user: { id: string; email: string; firstName: string | null; lastName: string | null } }) => ({
      id: ua.user.id,
      email: ua.user.email,
      name: [ua.user.firstName, ua.user.lastName].filter(Boolean).join(' '),
      role: ua.role,
    }));

  return NextResponse.json({ users });
}
