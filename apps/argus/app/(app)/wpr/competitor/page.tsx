import { redirect } from 'next/navigation';
import { getLegacyWprRedirect } from '@/lib/wpr/dashboard-state';

export default function WprCompetitorPage() {
  redirect(getLegacyWprRedirect('/wpr/competitor'));
}
