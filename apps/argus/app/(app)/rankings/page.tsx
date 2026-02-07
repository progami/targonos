import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const targets = await prisma.watchTarget.findMany({
    where: { type: 'SEARCH' },
    orderBy: { updatedAt: 'desc' },
    include: {
      runs: { take: 1, orderBy: { startedAt: 'desc' } },
      _count: { select: { runs: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Rankings" subtitle="Track search keyword positions across marketplaces.">
        <Button asChild size="sm">
          <Link href="/targets/new"><Plus className="mr-1.5 h-4 w-4" />Add Keyword</Link>
        </Button>
      </PageHeader>

      {targets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No keyword targets yet.</p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/targets/new">Add your first keyword</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Keyword</th>
                  <th className="px-4 py-3 font-medium">Marketplace</th>
                  <th className="px-4 py-3 font-medium">Tracked ASINs</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Captures</th>
                  <th className="px-4 py-3 font-medium">Last Checked</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => {
                  const lastRun = t.runs[0];
                  return (
                    <tr key={t.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link href={`/rankings/${t.id}`} className="font-medium text-foreground hover:text-primary">
                          {t.keyword ?? t.label}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.marketplace === 'US' ? 'info' : 'neutral'} className="text-2xs">{t.marketplace}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{t.trackedAsins.length}</td>
                      <td className="px-4 py-3">
                        <Badge variant={t.enabled ? 'success' : 'neutral'} className="text-2xs">{t.enabled ? 'Active' : 'Paused'}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{t._count.runs}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {lastRun ? formatRelativeTime(lastRun.startedAt) : 'Never'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
