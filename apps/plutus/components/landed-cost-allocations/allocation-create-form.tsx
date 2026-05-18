'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmptyState } from '@/components/ui/empty-state';
import { LANDED_COST_TYPES } from '@/lib/plutus/landed-cost-allocation-rules';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

export type AllocationWorkbenchLine = {
  qboBillId: string;
  qboBillLineId: string;
  billDate: string;
  vendor: string;
  docNumber: string;
  account: string;
  description: string;
  amountCents: number;
  allocatedCents: number;
  remainingCents: number;
  currency: string;
};

export type AllocationLayerOption = {
  id: string;
  marketplace: string;
  poNumber: string;
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string | null;
  qboItemId: string | null;
  sku: string;
  qtyReceived: number;
  qtyRemaining: number;
  status: string;
};

type AllocationWorkbenchProps = {
  lines: AllocationWorkbenchLine[];
  layerOptions: AllocationLayerOption[];
};

type FormState = {
  selectedLineKey: string;
  selectedLayerId: string;
  costType: string;
  amount: string;
  sourceNote: string;
};

function lineKey(line: AllocationWorkbenchLine): string {
  return `${line.qboBillId}:${line.qboBillLineId}`;
}

function centsToInput(value: number): string {
  return (value / 100).toFixed(2);
}

