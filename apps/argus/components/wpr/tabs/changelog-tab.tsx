import ChangeTimeline from '@/components/wpr/change-timeline';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';

export default function ChangelogTab({
  entries,
  selectedWeekLabel,
}: {
  entries: WprChangeLogEntry[];
  selectedWeekLabel: WeekLabel;
}) {
  return <ChangeTimeline entries={entries} selectedWeekLabel={selectedWeekLabel} />;
}
