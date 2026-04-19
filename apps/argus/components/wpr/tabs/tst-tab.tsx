import CompetitorDashboard from '@/components/wpr/competitor-dashboard';
import type { WprWeekBundle } from '@/lib/wpr/types';

export default function TstTab({ bundle }: { bundle: WprWeekBundle }) {
  return <CompetitorDashboard bundle={bundle} />;
}
