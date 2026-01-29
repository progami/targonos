import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/hermes/page-header";
import { EmptyState } from "@/components/hermes/empty-state";

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Logs" />
      <EmptyState icon={ScrollText} title="No logs yet" />
    </div>
  );
}
