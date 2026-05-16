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

type SellerboardExportRow = {
  id: string;
  marketplace: string;
  settlementDocNumber: string;
  sellerSku: string;
  internalPo: string;
  quantity: number;
  amountCents: number;
  currency: string;
  status: string;
  exportedAt: Date | null;
};

const tableWrapSx = {
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

async function getSellerboardExports(): Promise<SellerboardExportRow[]> {
  return db.$queryRawUnsafe<SellerboardExportRow[]>(`
    SELECT
      "id",
      "marketplace",
      "settlementDocNumber",
      "sellerSku",
      "internalPo",
      "quantity",
      "amountCents",
      "currency",
      "status",
      "exportedAt"
    FROM "SellerboardCogsExport"
    ORDER BY "settlementDocNumber" DESC, "sellerSku" ASC, "internalPo" ASC
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

export default async function SellerboardExportPage() {
  const rows = await getSellerboardExports();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Sellerboard Export" kicker="Same COGS as QBO" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell>Settlement</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>PO</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">COGS</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Exported</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title="No Sellerboard COGS exports"
                      description="Sellerboard export rows will be generated from posted exact COGS batches."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.settlementDocNumber}</Typography>
                  </TableCell>
                  <TableCell>{row.sellerSku}</TableCell>
                  <TableCell>{row.internalPo}</TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell align="right">{row.quantity.toLocaleString('en-US')}</TableCell>
                  <TableCell align="right">{formatCents(row.amountCents, row.currency)}</TableCell>
                  <TableCell>
                    <Chip label={row.status} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{formatDate(row.exportedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
