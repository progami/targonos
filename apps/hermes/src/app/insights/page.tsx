import { InsightsClient } from "@/app/insights/insights-client";
import { connections } from "@/lib/mock-data";

export default function InsightsPage() {
  return <InsightsClient connections={connections} />;
}
