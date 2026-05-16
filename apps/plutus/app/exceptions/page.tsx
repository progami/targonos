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

type ExceptionRow = {
  id: string;
  marketplace: string | null;
  scopeType: string;
  scopeId: string;
  code: string;
  severity: string;
  message: string;
  status: string;
  createdAt: Date;
};

const tableWrapSx = {
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

async function getExceptions(): Promise<ExceptionRow[]> {
  return db.$queryRawUnsafe<ExceptionRow[]>(`
    SELECT
      "id",
      "marketplace",
      "scopeType",
      "scopeId",
      "code",
      "severity",
      "message",
      "status",
      "createdAt"
    FROM "PlutusException"
    ORDER BY "status" ASC, "severity" ASC, "createdAt" DESC
    LIMIT 500
  `);
}

export default async function ExceptionsPage() {
  const rows = await getExceptions();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Exceptions" kicker="Posting blockers" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Marketplace</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      title="No open exceptions"
                      description="Blocked settlements, missing SKU aliases, and unmatched QBO source lines will appear here."
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.code}</Typography>
                  </TableCell>
                  <TableCell>
                    {row.scopeType} {row.scopeId}
                  </TableCell>
                  <TableCell>{row.marketplace ?? '-'}</TableCell>
                  <TableCell>{row.severity}</TableCell>
                  <TableCell>
                    <Chip label={row.status} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
