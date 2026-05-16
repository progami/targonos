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

type CogsBatchRow = {
  id: string;
  marketplace: string;
  settlementDocNumber: string;
  txnDate: string;
  currency: string;
  status: string;
  qboJournalEntryId: string | null;
  consumptionCount: bigint;
  cogsAmountCents: bigint | null;
};

const tableWrapSx = {
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

async function getCogsBatches(): Promise<CogsBatchRow[]> {
  return db.$queryRawUnsafe<CogsBatchRow[]>(`
    SELECT
      batch."id",
      batch."marketplace",
      batch."settlementDocNumber",
      batch."txnDate",
      batch."currency",
      batch."status",
      batch."qboJournalEntryId",
      COUNT(consumption."id") AS "consumptionCount",
      COALESCE(SUM(consumption."amountCents"), 0) AS "cogsAmountCents"
    FROM "CogsPostingBatch" batch
    LEFT JOIN "CostLayerConsumption" consumption ON consumption."cogsPostingBatchId" = batch."id"
    GROUP BY batch."id"
    ORDER BY batch."txnDate" DESC, batch."settlementDocNumber" DESC
    LIMIT 500
  `);
}

function formatCents(value: bigint | null, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value ?? 0n) / 100);
}

export default async function CogsBatchesPage() {
  const rows = await getCogsBatches();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="COGS Batches" kicker="FIFO postings" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>Settlement</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>QBO JE</TableCell>
                <TableCell align="right">Lines</TableCell>
                <TableCell align="right">COGS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title="No COGS batches posted"
                      description="Exact settlement COGS postings will appear here after FIFO consumption is approved and posted."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.settlementDocNumber}</Typography>
                  </TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell>{row.txnDate}</TableCell>
                  <TableCell>
                    <Chip label={row.status} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.qboJournalEntryId ?? '-'}</TableCell>
                  <TableCell align="right">{Number(row.consumptionCount)}</TableCell>
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
