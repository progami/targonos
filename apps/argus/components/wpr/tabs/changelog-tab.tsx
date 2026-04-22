import ChangeTimeline from '@/components/wpr/change-timeline';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';

export default function ChangelogTab({
  entries,
  selectedWeek,
  weeks,
  weekStartDates,
  onSelectWeek,
}: {
  entries: WprChangeLogEntry[];
  selectedWeek: WeekLabel;
  weeks: WeekLabel[];
  weekStartDates: Record<WeekLabel, string>;
  onSelectWeek: (week: WeekLabel) => void;
}) {
  return (
    <ChangeTimeline
      entries={entries}
      selectedWeek={selectedWeek}
      weeks={weeks}
      weekStartDates={weekStartDates}
      onSelectWeek={onSelectWeek}
    />
  );
}
