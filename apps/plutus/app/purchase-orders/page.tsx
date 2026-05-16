import Box from '@mui/material/Box';
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

type PurchaseOrderRow = {
  id: string;
  internalRef: string;
  sourceType: string;
  sourceId: string;
  supplierRef: string | null;
  marketplace: string | null;
  status: string;
  layerCount: bigint;
  layerAmountCents: bigint | null;
};

const tableWrapSx = {
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

async function getPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  return db.$queryRawUnsafe<PurchaseOrderRow[]>(`
    SELECT
      po."id",
      po."internalRef",
      po."sourceType",
      po."sourceId",
      po."supplierRef",
      po."marketplace",
      po."status",
      COUNT(layer."id") AS "layerCount",
      COALESCE(SUM(layer."amountCents"), 0) AS "layerAmountCents"
    FROM "PurchaseOrder" po
    LEFT JOIN "PoCostLayer" layer ON layer."purchaseOrderId" = po."id"
    GROUP BY po."id"
    ORDER BY po."internalRef" ASC
    LIMIT 500
  `);
}

function formatCents(value: bigint | null): string {
  const cents = Number(value ?? 0n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default async function PurchaseOrdersPage() {
  const rows = await getPurchaseOrders();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Purchase Orders" kicker="QBO source docs" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>Internal PO</TableCell>
                <TableCell>Supplier Ref</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell>QBO Source</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Layers</TableCell>
                <TableCell align="right">Layer Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title="No purchase orders synced"
                      description="QBO purchase orders will appear here after the exact cost-layer sync runs."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.internalRef}</Typography>
                  </TableCell>
                  <TableCell>{row.supplierRef ?? '-'}</TableCell>
                  <TableCell>{row.marketplace ?? '-'}</TableCell>
                  <TableCell>
                    {row.sourceType} {row.sourceId}
                  </TableCell>
                  <TableCell>
                    <Chip label={row.status} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">{Number(row.layerCount)}</TableCell>
                  <TableCell align="right">{formatCents(row.layerAmountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
