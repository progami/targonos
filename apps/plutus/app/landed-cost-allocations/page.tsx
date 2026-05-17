import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { AllocationCreateForm } from '@/components/landed-cost-allocations/allocation-create-form';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { db } from '@/lib/db';
import { fetchBills, type QboBill } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

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

type UnallocatedBillLine = {
  qboBillId: string;
  qboBillLineId: string;
  billDate: string;
  vendor: string;
  docNumber: string;
  account: string;
  description: string;
  amountCents: number;
  currency: string;
};

type UnallocatedBillLineResult =
  | { status: 'ok'; lines: UnallocatedBillLine[] }
  | { status: 'not_connected'; message: string }
  | { status: 'error'; message: string };

async function getAllocations(): Promise<AllocationRow[]> {
  return db.landedCostAllocation.findMany({
    orderBy: [{ qboBillId: 'asc' }, { qboBillLineId: 'asc' }, { sku: 'asc' }],
    take: 1000,
  });
}

const landedCostAccountMatchers = ['freight', 'duty', 'custom', 'box', 'packaging', 'broker'];

function isLandedCostBillLine(line: NonNullable<QboBill['Line']>[number]): boolean {
  const accountName =
    line.AccountBasedExpenseLineDetail?.AccountRef.name ??
    line.ItemBasedExpenseLineDetail?.AccountRef?.name ??
    '';
  const itemName = line.ItemBasedExpenseLineDetail?.ItemRef?.name ?? '';
  const description = line.Description ?? '';
  const searchable = `${accountName} ${itemName} ${description}`.toLowerCase();
  return landedCostAccountMatchers.some((matcher) => searchable.includes(matcher));
}

function billLineCurrency(bill: QboBill): string {
  const currency = bill.CurrencyRef?.value?.trim().toUpperCase();
  if (currency === undefined || currency === '') return 'USD';
  return currency;
}

async function getUnallocatedBillLines(
  allocations: AllocationRow[],
): Promise<UnallocatedBillLineResult> {
  const connection = await getQboConnection();
  if (connection === null) {
    return { status: 'not_connected', message: 'QBO connection is required to list bill lines.' };
  }

  const allocatedRefs = new Set(
    allocations.map((allocation) => `${allocation.qboBillId}:${allocation.qboBillLineId}`),
  );

  try {
    const result = await fetchBills(connection, {
      maxResults: 1000,
      includeTotalCount: false,
    });
    if (result.updatedConnection) {
      await saveServerQboConnection(result.updatedConnection);
    }

    const lines: UnallocatedBillLine[] = [];
    for (const bill of result.bills) {
      for (const line of bill.Line ?? []) {
        if (line.Amount <= 0) continue;
        if (!isLandedCostBillLine(line)) continue;
        if (allocatedRefs.has(`${bill.Id}:${line.Id}`)) continue;

        lines.push({
          qboBillId: bill.Id,
          qboBillLineId: line.Id,
          billDate: bill.TxnDate,
          vendor: bill.VendorRef?.name ?? 'Unknown',
          docNumber: bill.DocNumber ?? '-',
          account:
            line.AccountBasedExpenseLineDetail?.AccountRef.name ??
            line.ItemBasedExpenseLineDetail?.AccountRef?.name ??
            line.ItemBasedExpenseLineDetail?.ItemRef?.name ??
            '-',
          description: line.Description ?? '-',
          amountCents: Math.round(line.Amount * 100),
          currency: billLineCurrency(bill),
        });
      }
    }

    return {
      status: 'ok',
      lines: lines.sort((left, right) => {
        const dateCompare = right.billDate.localeCompare(left.billDate);
        if (dateCompare !== 0) return dateCompare;
        const billCompare = left.qboBillId.localeCompare(right.qboBillId);
        if (billCompare !== 0) return billCompare;
        return left.qboBillLineId.localeCompare(right.qboBillLineId);
      }),
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatCents(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

export default async function LandedCostAllocationsPage() {
  const rows = await getAllocations();
  const unallocatedBillLines = await getUnallocatedBillLines(rows);

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader
        title="Landed Cost Allocations"
        kicker="Freight, duty, boxes, broker lines assigned to PO/SKU"
      />
      <AllocationCreateForm />

      <Box
        sx={{
          mb: 2,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Unallocated QBO landed-cost bill lines
          </Typography>
        </Box>
        {unallocatedBillLines.status !== 'ok' ? (
          <Alert severity={unallocatedBillLines.status === 'not_connected' ? 'warning' : 'error'}>
            {unallocatedBillLines.message}
          </Alert>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1120 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>Doc</TableCell>
                  <TableCell>QBO Bill</TableCell>
                  <TableCell>Line</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unallocatedBillLines.lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        title="No unallocated landed-cost bill lines"
                        description="No matching current QBO bill lines remain after allocation filtering."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {unallocatedBillLines.lines.map((line) => (
                  <TableRow key={`${line.qboBillId}:${line.qboBillLineId}`}>
                    <TableCell>{line.billDate}</TableCell>
                    <TableCell>{line.vendor}</TableCell>
                    <TableCell>{line.docNumber}</TableCell>
                    <TableCell>{line.qboBillId}</TableCell>
                    <TableCell>{line.qboBillLineId}</TableCell>
                    <TableCell>{line.account}</TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell align="right">
                      {formatCents(line.amountCents, line.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>

      <Box
        sx={{ overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
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
                    <EmptyState
                      title="No landed-cost allocations"
                      description="Assign landed-cost bill lines to native QBO PO/SKU layers here."
                    />
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
                  <TableCell align="right">
                    {formatCents(row.allocatedAmountCents, row.currency)}
                  </TableCell>
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
