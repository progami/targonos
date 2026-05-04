import ChangeTimeline from '@/components/wpr/change-timeline';
import type { ArgusMarket } from '@/lib/argus-market';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';

export default function ChangelogTab({
  entries,
  selectedWeek,
  weeks,
  weekStartDates,
  onSelectWeek,
  market,
}: {
  entries: WprChangeLogEntry[];
  selectedWeek: WeekLabel;
  weeks: WeekLabel[];
  weekStartDates: Record<WeekLabel, string>;
  onSelectWeek: (week: WeekLabel) => void;
  market: ArgusMarket;
}) {
  return (
    <ChangeTimeline
      entries={entries}
      selectedWeek={selectedWeek}
      weeks={weeks}
      weekStartDates={weekStartDates}
      onSelectWeek={onSelectWeek}
      market={market}
    />
  );
}
