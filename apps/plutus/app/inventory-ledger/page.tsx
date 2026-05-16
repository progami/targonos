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

type InventoryLayerRow = {
  id: string;
  poNumber: string;
  marketplace: string;
  sku: string;
  qtyReceived: number;
  qtyRemaining: number;
  landedTotalCents: number;
  unitCost: number;
  currency: string;
  status: string;
  receiptDate: Date | null;
};

async function getInventoryLayers(): Promise<InventoryLayerRow[]> {
  return db.$queryRawUnsafe<InventoryLayerRow[]>(`
    SELECT
      "id",
      "poNumber",
      "marketplace",
      "sku",
      "qtyReceived",
      "qtyRemaining",
      "landedTotalCents",
      "unitCost",
      "currency",
      "status",
      "receiptDate"
    FROM "CostLayer"
    ORDER BY "poNumber" ASC, "sku" ASC, "receiptDate" ASC
    LIMIT 1000
  `);
}

function formatCents(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

function formatDate(value: Date | null): string {
  if (value === null) return '-';
  return value.toISOString().slice(0, 10);
}

export default async function InventoryLedgerPage() {
  const rows = await getInventoryLayers();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Inventory Ledger" kicker="Fresh-start PO/SKU FIFO layers" />

      <Box sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell>PO</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Qty Received</TableCell>
                <TableCell align="right">Qty Remaining</TableCell>
                <TableCell align="right">Landed Total</TableCell>
                <TableCell align="right">Unit Cost</TableCell>
                <TableCell>Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState title="No cost layers" description="Opening layers and locked QBO PO/SKU layers will appear here." />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.poNumber}</Typography>
                  </TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell>
                    <Chip label={row.status} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right">{row.qtyReceived.toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{row.qtyRemaining.toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{formatCents(row.landedTotalCents, row.currency)}</TableCell>
                  <TableCell align="right">{Number(row.unitCost).toFixed(6)}</TableCell>
                  <TableCell>{formatDate(row.receiptDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
