'use client';

import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import type { SettlementPostingSectionViewModel } from '@/lib/plutus/settlement-review';

type SettlementLedgerLine = {
  id?: string;
  description: string;
  amount: number;
  postingType: 'Debit' | 'Credit';
  accountName: string;
  accountFullyQualifiedName?: string;
};

type SettlementLedgerSectionProps = {
  section: SettlementPostingSectionViewModel;
  currency: string;
  lines: SettlementLedgerLine[];
};

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Math.abs(amount));

  if (amount < 0) return `(${formatted})`;
  return formatted;
}

function formatPeriod(start: string | null, end: string | null): string {
  if (start === null || end === null) return '—';

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();

  const startText = startDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  const endText = endDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${startText} – ${endText}`;
}

export function SettlementLedgerSection({ section, currency, lines }: SettlementLedgerSectionProps) {
  return (
    <Box
      component="section"
      sx={{
        display: 'grid',
        gap: 1.5,
        py: 2,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'grid', gap: 0.35 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>
            {formatPeriod(section.periodStart, section.periodEnd)}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
            {section.docNumber}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
            {section.invoiceId === null ? 'Invoice pending' : `Invoice ${section.invoiceId}`}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', justifyItems: 'end', gap: 0.35 }}>
          <Typography sx={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
            {section.plutusStatus}
          </Typography>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>
            {section.settlementTotal === null ? '—' : formatMoney(section.settlementTotal, currency)}
          </Typography>
        </Box>
      </Box>

      {section.blockMessages.map((message) => (
        <Typography
          key={`${section.qboJournalEntryId}:${message}`}
          color={section.blockState === 'blocked' ? 'warning.main' : 'text.secondary'}
          sx={{ fontSize: '0.8rem' }}
        >
          {message}
        </Typography>
      ))}

      {section.resolutionMessage === null ? null : (
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {section.resolutionMessage}
        </Typography>
      )}

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Account</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => {
              const signedAmount = line.postingType === 'Debit' ? line.amount : -line.amount;
              return (
                <TableRow key={`${section.qboJournalEntryId}:${line.id ?? index}`}>
                  <TableCell>{line.description === '' ? '—' : line.description}</TableCell>
                  <TableCell>{line.accountFullyQualifiedName ?? line.accountName}</TableCell>
                  <TableCell align="right">{formatMoney(signedAmount, currency)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      <Box
        component="footer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          pt: 0.5,
        }}
      >
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Posting total</Typography>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
          {section.settlementTotal === null ? '—' : formatMoney(section.settlementTotal, currency)}
        </Typography>
      </Box>
    </Box>
  );
}
