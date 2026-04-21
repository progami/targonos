'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getPublicBasePath } from '@/lib/base-path';
import type { WprChangeLogEntry, WeekLabel } from '@/lib/wpr/types';
import {
  panelSx,
  panelHeadSx,
  panelTitleSx,
  panelBadgeSx,
  panelBgDarker,
  subtleBorder,
  teal,
  textMuted,
  textPrimary,
  textSecondary,
} from '@/lib/wpr/panel-tokens';

const basePath = getPublicBasePath();

const CATEGORY_COLORS: Record<string, string> = {
  MANUAL: 'rgba(168, 130, 255, 0.75)',
  CONTENT: 'rgba(0, 194, 185, 0.75)',
  PRICING: 'rgba(255, 183, 77, 0.75)',
  IMAGES: 'rgba(129, 199, 132, 0.75)',
  OFFER: 'rgba(100, 181, 246, 0.75)',
  CATALOG: 'rgba(255, 138, 128, 0.75)',
};

const CHANGE_TYPE_OPTIONS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'CONTENT', label: 'Content' },
  { value: 'PRICING', label: 'Pricing' },
  { value: 'IMAGES', label: 'Images' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'CATALOG', label: 'Catalog' },
] as const;

const dialogSlotProps = {
  paper: {
    sx: {
      borderRadius: 3,
      border: '1px solid rgba(255,255,255,0.08)',
      bgcolor: panelBgDarker,
      color: textPrimary,
      boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
    },
  },
  backdrop: {
    sx: {
      backdropFilter: 'blur(3px)',
      backgroundColor: 'rgba(0, 8, 16, 0.55)',
    },
  },
} as const;

type ChangeDraft = {
  entryDate: string;
  category: string;
  title: string;
  summary: string;
  asins: string;
  fieldLabels: string;
  highlights: string;
  statusLines: string;
};

const cellSx = {
  px: 1.5,
  py: 1,
  fontSize: '0.8125rem',
  lineHeight: 1.4,
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  verticalAlign: 'top' as const,
};

const headerCellSx = {
  ...cellSx,
  py: 0.75,
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: textMuted,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky' as const,
  top: 0,
  bgcolor: panelBgDarker,
  zIndex: 2,
};

const tagSx = {
  display: 'inline-block' as const,
  px: '7px',
  py: '3px',
  borderRadius: '4px',
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
};

const chipSx = {
  display: 'inline-block' as const,
  px: '6px',
  py: '2px',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '3px',
  fontSize: '0.75rem',
  fontFamily: 'monospace',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap' as const,
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toUpperCase()] ?? 'rgba(255,255,255,0.6)';
}

function compactList(values: string[]): string {
  if (values.length === 0) {
    return '—';
  }

  return values.join(', ');
}

function summaryText(entry: WprChangeLogEntry): string {
  if (entry.summary.trim() !== '') {
    return entry.summary;
  }

  if (entry.highlights !== undefined && entry.highlights.length > 0) {
    return entry.highlights.join(' | ');
  }

  return '—';
}

function fieldLabels(entry: WprChangeLogEntry): string[] {
  if (entry.field_labels === undefined) {
    return [];
  }

  return entry.field_labels;
}

