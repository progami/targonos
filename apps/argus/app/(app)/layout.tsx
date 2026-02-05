import { redirect } from 'next/navigation';
import { getAppEntitlement } from '@targon/auth';
import { auth } from '@/lib/auth';
import { ArgusShell } from '@/components/argus-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const roles = (session as any)?.roles;
  const entitlement = session ? getAppEntitlement(roles, 'argus') : null;
  if (!session || !entitlement) {
    redirect('/no-access');
  }

  return <ArgusShell>{children}</ArgusShell>;
}

