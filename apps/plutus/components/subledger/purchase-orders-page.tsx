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
import {
  buildPurchaseOrderCurrencyTotals,
  buildPurchaseOrderProductSummaries,
  type PurchaseOrderProductLayer,
} from '@/lib/plutus/purchase-orders-view';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type CostLayer = PurchaseOrderProductLayer & {
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
    aliases: Array<{
      marketplace: string;
      aliasType: string;
      value: string;
      active: boolean;
    }>;
  };
};

type PurchaseOrderRow = {
  id: string;
  internalRef: string;
  supplierRef: string | null;
  marketplace: string | null;
  status: string;
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
  const totals = buildPurchaseOrderCurrencyTotals(order.costLayers);
  if (totals.length === 0) return '-';
  return totals.map((total) => formatCents(total.amountCents, total.currency)).join(' / ');
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

function formatQuantity(quantity: number | null) {
  if (quantity === null) return '-';
  return new Intl.NumberFormat('en-US').format(quantity);
}

function formatComponentLabel(component: string) {
  if (component === 'mfgAccessories') return 'Accessories';
  return component.slice(0, 1).toUpperCase() + component.slice(1);
}

function ProductSummary({ order }: { order: PurchaseOrderRow }) {
  const products = buildPurchaseOrderProductSummaries(order.marketplace, order.costLayers);

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {products.map((product) => (
        <Box
          key={product.key}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 120px 132px' },
            gap: { xs: 0.5, md: 1.5 },
            alignItems: 'start',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary' }}>
              {product.groupCode} / {product.sku}
            </Typography>
            <Typography sx={{ ...quietTextSx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.productName}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            Qty {formatQuantity(product.quantity)}
          </Typography>
          <Typography sx={{ textAlign: { xs: 'left', md: 'right' }, fontSize: '0.875rem', fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatCents(product.totalAmountCents, product.currency)}
          </Typography>
          <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' }, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {product.componentAmounts.map((component) => (
              <Chip
                key={component.component}
                label={`${formatComponentLabel(component.component)} ${formatCents(component.amountCents, product.currency)}`}
                size="small"
                variant="outlined"
                sx={{ borderRadius: 1, height: 22, fontSize: '0.6875rem' }}
              />
            ))}
          </Box>
        </Box>
      ))}
      {products.length === 0 && (
        <Typography sx={quietTextSx}>No SKU layers</Typography>
      )}
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
          <Table size="small" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>PO</TableCell>
                <TableCell sx={headCellSx}>Market / Supplier Ref</TableCell>
                <TableCell sx={headCellSx}>Products</TableCell>
                <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>Total</TableCell>
                <TableCell sx={headCellSx}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={5} sx={{ py: 1.5 }}>
                        <Skeleton height={34} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}

              {!isLoading && error && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 5, textAlign: 'center', color: 'error.main' }}>
                    {error instanceof Error ? error.message : String(error)}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && purchaseOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
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
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary' }}>
                        {order.marketplace === null ? '-' : order.marketplace}
                      </Typography>
                      <Typography sx={quietTextSx}>
                        {order.supplierRef === null ? '-' : order.supplierRef}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <ProductSummary order={order} />
                    </TableCell>
                    <TableCell sx={{ ...bodyCellSx, textAlign: 'right', fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                      {formatPurchaseOrderTotal(order)}
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <StatusChip status={order.status} />
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
