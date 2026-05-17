'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  LANDED_COST_CURRENCIES,
  LANDED_COST_TYPES,
} from '@/lib/plutus/landed-cost-allocation-rules';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type FormState = {
  qboBillId: string;
  qboBillLineId: string;
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string;
  sku: string;
  costType: string;
  amount: string;
  currency: string;
  sourceNote: string;
};

const initialState: FormState = {
  qboBillId: '',
  qboBillLineId: '',
  qboPurchaseOrderId: '',
  qboPurchaseOrderLineId: '',
  sku: '',
  costType: 'FREIGHT',
  amount: '',
  currency: 'USD',
  sourceNote: '',
};

function amountToCents(value: string): number {
  const normalized = value.trim();
  if (normalized === '') throw new Error('Amount is required');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');
  return Math.round(amount * 100);
}

export function AllocationCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${basePath}/api/plutus/landed-cost-allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qboBillId: form.qboBillId,
          qboBillLineId: form.qboBillLineId,
          qboPurchaseOrderId: form.qboPurchaseOrderId,
          qboPurchaseOrderLineId: form.qboPurchaseOrderLineId,
          sku: form.sku,
          costType: form.costType,
          allocatedAmountCents: amountToCents(form.amount),
          currency: form.currency,
          sourceNote: form.sourceNote,
        }),
      });
      const data = (await res.json()) as { details?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.details ?? data.error ?? 'Failed to save allocation');
      }
      setForm(initialState);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ mb: 2, p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        Add landed-cost allocation
      </Typography>
      <Box
        sx={{
          mt: 1.5,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        <TextField
          label="QBO Bill ID"
          size="small"
          value={form.qboBillId}
          onChange={(e) => setField('qboBillId', e.target.value)}
        />
        <TextField
          label="QBO Bill Line ID"
          size="small"
          value={form.qboBillLineId}
          onChange={(e) => setField('qboBillLineId', e.target.value)}
        />
        <TextField
          label="QBO PO ID"
          size="small"
          value={form.qboPurchaseOrderId}
          onChange={(e) => setField('qboPurchaseOrderId', e.target.value)}
        />
        <TextField
          label="QBO PO Line ID"
          size="small"
          value={form.qboPurchaseOrderLineId}
          onChange={(e) => setField('qboPurchaseOrderLineId', e.target.value)}
        />
        <TextField
          label="SKU"
          size="small"
          value={form.sku}
          onChange={(e) => setField('sku', e.target.value)}
        />
        <TextField
          select
          label="Cost Type"
          size="small"
          value={form.costType}
          onChange={(e) => setField('costType', e.target.value)}
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
          onChange={(e) => setField('amount', e.target.value)}
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        />
        <TextField
          select
          label="Currency"
          size="small"
          value={form.currency}
          onChange={(e) => setField('currency', e.target.value)}
        >
          {LANDED_COST_CURRENCIES.map((currency) => (
            <MenuItem key={currency} value={currency}>
              {currency}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Source Note"
          size="small"
          value={form.sourceNote}
          onChange={(e) => setField('sourceNote', e.target.value)}
          sx={{ gridColumn: { md: 'span 3' } }}
        />
        <Button variant="contained" disabled={saving} onClick={handleSubmit}>
          Save Allocation
        </Button>
      </Box>
      {error !== null && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
}
