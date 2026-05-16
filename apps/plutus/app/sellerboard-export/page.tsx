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
  id: string;
  marketplace: string;
  settlementId: string;
  sku: string;
  poNumber: string;
  qtyConsumed: number;
  unitCost: number;
  cogsAmountCents: number;
  currency: string;
  qboJournalId: string | null;
};

async function getSellerboardExports(): Promise<SellerboardExportRow[]> {
  return db.$queryRawUnsafe<SellerboardExportRow[]>(`
    SELECT
      "id",
      "marketplace",
      "settlementId",
      "sku",
      "poNumber",
      "qtyConsumed",
      "unitCost",
      "cogsAmountCents",
      "currency",
      "qboJournalId"
    FROM "CogsConsumption"
    ORDER BY "settlementId" DESC, "sku" ASC, "poNumber" ASC
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
      <PageHeader title="Sellerboard Export" kicker="Same FIFO rows as QBO COGS support" />

      <Box sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell>Settlement</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>PO</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell align="right">Qty Sold</TableCell>
                <TableCell align="right">Unit Cost</TableCell>
                <TableCell align="right">COGS</TableCell>
                <TableCell>QBO JE</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState title="No Sellerboard COGS rows" description="Posted FIFO COGS consumptions are the Sellerboard export source." />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.settlementId}</Typography>
                  </TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.poNumber}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell align="right">{row.qtyConsumed.toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{Number(row.unitCost).toFixed(6)}</TableCell>
                  <TableCell align="right">{formatCents(row.cogsAmountCents, row.currency)}</TableCell>
                  <TableCell>{row.qboJournalId ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