function amountToCents(value: string): number {
  const normalized = value.trim();
  if (normalized === '') throw new Error('Amount is required');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');
  return Math.round(amount * 100);
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

function initialForm(lines: AllocationWorkbenchLine[], layerOptions: AllocationLayerOption[]): FormState {
  const firstLine = lines[0];
  return {
    selectedLineKey: firstLine ? lineKey(firstLine) : '',
    selectedLayerId: layerOptions[0]?.id ?? '',
    costType: 'FREIGHT',
    amount: firstLine ? centsToInput(firstLine.remainingCents) : '',
    sourceNote: '',
  };
}

export function AllocationWorkbench({ lines, layerOptions }: AllocationWorkbenchProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialForm(lines, layerOptions));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedLine = useMemo(
    () => lines.find((line) => lineKey(line) === form.selectedLineKey) ?? null,
    [form.selectedLineKey, lines],
  );
  const selectedLayer = useMemo(
    () => layerOptions.find((layer) => layer.id === form.selectedLayerId) ?? null,
    [form.selectedLayerId, layerOptions],
  );

  useEffect(() => {
    if (lines.length === 0) {
      setForm((current) => ({ ...current, selectedLineKey: '', amount: '' }));
      return;
    }

    const currentLine = lines.find((line) => lineKey(line) === form.selectedLineKey);
    if (currentLine === undefined) {
      const nextLine = lines[0];
      setForm((current) => ({
        ...current,
        selectedLineKey: lineKey(nextLine),
        amount: centsToInput(nextLine.remainingCents),
      }));
    }
  }, [form.selectedLineKey, lines]);

  useEffect(() => {
    if (layerOptions.length === 0) {
      setForm((current) => ({ ...current, selectedLayerId: '' }));
      return;
    }

    if (!layerOptions.some((layer) => layer.id === form.selectedLayerId)) {
      setForm((current) => ({ ...current, selectedLayerId: layerOptions[0]?.id ?? '' }));
    }
  }, [form.selectedLayerId, layerOptions]);

  const selectLine = (line: AllocationWorkbenchLine) => {
    setError(null);
    setForm((current) => ({
      ...current,
      selectedLineKey: lineKey(line),
      amount: centsToInput(line.remainingCents),
    }));
  };

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (selectedLine === null) {
      setError('Select a QBO bill line first');
      return;
    }
    if (selectedLayer === null) {
      setError('Select a PO/SKU layer first');
      return;
    }

    const allocatedAmountCents = amountToCents(form.amount);
    if (allocatedAmountCents > selectedLine.remainingCents) {
      setError('Allocation amount cannot exceed the bill line remaining amount');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${basePath}/api/plutus/landed-cost-allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qboBillId: selectedLine.qboBillId,
          qboBillLineId: selectedLine.qboBillLineId,
          qboPurchaseOrderId: selectedLayer.qboPurchaseOrderId,
          qboPurchaseOrderLineId: selectedLayer.qboPurchaseOrderLineId ?? '',
          sku: selectedLayer.sku,
          costType: form.costType,
          allocatedAmountCents,
          currency: selectedLine.currency,
          sourceNote: form.sourceNote,
        }),
      });
      const data = (await res.json()) as { details?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.details ?? data.error ?? 'Failed to save allocation');
      }
      setForm((current) => ({ ...current, sourceNote: '' }));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.25fr) minmax(360px, 0.75fr)' },
          minHeight: 420,
        }}
      >
        <Box sx={{ borderRight: { lg: 1 }, borderColor: 'divider', minWidth: 0 }}>
          <Box
            sx={{
              alignItems: 'center',
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              gap: 1,
              px: 2,
              py: 1.5,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              QBO bill line queue
            </Typography>
            <Chip label={`${lines.length} open`} size="small" variant="outlined" />
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>Doc</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Bill Amount</TableCell>
                  <TableCell align="right">Allocated</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <EmptyState
                        title="No unallocated landed-cost bill lines"
                        description="No matching current QBO bill lines remain after allocation filtering."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((line) => {
                  const selected = selectedLine !== null && lineKey(line) === lineKey(selectedLine);
                  return (
                    <TableRow key={lineKey(line)} hover selected={selected}>
                      <TableCell>{line.billDate}</TableCell>
                      <TableCell>{line.vendor}</TableCell>
                      <TableCell>{line.docNumber}</TableCell>
                      <TableCell>{line.account}</TableCell>
                      <TableCell>{line.description}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(line.amountCents, line.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(line.allocatedCents, line.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(line.remainingCents, line.currency)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant={selected ? 'contained' : 'outlined'}
                          onClick={() => selectLine(line)}
                        >
                          {selected ? 'Selected' : 'Assign'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Allocation
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, p: 2 }}>
            {selectedLine === null ? (
              <Alert severity="info">Select a bill line from the queue.</Alert>
            ) : (
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  display: 'grid',
                  gap: 1,
                  p: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    QBO Bill
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 650 }}>
                    {selectedLine.qboBillId}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    QBO Bill Line
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 650 }}>
                    {selectedLine.qboBillLineId}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Remaining
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 650 }}>
                    {formatCurrency(selectedLine.remainingCents, selectedLine.currency)}
                  </Typography>
                </Box>
              </Box>
            )}

            <TextField
              select
              label="PO/SKU layer"
              size="small"
              value={form.selectedLayerId}
              onChange={(event) => setField('selectedLayerId', event.target.value)}
              disabled={layerOptions.length === 0}
            >
              {layerOptions.map((layer) => (
                <MenuItem key={layer.id} value={layer.id}>
                  {layer.poNumber} · {layer.sku} · {layer.marketplace}
                </MenuItem>
              ))}
            </TextField>

            {selectedLayer !== null && (
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  display: 'grid',
                  gap: 1,
                  p: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    QBO PO
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 650 }}>
                    {selectedLayer.qboPurchaseOrderId}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    QBO PO Line
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 650 }}>
                    {selectedLayer.qboPurchaseOrderLineId ?? '-'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Qty Remaining
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 650 }}>
                    {selectedLayer.qtyRemaining.toLocaleString('en-US')}
                  </Typography>
                </Box>
              </Box>
            )}

            <TextField
              select
              label="Cost Type"
              size="small"
              value={form.costType}
              onChange={(event) => setField('costType', event.target.value)}
            >
              {LANDED_COST_TYPES.map((costType) => (
                <MenuItem key={costType} value={costType}>
                  {costType}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount"
              size="small"
              value={form.amount}
              onChange={(event) => setField('amount', event.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              label="Source Note"
              size="small"
              value={form.sourceNote}
              onChange={(event) => setField('sourceNote', event.target.value)}
            />
            <Button
              variant="contained"
              disabled={saving || selectedLine === null || selectedLayer === null}
              onClick={handleSubmit}
            >
              Save Allocation
            </Button>
            {layerOptions.length === 0 && (
              <Alert severity="warning">
                No NOT_READY native QBO PO/SKU layers are available for landed-cost assignment.
              </Alert>
            )}
            {error !== null && <Alert severity="error">{error}</Alert>}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
