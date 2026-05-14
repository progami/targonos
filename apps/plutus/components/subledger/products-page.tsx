'use client';

import { useQuery } from '@tanstack/react-query';
import CategoryIcon from '@mui/icons-material/Category';
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

type ProductAlias = {
  id: string;
  marketplace: string;
  aliasType: string;
  value: string;
  active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  active: boolean;
  productGroup: {
    id: string;
    code: string;
    name: string;
    active: boolean;
  };
  aliases: ProductAlias[];
};

type ProductsResponse = {
  products: ProductRow[];
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

async function fetchProducts(): Promise<ProductsResponse> {
  const res = await fetch(`${basePath}/api/plutus/products`);
  const data = (await res.json()) as ProductsResponse | { error?: string };

  if (!res.ok) {
    if ('error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    throw new Error('Failed to load products');
  }

  return data as ProductsResponse;
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <Chip
      label={active ? 'Active' : 'Inactive'}
      size="small"
      variant={active ? 'filled' : 'outlined'}
      color={active ? 'success' : 'default'}
      sx={{ bgcolor: active ? 'rgba(34, 197, 94, 0.1)' : 'background.paper', color: active ? 'success.dark' : 'text.secondary' }}
    />
  );
}

function AliasCell({ aliases }: { aliases: ProductAlias[] }) {
  if (aliases.length === 0) {
    return <Typography sx={quietTextSx}>-</Typography>;
  }

  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      {aliases.map((alias) => (
        <Box key={alias.id} sx={{ minWidth: 0 }}>
          <Typography
            title={alias.value}
            sx={{
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.8125rem',
              color: alias.active ? 'text.primary' : 'text.disabled',
            }}
          >
            {alias.aliasType}: {alias.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function aliasesForMarketplace(product: ProductRow, marketplace: string) {
  return product.aliases.filter((alias) => alias.marketplace === marketplace);
}

function aliasesForOtherMarketplaces(product: ProductRow) {
  return product.aliases.filter(
    (alias) => alias.marketplace !== 'amazon.com' && alias.marketplace !== 'amazon.co.uk',
  );
}

export function ProductsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-products'],
    queryFn: fetchProducts,
    staleTime: 30 * 1000,
  });

  const products = data ? data.products : [];

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="Products" kicker="Subledger" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Product</TableCell>
                <TableCell sx={headCellSx}>Group</TableCell>
                <TableCell sx={headCellSx}>Status</TableCell>
                <TableCell sx={headCellSx}>US Aliases</TableCell>
                <TableCell sx={headCellSx}>UK Aliases</TableCell>
                <TableCell sx={headCellSx}>Other Aliases</TableCell>
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

              {!isLoading && !error && products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={<CategoryIcon sx={{ fontSize: 40 }} />}
                      title="No products loaded"
                      description="Canonical products will appear after the subledger backfill runs."
                    />
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                      {product.name}
                    </Typography>
                    <Typography sx={quietTextSx}>{product.id}</Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
                      {product.productGroup.code}
                    </Typography>
                    <Typography sx={quietTextSx}>{product.productGroup.name}</Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <StatusChip active={product.active} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <AliasCell aliases={aliasesForMarketplace(product, 'amazon.com')} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <AliasCell aliases={aliasesForMarketplace(product, 'amazon.co.uk')} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <AliasCell aliases={aliasesForOtherMarketplaces(product)} />
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
