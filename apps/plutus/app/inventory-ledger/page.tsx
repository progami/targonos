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

type InventoryLayerRow = {
  id: string;
  internalRef: string;
  marketplace: string;
  sellerSku: string;
  component: string;
  quantity: number;
  amountCents: number;
  currency: string;
  allocationMethod: string;
  receiptDate: Date | null;
};

const tableWrapSx = {
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

async function getInventoryLayers(): Promise<InventoryLayerRow[]> {
  return db.$queryRawUnsafe<InventoryLayerRow[]>(`
    SELECT
      layer."id",
      po."internalRef",
      layer."marketplace",
      layer."sellerSku",
      layer."component",
      layer."quantity",
      layer."amountCents",
      layer."currency",
      layer."allocationMethod",
      layer."receiptDate"
    FROM "PoCostLayer" layer
    INNER JOIN "PurchaseOrder" po ON po."id" = layer."purchaseOrderId"
    ORDER BY po."internalRef" ASC, layer."sellerSku" ASC, layer."component" ASC
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
      <PageHeader title="Inventory Ledger" kicker="Exact PO/SKU layers" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell>PO</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Component</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Allocation</TableCell>
                <TableCell>Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title="No exact cost layers"
                      description="Locked QBO PO and bill evidence will appear here as PO/SKU cost layers."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.internalRef}</Typography>
                  </TableCell>
                  <TableCell>{row.sellerSku}</TableCell>
                  <TableCell>{row.component}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell align="right">{row.quantity.toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{formatCents(row.amountCents, row.currency)}</TableCell>
                  <TableCell>{row.allocationMethod}</TableCell>
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
