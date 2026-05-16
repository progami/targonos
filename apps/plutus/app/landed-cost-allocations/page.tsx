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

type AllocationRow = {
  id: string;
  qboBillId: string;
  qboBillLineId: string;
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string | null;
  sku: string;
  costType: string;
  allocatedAmountCents: number;
  currency: string;
  sourceNote: string | null;
};

async function getAllocations(): Promise<AllocationRow[]> {
  return db.landedCostAllocation.findMany({
    orderBy: [{ qboBillId: 'asc' }, { qboBillLineId: 'asc' }, { sku: 'asc' }],
    take: 1000,
  });
}

function formatCents(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

export default async function LandedCostAllocationsPage() {
  const rows = await getAllocations();

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Landed Cost Allocations" kicker="Freight, duty, boxes, broker lines assigned to PO/SKU" />

      <Box sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell>QBO Bill</TableCell>
                <TableCell>Line</TableCell>
                <TableCell>QBO PO</TableCell>
                <TableCell>PO Line</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Cost Type</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState title="No landed-cost allocations" description="Assign landed-cost bill lines to native QBO PO/SKU layers here." />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>{row.qboBillId}</Typography>
                  </TableCell>
                  <TableCell>{row.qboBillLineId}</TableCell>
                  <TableCell>{row.qboPurchaseOrderId}</TableCell>
                  <TableCell>{row.qboPurchaseOrderLineId ?? '-'}</TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.costType}</TableCell>
                  <TableCell align="right">{formatCents(row.allocatedAmountCents, row.currency)}</TableCell>
                  <TableCell>{row.sourceNote ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
