import { redirect } from 'next/navigation';
import { getLegacyWprRedirect } from '@/lib/wpr/dashboard-state';

export default function WprChangelogPage() {
  redirect(getLegacyWprRedirect('/wpr/changelog'));
}
