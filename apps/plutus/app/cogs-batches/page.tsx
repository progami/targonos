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

type CogsBatchRow = {
  id: string;
  marketplace: string;
  settlementId: string;
  txnDate: string;
  currency: string;
  qboJournalId: string | null;
  qboDocNumber: string | null;
  consumptionCount: bigint;
  cogsAmountCents: bigint | null;
};

async function getCogsBatches(): Promise<CogsBatchRow[]> {
  return db.$queryRawUnsafe<CogsBatchRow[]>(`
    SELECT
      posting."id",
      posting."marketplace",
      posting."settlementId",
      posting."txnDate",
      posting."currency",
      posting."qboJournalId",
      posting."qboDocNumber",
      COUNT(consumption."id") AS "consumptionCount",
      COALESCE(SUM(consumption."cogsAmountCents"), 0) AS "cogsAmountCents"
    FROM "SettlementPosting" posting
    LEFT JOIN "CogsConsumption" consumption ON consumption."settlementPostingId" = posting."id"
    WHERE posting."postingType" = 'COGS'
    GROUP BY posting."id"
    ORDER BY posting."txnDate" DESC, posting."settlementId" DESC
    LIMIT 500
  `);
}

function formatCents(value: bigint | null, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Number(value ?? 0n) / 100,
  );
}

export default async function CogsBatchesPage() {
  const rows = await getCogsBatches();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="COGS Postings" kicker="FIFO COGS journals" />

      <Box
        sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>Settlement</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>QBO Doc</TableCell>
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
                      title="No COGS postings"
                      description="FIFO COGS journals will appear here after settlement posting."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.settlementId}</Typography>
                  </TableCell>
                  <TableCell>{row.marketplace}</TableCell>
                  <TableCell>{row.txnDate}</TableCell>
                  <TableCell>{row.qboDocNumber ?? '-'}</TableCell>
                  <TableCell>{row.qboJournalId ?? '-'}</TableCell>
                  <TableCell align="right">{Number(row.consumptionCount)}</TableCell>
                  <TableCell align="right">
                    {formatCents(row.cogsAmountCents, row.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
