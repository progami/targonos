import Link from 'next/link';
import { TargetFormClient } from '@/components/TargetFormClient';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function NewTargetPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Link>
        </Button>
      </div>
      <PageHeader title="New Target" subtitle="Create a new monitoring target." />
      <TargetFormClient mode="create" />
    </div>
  );
}
