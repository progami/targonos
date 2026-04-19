import CompareDashboard from '@/components/wpr/compare-dashboard';
import type { WprWeekBundle } from '@/lib/wpr/types';

export default function CompareTab({ bundle }: { bundle: WprWeekBundle }) {
  return <CompareDashboard bundle={bundle} />;
}
