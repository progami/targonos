import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (appBasePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type InventoryTab = 'purchase-orders' | 'inventory-ledger' | 'cogs-postings';

type PurchaseOrderRow = {
  poNumber: string;
  qboPurchaseOrderId: string | null;
  marketplace: string;
  sku: string;
  layerCount: bigint;
  readyLayerCount: bigint;
  notReadyLayerCount: bigint;
  qtyReceived: bigint | null;
  liveQtyRemaining: bigint | null;
  inTransitQtyRemaining: bigint | null;
  landedTotalCents: bigint | null;
  liveValueCents: bigint | null;
  inTransitValueCents: bigint | null;
  unitCost: number | null;
};

type InventoryLayerRow = {
  id: string;
  poNumber: string;
  marketplace: string;
  sku: string;
  qtyReceived: number;
  qtyRemaining: number;
  landedTotalCents: number;
  unitCost: number;
  currency: string;
  status: string;
  receiptDate: Date | null;
};

type CogsPostingRow = {
  id: string;
  marketplace: string;
  settlementId: string;
  sku: string;
  poNumber: string;
  qtyConsumed: number;
  unitCost: number;
  txnDate: string;
  currency: string;
  qboJournalId: string | null;
  qboDocNumber: string | null;
  cogsAmountCents: number;
};

type InventoryFlowStep = {
  label: string;
  title: string;
  description: string;
};

async function getPurchaseOrderRows(): Promise<PurchaseOrderRow[]> {
  return db.$queryRawUnsafe<PurchaseOrderRow[]>(`
    SELECT
      "poNumber",
      MIN("qboPurchaseOrderId") AS "qboPurchaseOrderId",
      "marketplace",
      "sku",
      COUNT("id") AS "layerCount",
      COUNT(*) FILTER (WHERE "status" = 'READY') AS "readyLayerCount",
      COUNT(*) FILTER (WHERE "status" = 'NOT_READY') AS "notReadyLayerCount",
      COALESCE(SUM("qtyReceived"), 0) AS "qtyReceived",
      COALESCE(SUM("qtyRemaining") FILTER (WHERE "status" = 'READY'), 0) AS "liveQtyRemaining",
      COALESCE(SUM("qtyRemaining") FILTER (WHERE "status" = 'NOT_READY'), 0) AS "inTransitQtyRemaining",
      COALESCE(SUM("landedTotalCents"), 0) AS "landedTotalCents",
      COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)) FILTER (WHERE "status" = 'READY'), 0) AS "liveValueCents",
      COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)) FILTER (WHERE "status" = 'NOT_READY'), 0) AS "inTransitValueCents",
      CASE
        WHEN COALESCE(SUM("qtyReceived"), 0) = 0 THEN NULL
        ELSE (SUM("landedTotalCents")::numeric / 100) / SUM("qtyReceived")
      END AS "unitCost"
    FROM "CostLayer"
    GROUP BY "poNumber", "marketplace", "sku"
    ORDER BY "poNumber" ASC, "sku" ASC
    LIMIT 500
  `);
}

async function getInventoryLayers(): Promise<InventoryLayerRow[]> {
  return db.$queryRawUnsafe<InventoryLayerRow[]>(`
    SELECT
      "id",
      "poNumber",
      "marketplace",
      "sku",
      "qtyReceived",
      "qtyRemaining",
      "landedTotalCents",
      "unitCost",
      "currency",
      "status",
      "receiptDate"
    FROM "CostLayer"
    ORDER BY "poNumber" ASC, "sku" ASC, "receiptDate" ASC
    LIMIT 1000
  `);
}

async function getCogsPostings(): Promise<CogsPostingRow[]> {
  return db.$queryRawUnsafe<CogsPostingRow[]>(`
    SELECT
      consumption."id",
      consumption."marketplace",
      consumption."settlementId",
      consumption."sku",
      consumption."poNumber",
      consumption."qtyConsumed",
      consumption."unitCost",
      COALESCE(posting."txnDate", '') AS "txnDate",
      consumption."currency",
      COALESCE(posting."qboJournalId", consumption."qboJournalId") AS "qboJournalId",
      posting."qboDocNumber",
      consumption."cogsAmountCents"
    FROM "CogsConsumption" consumption
    LEFT JOIN "SettlementPosting" posting ON posting."id" = consumption."settlementPostingId"
    ORDER BY COALESCE(posting."txnDate", '') DESC, consumption."settlementId" DESC, consumption."poNumber" ASC, consumption."sku" ASC
    LIMIT 500
  `);
}

function formatUsdCents(value: bigint | null): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0n) / 100);
}

