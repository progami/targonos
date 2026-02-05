import { redirect } from 'next/navigation';
import { hasCapability } from '@targon/auth';
import { auth } from '@/lib/auth';
import { ArgusShell } from '@/components/argus-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const canEnter = hasCapability({ session, appId: 'argus', capability: 'enter' });
  if (!session || !canEnter) {
    redirect('/no-access');
  }

  return <ArgusShell>{children}</ArgusShell>;
}
