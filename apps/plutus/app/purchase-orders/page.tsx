import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (appBasePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type PurchaseOrderRow = {
  poNumber: string;
  qboPurchaseOrderId: string | null;
  marketplace: string;
  sku: string;
  layerCount: bigint;
  readyLayerCount: bigint;
  qtyReceived: bigint | null;
  remainingQty: bigint | null;
  landedTotalCents: bigint | null;
  remainingValueCents: bigint | null;
  unitCost: number | null;
};

type PurchaseOrderCounts = {
  allocationCount: number;
  cogsPostingCount: number;
};

async function getPurchaseOrderRows(): Promise<PurchaseOrderRow[]> {
  return db.$queryRawUnsafe<PurchaseOrderRow[]>(`
    SELECT
      "poNumber",
      MIN("qboPurchaseOrderId") AS "qboPurchaseOrderId",
      "marketplace",
      "sku",
      COUNT("id") AS "layerCount",
      COUNT(*) FILTER (WHERE "status" = 'READY') AS "readyLayerCount",
      COALESCE(SUM("qtyReceived"), 0) AS "qtyReceived",
      COALESCE(SUM("qtyRemaining"), 0) AS "remainingQty",
      COALESCE(SUM("landedTotalCents"), 0) AS "landedTotalCents",
      COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)), 0) AS "remainingValueCents",
      CASE
        WHEN COALESCE(SUM("qtyReceived"), 0) = 0 THEN NULL
        ELSE (SUM("landedTotalCents")::numeric / 100) / SUM("qtyReceived")
      END AS "unitCost"
    FROM "CostLayer"
    GROUP BY "poNumber", "marketplace", "sku"
    ORDER BY "poNumber" ASC, "sku" ASC
    LIMIT 500
  `);
}

async function getPurchaseOrderCounts(): Promise<PurchaseOrderCounts> {
  const [allocationCount, cogsPostingCount] = await Promise.all([
    db.landedCostAllocation.count(),
    db.settlementPosting.count({ where: { postingType: 'COGS' } }),
  ]);
  return { allocationCount, cogsPostingCount };
}

function formatCents(value: bigint | null): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0n) / 100);
}

export default async function PurchaseOrdersPage() {
  const [rows, counts] = await Promise.all([getPurchaseOrderRows(), getPurchaseOrderCounts()]);

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader
        title="Purchase Orders"
        kicker="PO/SKU cost layers"
        actions={
          <>
            <Button href={`${appBasePath}/landed-cost-allocations`} variant="outlined" size="small">
              Allocations: {counts.allocationCount}
            </Button>
            <Button href={`${appBasePath}/cogs-batches`} variant="outlined" size="small">
              COGS Postings: {counts.cogsPostingCount}
            </Button>
          </>
        }
      />

      <Box sx={{ mt: 2.5, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead>
              <TableRow>
                <TableCell>PO</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>QBO PO</TableCell>
                <TableCell align="right">Qty Received</TableCell>
                <TableCell align="right">Qty Remaining</TableCell>
                <TableCell align="right">Unit Cost</TableCell>
                <TableCell align="right">Landed Total</TableCell>
                <TableCell align="right">Remaining Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <EmptyState title="No purchase-order layers" description="Opening layers and locked native QBO PO/SKU layers appear here." />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={`${row.marketplace}:${row.poNumber}:${row.sku}`}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.poNumber}</Typography>
                  </TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell>
                    <Chip
                      label={Number(row.readyLayerCount) === Number(row.layerCount) ? 'READY' : 'NOT_READY'}
                      size="small"
                      variant="outlined"
                      color={Number(row.readyLayerCount) === Number(row.layerCount) ? 'success' : 'warning'}
                    />
                  </TableCell>
                  <TableCell>{row.qboPurchaseOrderId ?? 'OPENING'}</TableCell>
                  <TableCell align="right">{Number(row.qtyReceived ?? 0n).toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{Number(row.remainingQty ?? 0n).toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{row.unitCost === null ? '-' : Number(row.unitCost).toFixed(6)}</TableCell>
                  <TableCell align="right">{formatCents(row.landedTotalCents)}</TableCell>
                  <TableCell align="right">{formatCents(row.remainingValueCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
