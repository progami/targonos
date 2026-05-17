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

type SellerboardExportRow = {
  marketplace: string;
  sku: string;
  poNumber: string;
  qtyConsumed: number;
  unitCost: number;
  cogsAmountCents: number;
  currency: string;
};

async function getSellerboardExports(): Promise<SellerboardExportRow[]> {
  return db.$queryRawUnsafe<SellerboardExportRow[]>(`
    SELECT
      "marketplace",
      "sku",
      "poNumber",
      SUM("qtyConsumed")::integer AS "qtyConsumed",
      "unitCost",
      SUM("cogsAmountCents")::integer AS "cogsAmountCents",
      "currency"
    FROM "CogsConsumption"
    GROUP BY "marketplace", "sku", "poNumber", "unitCost", "currency"
    ORDER BY "poNumber" ASC, "sku" ASC, "marketplace" ASC
    LIMIT 1000
  `);
}

function formatCents(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

export default async function SellerboardExportPage() {
  const rows = await getSellerboardExports();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Sellerboard Export" kicker="PO/SKU COGS totals for Sellerboard" />

      <Box sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell>PO</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell align="right">Qty Sold</TableCell>
                <TableCell align="right">Unit Cost</TableCell>
                <TableCell align="right">COGS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState title="No Sellerboard COGS rows" description="Posted FIFO COGS consumptions are grouped by PO and SKU here." />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={`${row.marketplace}:${row.poNumber}:${row.sku}:${row.unitCost}`}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.poNumber}</Typography>
                  </TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell align="right">{row.qtyConsumed.toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{Number(row.unitCost).toFixed(2)}</TableCell>
                  <TableCell align="right">{formatCents(row.cogsAmountCents, row.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
