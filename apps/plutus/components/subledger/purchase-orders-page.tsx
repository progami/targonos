'use client';

import { useQuery } from '@tanstack/react-query';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
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

type CostLayer = {
  id: string;
  component: string;
  quantity: number | null;
  amountCents: number;
  currency: string;
  allocationMethod: string;
  sourceQboTxnType: string | null;
  sourceQboTxnId: string | null;
  sourceQboLineId: string | null;
  sourceDocumentName: string | null;
  createdAt: string;
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

type PurchaseOrderRow = {
  id: string;
  internalRef: string;
  supplierRef: string | null;
  marketplace: string | null;
  status: string;
  totalAmountCents: number;
  costLayers: CostLayer[];
};

type PurchaseOrdersResponse = {
  purchaseOrders: PurchaseOrderRow[];
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

async function fetchPurchaseOrders(): Promise<PurchaseOrdersResponse> {
  const res = await fetch(`${basePath}/api/plutus/purchase-orders`);
  const data = (await res.json()) as PurchaseOrdersResponse | { error?: string };

  if (!res.ok) {
    if ('error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    throw new Error('Failed to load purchase orders');
  }

  return data as PurchaseOrdersResponse;
}

function formatCents(amountCents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

function formatPurchaseOrderTotal(order: PurchaseOrderRow) {
  const firstLayer = order.costLayers[0];
  if (firstLayer === undefined) return '-';
  return formatCents(order.totalAmountCents, firstLayer.currency);
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.trim().toUpperCase();
  const isOpen = normalized === 'OPEN';

  return (
    <Chip
      label={status}
      size="small"
      variant={isOpen ? 'filled' : 'outlined'}
      color={isOpen ? 'success' : 'default'}
      sx={{ bgcolor: isOpen ? 'rgba(34, 197, 94, 0.1)' : 'background.paper', color: isOpen ? 'success.dark' : 'text.secondary' }}
    />
  );
}

function LayerSummary({ layer }: { layer: CostLayer }) {
  const quantity = layer.quantity === null ? '-' : new Intl.NumberFormat('en-US').format(layer.quantity);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '104px minmax(160px, 1fr) 96px', gap: 1.25, alignItems: 'baseline' }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.primary' }}>{layer.component}</Typography>
      <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'text.primary' }}>
        {layer.product.productGroup.code} / {layer.product.name}
      </Typography>
      <Typography sx={{ textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        {formatCents(layer.amountCents, layer.currency)}
      </Typography>
      <Typography sx={quietTextSx}>Qty {quantity}</Typography>
      <Typography sx={quietTextSx}>{layer.allocationMethod}</Typography>
      <Box />
    </Box>
  );
}

function QboSourceSummary({ layer }: { layer: CostLayer }) {
  const hasQboTxn = layer.sourceQboTxnType !== null && layer.sourceQboTxnId !== null;
  const txn = hasQboTxn ? `${layer.sourceQboTxnType} ${layer.sourceQboTxnId}` : '-';
  const line = layer.sourceQboLineId === null ? '-' : `Line ${layer.sourceQboLineId}`;
  const document = layer.sourceDocumentName === null ? '-' : layer.sourceDocumentName;

  return (
    <Box sx={{ display: 'grid', gap: 0.25 }}>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary' }}>{txn}</Typography>
      <Typography sx={quietTextSx}>{line}</Typography>
      <Typography title={document} sx={{ ...quietTextSx, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {document}
      </Typography>
    </Box>
  );
}

export function PurchaseOrdersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-purchase-orders'],
    queryFn: fetchPurchaseOrders,
    staleTime: 30 * 1000,
  });

  const purchaseOrders = data ? data.purchaseOrders : [];

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Purchase Orders" kicker="Subledger" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1160 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>PO</TableCell>
                <TableCell sx={headCellSx}>Market</TableCell>
                <TableCell sx={headCellSx}>Status</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>Total</TableCell>
                <TableCell sx={headCellSx}>Cost Layers</TableCell>
                <TableCell sx={headCellSx}>QBO Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <>
                  {Array.from({ length: 6 }).map((_, index) => (
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

              {!isLoading && !error && purchaseOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={<LocalShippingIcon sx={{ fontSize: 40 }} />}
                      title="No purchase orders loaded"
                      description="PO cost layers will appear after the subledger backfill runs."
                    />
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && purchaseOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell sx={bodyCellSx}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                        {order.internalRef}
                      </Typography>
                      <Typography sx={quietTextSx}>
                        {order.supplierRef === null ? '-' : order.supplierRef}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      {order.marketplace === null ? '-' : order.marketplace}
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <StatusChip status={order.status} />
                    </TableCell>
                    <TableCell sx={{ ...bodyCellSx, textAlign: 'right', fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                      {formatPurchaseOrderTotal(order)}
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Box sx={{ display: 'grid', gap: 1 }}>
                        {order.costLayers.map((layer) => (
                          <LayerSummary key={layer.id} layer={layer} />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Box sx={{ display: 'grid', gap: 1 }}>
                        {order.costLayers.map((layer) => (
                          <QboSourceSummary key={layer.id} layer={layer} />
                        ))}
                      </Box>
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
