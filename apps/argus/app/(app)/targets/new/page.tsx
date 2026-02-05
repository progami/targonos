import Link from 'next/link';
import { TargetFormClient } from '@/components/TargetFormClient';

export const dynamic = 'force-dynamic';

export default function NewTargetPage() {
  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">New target</h1>
        <Link href="/targets" className="text-sm text-slate-600 hover:underline">
          Back
        </Link>
      </div>

      <div className="mt-4">
        <TargetFormClient mode="create" />
      </div>
    </main>
  );
}

