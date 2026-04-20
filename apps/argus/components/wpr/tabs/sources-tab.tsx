import SourceHeatmap from '@/components/wpr/source-heatmap';
import type { WprPayload } from '@/lib/wpr/types';

export default function SourcesTab({ payload }: { payload: WprPayload }) {
  return <SourceHeatmap overview={payload.sourceOverview} />;
}
