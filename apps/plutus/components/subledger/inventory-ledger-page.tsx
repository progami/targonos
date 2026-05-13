'use client';

import { useQuery } from '@tanstack/react-query';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type InventoryMovement = {
  id: string;
  marketplace: string;
  movementType: string;
  quantity: number;
  movementDate: string;
  sourceType: string;
  sourceId: string;
  sourceLineId: string | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    active: boolean;
    productGroup: {
      id: string;
      code: string;
      name: string;
    };
  };
};

type InventoryLedgerResponse = {
  movements: InventoryMovement[];
};

const tableWrapSx = {
  mt: 2,
  overflow: 'hidden',
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

const headCellSx = {
  whiteSpace: 'nowrap',
  color: 'text.secondary',
} as const;

const bodyCellSx = {
  verticalAlign: 'top',
  fontSize: '0.8125rem',
} as const;

const quietTextSx = {
  fontSize: '0.75rem',
  color: 'text.secondary',
} as const;

const OUTBOUND_MOVEMENT_TYPES = new Set(['SALE', 'REMOVAL', 'DISPOSAL']);

async function fetchInventoryLedger(): Promise<InventoryLedgerResponse> {
  const res = await fetch(`${basePath}/api/plutus/inventory-ledger`);
  const data = (await res.json()) as InventoryLedgerResponse | { error?: string };

  if (!res.ok) {
    if ('error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    throw new Error('Failed to load inventory ledger');
  }

  return data as InventoryLedgerResponse;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function QuantityCell({ quantity }: { quantity: number }) {
  const formatted = new Intl.NumberFormat('en-US').format(quantity);
  const color = quantity < 0 ? 'error.main' : 'text.primary';

  return (
    <Typography sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {formatted}
    </Typography>
  );
}

function MovementChip({ movementType }: { movementType: string }) {
  const outbound = OUTBOUND_MOVEMENT_TYPES.has(movementType);

  return (
    <Chip
      label={movementType}
      size="small"
      variant="outlined"
      sx={{
        borderColor: outbound ? 'rgba(239, 68, 68, 0.35)' : 'divider',
        color: outbound ? 'error.dark' : 'text.secondary',
        bgcolor: outbound ? 'rgba(239, 68, 68, 0.05)' : 'background.paper',
      }}
    />
  );
}

export function InventoryLedgerPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-inventory-ledger'],
    queryFn: fetchInventoryLedger,
    staleTime: 30 * 1000,
  });

  const movements = data ? data.movements : [];

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Inventory Ledger" kicker="Subledger" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Date</TableCell>
                <TableCell sx={headCellSx}>Market</TableCell>
                <TableCell sx={headCellSx}>Product</TableCell>
                <TableCell sx={headCellSx}>Movement</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>Qty</TableCell>
                <TableCell sx={headCellSx}>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6} sx={{ py: 1.5 }}>
                        <Skeleton height={34} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}

              {!isLoading && error && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 5, textAlign: 'center', color: 'error.main' }}>
                    {error instanceof Error ? error.message : String(error)}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && movements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={<Inventory2Icon sx={{ fontSize: 40 }} />}
                      title="No inventory movements"
                      description="Receipts, sales, returns, and adjustments will appear here."
                    />
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
                      {formatDate(movement.movementDate)}
                    </Typography>
                    <Typography sx={quietTextSx}>{movement.id}</Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>{movement.marketplace}</TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                      {movement.product.name}
                    </Typography>
                    <Typography sx={quietTextSx}>{movement.product.productGroup.code}</Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <MovementChip movementType={movement.movementType} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <QuantityCell quantity={movement.quantity} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary' }}>
                      {movement.sourceType} {movement.sourceId}
                    </Typography>
                    <Typography sx={quietTextSx}>
                      {movement.sourceLineId === null ? '-' : `Line ${movement.sourceLineId}`}
                    </Typography>
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