function formatCurrencyCents(value: number | bigint | null, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Number(value ?? 0) / 100,
  );
}

function formatDate(value: Date | null): string {
  if (value === null) return '-';
  return value.toISOString().slice(0, 10);
}

function statusLabel(row: PurchaseOrderRow): 'READY' | 'NOT_READY' {
  return Number(row.notReadyLayerCount) === 0 ? 'READY' : 'NOT_READY';
}

function controlAccount(status: string): 'Inventory Asset - Plutus' | 'Inventory in Transit - Plutus' {
  if (status === 'READY') return 'Inventory Asset - Plutus';
  if (status === 'NOT_READY') return 'Inventory in Transit - Plutus';
  throw new Error(`Unsupported cost layer status: ${status}`);
}

function parseInventoryTab(raw: string | string[] | undefined): InventoryTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'ledger') return 'inventory-ledger';
  if (value === 'cogs') return 'cogs-postings';
  if (value === undefined || value === 'po') return 'purchase-orders';
  throw new Error(`Unsupported inventory tab: ${value}`);
}

function tabHref(tab: InventoryTab): string {
  if (tab === 'inventory-ledger') return `${appBasePath}/purchase-orders?tab=ledger`;
  if (tab === 'cogs-postings') return `${appBasePath}/purchase-orders?tab=cogs`;
  return `${appBasePath}/purchase-orders`;
}

function connectionKey(poNumber: string, sku: string, marketplace: string) {
  return (
    <Box>
      <Typography sx={{ fontWeight: 650 }}>{poNumber}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: '0.78rem', color: 'text.secondary' }}>
        {sku} · {marketplace}
      </Typography>
    </Box>
  );
}

function stackedMetric(label: string, value: string) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