function todayIsoDate(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildInitialDraft(): ChangeDraft {
  return {
    entryDate: todayIsoDate(),
    category: 'MANUAL',
    title: '',
    summary: '',
    asins: '',
    fieldLabels: '',
    highlights: '',
    statusLines: '',
  };
}

function splitCommaOrLineValues(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function splitLineValues(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

export default function ChangeTimeline({
  entries,
  selectedWeekLabel,
}: {
  entries: WprChangeLogEntry[];
  selectedWeekLabel: WeekLabel;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChangeDraft>(() => buildInitialDraft());

  const resetDraft = () => {
    setDraft(buildInitialDraft());
    setError(null);
  };

  const handleOpenDialog = () => {
    resetDraft();
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    if (busy) {
      return;
    }

    setDialogOpen(false);
    setError(null);
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${basePath}/api/wpr/changelog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weekLabel: selectedWeekLabel,
          entryDate: draft.entryDate,
          category: draft.category,
          title: draft.title,
          summary: draft.summary,
          asins: splitCommaOrLineValues(draft.asins),
          fieldLabels: splitCommaOrLineValues(draft.fieldLabels),
          highlights: splitLineValues(draft.highlights),
          statusLines: splitLineValues(draft.statusLines),
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to create the WPR changelog entry.');
      }

      await queryClient.invalidateQueries({ queryKey: ['wpr'] });
      setDialogOpen(false);
      resetDraft();
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : 'Failed to create the WPR changelog entry.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const saveDisabled =
    busy ||
    draft.entryDate.trim() === '' ||
    draft.title.trim() === '' ||
    draft.summary.trim() === '' ||
    splitCommaOrLineValues(draft.asins).length === 0 ||
    splitLineValues(draft.highlights).length === 0;

  return (
    <Box sx={panelSx}>
      <Box sx={panelHeadSx}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography sx={panelTitleSx}>Change Log</Typography>
          <Typography sx={panelBadgeSx}>
            {entries.length} tracked change{entries.length !== 1 ? 's' : ''}
          </Typography>
          <Typography sx={panelBadgeSx}>Through {selectedWeekLabel}</Typography>
        </Stack>
        <Button
          type="button"
          size="small"
          variant="outlined"
          onClick={handleOpenDialog}
          sx={{
            borderColor: 'rgba(0,194,185,0.42)',
            color: teal,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'none',
            '&:hover': {
              borderColor: 'rgba(0,194,185,0.56)',
              bgcolor: 'rgba(0,194,185,0.12)',
            },
          }}
        >
          New change
        </Button>
      </Box>

      {entries.length === 0 ? (
        <Box
          sx={{
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.54)',
            fontSize: '0.78rem',
            letterSpacing: '0.03em',
          }}
        >
          No tracked changes in the available history.
        </Box>
      ) : (
        <Box sx={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '72px' }}>
                  Week
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '156px' }}>
                  Date
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '92px' }}>
                  Source
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '92px' }}>
                  Type
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '280px' }}>
                  Title
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left' }}>
                  Summary
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '180px' }}>
                  ASINs
                </Box>
                <Box component="th" sx={{ ...headerCellSx, textAlign: 'left', width: '180px' }}>
                  Fields
                </Box>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const summary = summaryText(entry);
                const categoryColor = getCategoryColor(entry.category);
                const fields = fieldLabels(entry);
                return (
                  <Box
                    component="tr"
                    key={entry.id}
                    sx={{
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                      transition: 'background-color 0.1s',
                    }}
                  >
                    <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                      <Box
                        component="span"
                        sx={{
                          px: '6px',
                          py: '2px',
                          bgcolor: 'rgba(0, 194, 185, 0.15)',
                          border: '1px solid rgba(0, 194, 185, 0.25)',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          color: teal,
                        }}
                      >
                        {entry.week_label}
                      </Box>
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left', color: textSecondary }}>
                      {entry.date_label}
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                      <Box
                        component="span"
                        sx={{
                          ...tagSx,
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: textMuted,
                          fontWeight: 500,
                        }}
                      >
                        {entry.source}
                      </Box>
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                      <Box
                        component="span"
                        sx={{
                          ...tagSx,
                          bgcolor: `${categoryColor}15`,
                          border: `1px solid ${categoryColor}40`,
                          color: categoryColor,
                        }}
                      >
                        {entry.category}
                      </Box>
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left', color: 'rgba(255,255,255,0.85)' }}>
                      <Typography
                        sx={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: 'inherit',
                          lineHeight: 1.35,
                        }}
                      >
                        {entry.title}
                      </Typography>
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left', color: textSecondary }}>
                      <Typography
                        sx={{
                          fontSize: '0.78rem',
                          color: 'inherit',
                          lineHeight: 1.45,
                          whiteSpace: 'normal',
                        }}
                      >
                        {summary}
                      </Typography>
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left' }}>
                      <Typography
                        sx={{
                          fontSize: '0.76rem',
                          color: textSecondary,
                          lineHeight: 1.45,
                          whiteSpace: 'normal',
                        }}
                      >
                        {compactList(entry.asins)}
                      </Typography>
                    </Box>

                    <Box component="td" sx={{ ...cellSx, textAlign: 'left', whiteSpace: 'normal' }}>
                      {fields.length === 0 ? (
                        <Typography sx={{ fontSize: '0.76rem', color: textMuted }}>—</Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {fields.map((field) => (
                            <Box component="span" key={`${entry.id}-${field}`} sx={chipSx}>
                              {field}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </tbody>
          </table>
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="md" slotProps={dialogSlotProps}>
        <DialogTitle sx={{ pb: 1.25, borderBottom: subtleBorder }}>
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: textPrimary }}>
              Log a new standardized change
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: textSecondary }}>
              This writes a canonical Plan Log markdown file for {selectedWeekLabel} and rebuilds the WPR payload.
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ py: 2.5, borderColor: 'rgba(255,255,255,0.08)' }}>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Week"
                value={selectedWeekLabel}
                fullWidth
                InputProps={{ readOnly: true }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(255,255,255,0.03)',
                  },
                }}
              />
              <TextField
                label="Entry date"
                type="date"
                value={draft.entryDate}
                onChange={(event) => setDraft((current) => ({ ...current, entryDate: event.target.value }))}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                select
                label="Type"
                value={draft.category}
                onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                fullWidth
              >
                {CHANGE_TYPE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              label="Title"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              fullWidth
              placeholder="Content update across 2 ASINs"
            />

            <TextField
              label="Summary"
              value={draft.summary}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              fullWidth
              multiline
              minRows={2}
              placeholder="Backend terms and bullets refreshed."
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="ASINs"
                value={draft.asins}
                onChange={(event) => setDraft((current) => ({ ...current, asins: event.target.value }))}
                fullWidth
                multiline
                minRows={4}
                placeholder={'B09HXC3NL8\nB0CR1GSBQ9'}
                helperText="One per line or comma separated."
              />
              <TextField
                label="Fields"
                value={draft.fieldLabels}
                onChange={(event) => setDraft((current) => ({ ...current, fieldLabels: event.target.value }))}
                fullWidth
                multiline
                minRows={4}
                placeholder={'Backend terms\nBullet points'}
                helperText="Optional. One per line or comma separated."
              />
            </Stack>

            <TextField
              label="What changed (one per line)"
              value={draft.highlights}
              onChange={(event) => setDraft((current) => ({ ...current, highlights: event.target.value }))}
              fullWidth
              multiline
              minRows={5}
              placeholder={'Rewrote backend terms for root coverage.\nTightened bullet hierarchy for mobile.'}
            />

            <TextField
              label="Status"
              value={draft.statusLines}
              onChange={(event) => setDraft((current) => ({ ...current, statusLines: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
              placeholder={'Submitted in Seller Central.\nWaiting for propagation.'}
              helperText="Optional. One status line per row."
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, gap: 1.25, borderTop: subtleBorder }}>
          <Button type="button" variant="text" color="inherit" disabled={busy} onClick={handleCloseDialog}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={saveDisabled}
            onClick={() => {
              void handleSubmit();
            }}
            sx={{
              bgcolor: teal,
              color: 'rgba(0, 20, 35, 0.95)',
              fontWeight: 800,
              '&:hover': {
                bgcolor: '#24d7cf',
              },
            }}
          >
            {busy ? 'Saving...' : 'Save change'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
