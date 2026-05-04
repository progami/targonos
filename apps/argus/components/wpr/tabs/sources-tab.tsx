import SourceHeatmap from '@/components/wpr/source-heatmap';
import type { WprSourceOverview } from '@/lib/wpr/types';

export default function SourcesTab({ overview }: { overview: WprSourceOverview }) {
  return <SourceHeatmap overview={overview} />;
}
