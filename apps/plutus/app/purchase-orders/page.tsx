import Box from '@mui/material/Box';
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

type PurchaseOrderRow = {
  poNumber: string;
  qboPurchaseOrderId: string | null;
  marketplace: string;
  layerCount: bigint;
  readyLayerCount: bigint;
  remainingQty: bigint | null;
  remainingValueCents: bigint | null;
};

async function getPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  return db.$queryRawUnsafe<PurchaseOrderRow[]>(`
    SELECT
      "poNumber",
      MIN("qboPurchaseOrderId") AS "qboPurchaseOrderId",
      "marketplace",
      COUNT("id") AS "layerCount",
      COUNT(*) FILTER (WHERE "status" = 'READY') AS "readyLayerCount",
      COALESCE(SUM("qtyRemaining"), 0) AS "remainingQty",
      COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)), 0) AS "remainingValueCents"
    FROM "CostLayer"
    GROUP BY "poNumber", "marketplace"
    ORDER BY "poNumber" ASC
    LIMIT 500
  `);
}

function formatCents(value: bigint | null): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0n) / 100);
}

export default async function PurchaseOrdersPage() {
  const rows = await getPurchaseOrders();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Purchase Orders" kicker="QBO PO references from locked cost layers" />

      <Box sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>PO</TableCell>
                <TableCell>QBO PO Id</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell align="right">Layers</TableCell>
                <TableCell align="right">Ready</TableCell>
                <TableCell align="right">Qty Remaining</TableCell>
                <TableCell align="right">Remaining Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title="No cost-layer POs" description="Native QBO POs appear here after opening import or operator lock." />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={`${row.marketplace}:${row.poNumber}`}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.poNumber}</Typography>
                  </TableCell>
                  <TableCell>{row.qboPurchaseOrderId ?? '-'}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell align="right">{Number(row.layerCount)}</TableCell>
                  <TableCell align="right">{Number(row.readyLayerCount)}</TableCell>
                  <TableCell align="right">{Number(row.remainingQty ?? 0n).toLocaleString('en-US')}</TableCell>
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
