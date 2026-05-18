import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { db } from '@/lib/db';

import { InventoryTabsClient, type InventoryTab } from './inventory-tabs';

export const dynamic = 'force-dynamic';

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (appBasePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

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
  if (value === undefined) return 'purchase-orders';
  if (value === 'po') return 'purchase-orders';
  throw new Error(`Unsupported inventory tab: ${value}`);
}

function PurchaseOrderSummaryTable({ rows }: { rows: PurchaseOrderRow[] }) {
  return (
    <Box sx={{ mt: 2, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1320 }}>
          <TableHead>
            <TableRow>
              <TableCell>PO</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>QBO PO</TableCell>
              <TableCell align="right">Received Qty</TableCell>
              <TableCell align="right">READY Qty</TableCell>
              <TableCell align="right">NOT_READY Qty</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">Landed Value</TableCell>
              <TableCell align="right">Inventory Asset</TableCell>
              <TableCell align="right">Inventory In Transit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12}>
                  <EmptyState title="No purchase-order layers" description="Opening layers and locked native QBO PO/SKU layers appear here." />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={`${row.marketplace}:${row.poNumber}:${row.sku}`}>
                <TableCell>{row.poNumber}</TableCell>
                <TableCell>{row.sku}</TableCell>
                <TableCell>{row.marketplace}</TableCell>
                <TableCell>
                  <Chip
                    label={statusLabel(row)}
                    size="small"
                    variant="outlined"
                    color={statusLabel(row) === 'READY' ? 'success' : 'warning'}
                  />
                </TableCell>
                <TableCell>{row.qboPurchaseOrderId ?? 'OPENING'}</TableCell>
                <TableCell align="right">{Number(row.qtyReceived ?? 0n).toLocaleString('en-US')}</TableCell>
                <TableCell align="right">{Number(row.liveQtyRemaining ?? 0n).toLocaleString('en-US')}</TableCell>
                <TableCell align="right">{Number(row.inTransitQtyRemaining ?? 0n).toLocaleString('en-US')}</TableCell>
                <TableCell align="right">{row.unitCost === null ? '-' : Number(row.unitCost).toFixed(2)}</TableCell>
                <TableCell align="right">{formatUsdCents(row.landedTotalCents)}</TableCell>
                <TableCell align="right">{formatUsdCents(row.liveValueCents)}</TableCell>
                <TableCell align="right">{formatUsdCents(row.inTransitValueCents)}</TableCell>
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
        <Table size="small" sx={{ minWidth: 1120 }}>
          <TableHead>
            <TableRow>
              <TableCell>PO</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Marketplace</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Control Account</TableCell>
              <TableCell align="right">Received Qty</TableCell>
              <TableCell align="right">Remaining Qty</TableCell>
              <TableCell align="right">Layer Value</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell>Receipt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10}>
                  <EmptyState
                    title="No cost layers"
                    description="Opening layers and locked QBO PO/SKU layers will appear here."
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.poNumber}</TableCell>
                <TableCell>{row.sku}</TableCell>
                <TableCell>{row.marketplace}</TableCell>
                <TableCell>
                  <Chip label={row.status} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{controlAccount(row.status)}</TableCell>
                <TableCell align="right">{row.qtyReceived.toLocaleString('en-US')}</TableCell>
                <TableCell align="right">{row.qtyRemaining.toLocaleString('en-US')}</TableCell>
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
        <Table size="small" sx={{ minWidth: 1160 }}>
          <TableHead>
            <TableRow>
              <TableCell>PO</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Marketplace</TableCell>
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
                <TableCell colSpan={10}>
                  <EmptyState
                    title="No COGS postings"
                    description="Posted FIFO COGS consumption lines will appear here by PO and SKU."
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.poNumber}</TableCell>
                <TableCell>{row.sku}</TableCell>
                <TableCell>{row.marketplace}</TableCell>
                <TableCell>{row.settlementId}</TableCell>
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
  const [purchaseOrderRows, inventoryLayerRows, cogsPostingRows] = await Promise.all([
    getPurchaseOrderRows(),
    getInventoryLayers(),
    getCogsPostings(),
  ]);

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

      <InventoryTabsClient
        initialActiveTab={activeTab}
        purchaseOrdersPanel={<PurchaseOrderSummaryTable rows={purchaseOrderRows} />}
        ledgerPanel={<InventoryLedgerTable rows={inventoryLayerRows} />}
        cogsPanel={<CogsPostingsTable rows={cogsPostingRows} />}
      />
    </Box>
  );
}