function InventoryFlow() {
  const steps: InventoryFlowStep[] = [
    {
      label: '1',
      title: 'QBO PO line',
      description: 'Native purchase evidence creates the PO/SKU layer key.',
    },
    {
      label: '2',
      title: 'FIFO layer',
      description: 'READY layers hold remaining quantity and landed value.',
    },
    {
      label: '3',
      title: 'COGS journal',
      description: 'Settlement units consume READY layers and post QBO COGS.',
    },
    {
      label: '4',
      title: 'Sellerboard export',
      description: 'The same PO/SKU consumption totals support Sellerboard.',
    },
  ];

  return (
    <Box
      sx={{
        mt: 2.5,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
        gap: 1,
      }}
    >
      {steps.map((step) => (
        <Box
          key={step.title}
          sx={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr',
            gap: 1,
            alignItems: 'start',
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            px: 1.25,
            py: 1,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: 'action.hover',
              color: 'text.secondary',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {step.label}
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{step.title}</Typography>
            <Typography sx={{ mt: 0.25, fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.35 }}>
              {step.description}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function InventoryTabs({ activeTab }: { activeTab: InventoryTab }) {
  const tabs: Array<{ value: InventoryTab; label: string }> = [
    { value: 'purchase-orders', label: '1. PO Source' },
    { value: 'inventory-ledger', label: '2. FIFO Ledger' },
    { value: 'cogs-postings', label: '3. COGS Posted' },
  ];

  return (
    <Box sx={{ mt: 2.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {tabs.map((tab) => {
        const active = tab.value === activeTab;
        return (
          <Button
            key={tab.value}
            href={tabHref(tab.value)}
            variant={active ? 'contained' : 'outlined'}
            size="small"
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: active ? '#00C2B9' : undefined,
              '&:hover': active ? { bgcolor: '#00a89f' } : undefined,
            }}
          >
            {tab.label}
          </Button>
        );
      })}
    </Box>
  );
}

function PurchaseOrderSummaryTable({ rows }: { rows: PurchaseOrderRow[] }) {
  return (
    <Box sx={{ mt: 2, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1120 }}>
          <TableHead>
            <TableRow>
              <TableCell>PO / SKU</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>QBO Source</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState title="No purchase-order layers" description="Opening layers and locked native QBO PO/SKU layers appear here." />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={`${row.marketplace}:${row.poNumber}:${row.sku}`}>
                <TableCell>{connectionKey(row.poNumber, row.sku, row.marketplace)}</TableCell>
                <TableCell>
                  <Chip
                    label={statusLabel(row)}
                    size="small"
                    variant="outlined"
                    color={statusLabel(row) === 'READY' ? 'success' : 'warning'}
                  />
                </TableCell>
                <TableCell>{row.qboPurchaseOrderId ?? 'OPENING'}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'grid', gap: 0.75 }}>
                    {stackedMetric('Received', Number(row.qtyReceived ?? 0n).toLocaleString('en-US'))}
                    {stackedMetric('READY', Number(row.liveQtyRemaining ?? 0n).toLocaleString('en-US'))}
                    {stackedMetric('NOT_READY', Number(row.inTransitQtyRemaining ?? 0n).toLocaleString('en-US'))}
                  </Box>
                </TableCell>
                <TableCell align="right">{row.unitCost === null ? '-' : Number(row.unitCost).toFixed(2)}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'grid', gap: 0.75 }}>
                    {stackedMetric('Landed', formatUsdCents(row.landedTotalCents))}
                    {stackedMetric('Inventory Asset - Plutus', formatUsdCents(row.liveValueCents))}
                    {stackedMetric('Inventory in Transit - Plutus', formatUsdCents(row.inTransitValueCents))}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

function InventoryLedgerTable({ rows }: { rows: InventoryLayerRow[] }) {
  return (
    <Box sx={{ mt: 2, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1040 }}>
          <TableHead>
            <TableRow>
              <TableCell>PO / SKU</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Control Account</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Layer Value</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell>Receipt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    title="No cost layers"
                    description="Opening layers and locked QBO PO/SKU layers will appear here."
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{connectionKey(row.poNumber, row.sku, row.marketplace)}</TableCell>
                <TableCell>
                  <Chip label={row.status} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{controlAccount(row.status)}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'grid', gap: 0.75 }}>
                    {stackedMetric('Received', row.qtyReceived.toLocaleString('en-US'))}
                    {stackedMetric('Remaining', row.qtyRemaining.toLocaleString('en-US'))}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  {formatCurrencyCents(row.landedTotalCents, row.currency)}
                </TableCell>
                <TableCell align="right">{Number(row.unitCost).toFixed(2)}</TableCell>
                <TableCell>{formatDate(row.receiptDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

function CogsPostingsTable({ rows }: { rows: CogsPostingRow[] }) {
  return (
    <Box sx={{ mt: 2, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow>
              <TableCell>PO / SKU</TableCell>
              <TableCell>Settlement</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>QBO Doc</TableCell>
              <TableCell>QBO JE</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">COGS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState
                    title="No COGS postings"
                    description="Posted FIFO COGS consumption lines will appear here by PO and SKU."
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{connectionKey(row.poNumber, row.sku, row.marketplace)}</TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 650 }}>{row.settlementId}</Typography>
                  <Typography sx={{ mt: 0.25, fontSize: '0.78rem', color: 'text.secondary' }}>
                    {row.marketplace}
                  </Typography>
                </TableCell>
                <TableCell>{row.txnDate}</TableCell>
                <TableCell>{row.qboDocNumber ?? '-'}</TableCell>
                <TableCell>{row.qboJournalId ?? '-'}</TableCell>
                <TableCell align="right">{row.qtyConsumed.toLocaleString('en-US')}</TableCell>
                <TableCell align="right">{Number(row.unitCost).toFixed(2)}</TableCell>
                <TableCell align="right">
                  {formatCurrencyCents(row.cogsAmountCents, row.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

export default async function PurchaseOrdersPage({ searchParams }: { searchParams?: SearchParams } = {}) {
  const resolvedSearchParams = searchParams === undefined ? {} : await searchParams;
  const activeTab = parseInventoryTab(resolvedSearchParams.tab);
  const purchaseOrderRows = activeTab === 'purchase-orders' ? await getPurchaseOrderRows() : [];
  const inventoryLayerRows = activeTab === 'inventory-ledger' ? await getInventoryLayers() : [];
  const cogsPostingRows = activeTab === 'cogs-postings' ? await getCogsPostings() : [];

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader
        title="Inventory"
        kicker="Purchase orders, FIFO layers, and COGS postings"
        actions={
          <>
            <Button href={`${appBasePath}/landed-cost-allocations`} variant="outlined" size="small">
              Assign Landed Costs
            </Button>
            <Button href={`${appBasePath}/sellerboard-export`} variant="outlined" size="small">
              Sellerboard Export
            </Button>
          </>
        }
      />

      <InventoryFlow />
      <InventoryTabs activeTab={activeTab} />
      {activeTab === 'purchase-orders' ? <PurchaseOrderSummaryTable rows={purchaseOrderRows} /> : null}
      {activeTab === 'inventory-ledger' ? <InventoryLedgerTable rows={inventoryLayerRows} /> : null}
      {activeTab === 'cogs-postings' ? <CogsPostingsTable rows={cogsPostingRows} /> : null}
    </Box>
  );
}
