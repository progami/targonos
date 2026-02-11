import { PageHeader } from '@/components/layout/page-header';
import { AttentionClient } from '@/components/AttentionClient';

export const dynamic = 'force-dynamic';

export default function AttentionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Attention"
        subtitle="Work the queue. Acknowledge noise, open what matters, and keep monitoring clean."
      />
      <AttentionClient />
    </div>
  );
}

