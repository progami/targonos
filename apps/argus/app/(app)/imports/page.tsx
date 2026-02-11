import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TalosSyncButton } from '@/components/TalosSyncButton';
import { Download, Plus, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const imports = await prisma.importRun.findMany({
    take: 20,
    orderBy: { startedAt: 'desc' },
  });

  const lastSuccess = imports.find((i) => i.status === 'SUCCESS');

  return (
    <div className="space-y-6">
      <PageHeader title="Imports" subtitle="Sync ASIN targets from Talos.">
        <TalosSyncButton />
      </PageHeader>

      {/* Last Sync Stats */}
      {lastSuccess && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Plus className="h-4 w-4 text-success-600" />
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-lg font-semibold tabular-nums">{lastSuccess.createdCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <RefreshCw className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Updated</p>
                <p className="text-lg font-semibold tabular-nums">{lastSuccess.updatedCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p className="text-lg font-semibold tabular-nums">{lastSuccess.skippedCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Import History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Sync History</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {imports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Download className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No imports yet. Run a Talos sync to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 pr-4 font-medium">Updated</th>
                    <th className="pb-2 pr-4 font-medium">Skipped</th>
                    <th className="pb-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-xs">{formatRelativeTime(imp.startedAt)}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={imp.status === 'SUCCESS' ? 'success' : imp.status === 'FAILED' ? 'danger' : 'warning'}
                          className="text-2xs"
                        >
                          {imp.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{imp.createdCount}</td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{imp.updatedCount}</td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{imp.skippedCount}</td>
                      <td className="py-2 text-xs text-danger-600">{imp.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
