import { redirect } from 'next/navigation';
import { getLegacyWprRedirect } from '@/lib/wpr/dashboard-state';

export default function WprComparePage() {
  redirect(getLegacyWprRedirect('/wpr/compare'));
}
