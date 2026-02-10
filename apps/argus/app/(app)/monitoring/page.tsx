import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { MonitoringListClient, type MonitoringListItem } from '@/components/MonitoringListClient';
import { Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MonitoringPage() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      label: string;
      asin: string;
      marketplace: 'US' | 'UK';
      owner: 'OURS' | 'COMPETITOR';
      source: 'TALOS' | 'MANUAL';
      enabled: boolean;
      cadenceMinutes: number;
      lastRunAt: Date | null;
      lastChangeAt: Date | null;
      alertRuleId: string | null;
      alertsEnabled: boolean | null;
    }>
  >`
    SELECT
      t.id,
      t.label,
      t.asin,
      t.marketplace,
      t.owner,
      t.source,
      t.enabled,
      t."cadenceMinutes",
      lr."startedAt" as "lastRunAt",
      lc."startedAt" as "lastChangeAt",
      ar.id as "alertRuleId",
      ar.enabled as "alertsEnabled"
    FROM "WatchTarget" t
    LEFT JOIN LATERAL (
      SELECT r."startedAt"
      FROM "CaptureRun" r
      WHERE r."targetId" = t.id
      ORDER BY r."startedAt" DESC
      LIMIT 1
    ) lr ON true
    LEFT JOIN LATERAL (
      SELECT r."startedAt"
      FROM "CaptureRun" r
      WHERE r."targetId" = t.id AND r."changeSummary" IS NOT NULL AND jsonb_typeof(r."changeSummary") = 'object'
      ORDER BY r."startedAt" DESC
      LIMIT 1
    ) lc ON true
    LEFT JOIN "AlertRule" ar ON ar."targetId" = t.id
    ORDER BY t."updatedAt" DESC
    LIMIT 500;
  `;

  const items: MonitoringListItem[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    asin: r.asin,
    marketplace: r.marketplace,
    owner: r.owner,
    source: r.source,
    enabled: r.enabled,
    cadenceMinutes: r.cadenceMinutes,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    lastChangeAt: r.lastChangeAt ? r.lastChangeAt.toISOString() : null,
    alertRuleId: r.alertRuleId,
    alertsEnabled: Boolean(r.alertsEnabled),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Monitoring" subtitle="ASIN-only listing monitors for ours and competitors.">
        <Button asChild size="sm" variant="outline">
          <Link href="/imports">
            <Download className="mr-1.5 h-4 w-4" />
            Sync Talos now
          </Link>
        </Button>
      </PageHeader>

      <MonitoringListClient items={items} />
    </div>
  );
}
