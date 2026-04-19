import ChangeTimeline from '@/components/wpr/change-timeline';
import type { WprPayload } from '@/lib/wpr/types';

export default function ChangelogTab({ payload }: { payload: WprPayload }) {
  return <ChangeTimeline entriesByWeek={payload.changeLogByWeek} />;
}
