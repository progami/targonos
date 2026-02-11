import { redirect } from 'next/navigation';

import { KairosShell } from '@/components/kairos-shell';
import { auth } from '@/lib/auth';
import { hasCapability } from '@targon/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const canEnter = hasCapability({ session, appId: 'kairos', capability: 'enter' });
  if (!session || !canEnter) {
    redirect('/no-access');
  }

  return <KairosShell>{children}</KairosShell>;
}
