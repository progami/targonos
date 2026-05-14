'use client';

import { useQuery } from '@tanstack/react-query';
import FactCheckIcon from '@mui/icons-material/FactCheck';
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

type PostingIntent = {
  id: string;
  sourceType: string;
  sourceId: string;
  market: string;
  periodStart: string | null;
  periodEnd: string | null;
  sourceHash: string;
  mappingVersion: string;
  postingHash: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type LineFingerprint = {
  id: string;
  qboLineId: string;
  expectedLineHash: string;
  liveLineHash: string | null;
  driftStatus: string;
  createdAt: string;
  updatedAt: string;
};

type QboPosting = {
  id: string;
  qboTxnType: string;
  qboTxnId: string;
  qboSyncToken: string | null;
  qboDocNumber: string | null;
  qboPrivateNote: string | null;
  qboTxnDate: string | null;
  postingHash: string;
  driftStatus: string;
  attachmentStatus: string;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceType: string;
  sourceId: string;
  market: string;
  lineCount: number;
  postingIntent: PostingIntent;
  lineFingerprints: LineFingerprint[];
};

type QboAuditResponse = {
  postings: QboPosting[];
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

async function fetchQboAudit(): Promise<QboAuditResponse> {
  const res = await fetch(`${basePath}/api/plutus/qbo-audit`);
  const data = (await res.json()) as QboAuditResponse | { error?: string };

  if (!res.ok) {
    if ('error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    throw new Error('Failed to load QBO audit');
  }

  return data as QboAuditResponse;
}

function formatDate(value: string | null) {
  if (value === null) return '-';

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function compactHash(hash: string) {
  return hash.slice(0, 12);
}

function formatPeriod(intent: PostingIntent) {
  if (intent.periodStart === null && intent.periodEnd === null) return '-';
  if (intent.periodStart === null) return intent.periodEnd;
  if (intent.periodEnd === null) return intent.periodStart;
  return `${intent.periodStart} to ${intent.periodEnd}`;
}

function DriftChip({ status }: { status: string }) {
  const normalized = status.trim();
  const inSync = normalized === 'in_sync';
  const unchecked = normalized === 'unchecked';
  const color = inSync ? 'success.dark' : unchecked ? 'text.secondary' : 'error.dark';
  const borderColor = inSync ? 'rgba(34, 197, 94, 0.45)' : unchecked ? 'divider' : 'rgba(239, 68, 68, 0.35)';
  const backgroundColor = inSync ? 'rgba(34, 197, 94, 0.08)' : unchecked ? 'background.paper' : 'rgba(239, 68, 68, 0.05)';

  return (
    <Chip
      label={status}
      size="small"
      variant="outlined"
      sx={{ borderColor, color, bgcolor: backgroundColor }}
    />
  );
}

function AttachmentChip({ status }: { status: string }) {
  const missing = status === 'missing';

  return (
    <Chip
      label={status}
      size="small"
      variant="outlined"
      sx={{
        borderColor: missing ? 'rgba(245, 158, 11, 0.45)' : 'divider',
        color: missing ? 'warning.dark' : 'text.secondary',
        bgcolor: missing ? 'rgba(245, 158, 11, 0.08)' : 'background.paper',
      }}
    />
  );
}

function LineSummary({ lineCount, lines }: { lineCount: number; lines: LineFingerprint[] }) {
  const driftedCount = lines.filter((line) => line.driftStatus !== 'in_sync').length;
  const label = `${lineCount} lines`;
  const detail = driftedCount === 0 ? 'all in sync' : `${driftedCount} needs review`;

  return (
    <Box sx={{ display: 'grid', gap: 0.25 }}>
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
        {label}
      </Typography>
      <Typography sx={quietTextSx}>{detail}</Typography>
    </Box>
  );
}

export function QboAuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-qbo-audit'],
    queryFn: fetchQboAudit,
    staleTime: 30 * 1000,
  });

  const postings = data ? data.postings : [];

  return (
    <Box component="main" sx={{ mx: 'auto', maxWidth: 1280, px: { xs: 2, sm: 3, lg: 4 }, py: 3 }}>
      <PageHeader title="QBO Audit" kicker="Subledger" />

      <Box sx={tableWrapSx}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Updated</TableCell>
                <TableCell sx={headCellSx}>QBO Txn</TableCell>
                <TableCell sx={headCellSx}>Intent</TableCell>
                <TableCell sx={headCellSx}>Drift</TableCell>
                <TableCell sx={headCellSx}>Attachment</TableCell>
                <TableCell sx={headCellSx}>Lines</TableCell>
                <TableCell sx={headCellSx}>Hash</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7} sx={{ py: 1.5 }}>
                        <Skeleton height={34} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}

              {!isLoading && error && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 5, textAlign: 'center', color: 'error.main' }}>
                    {error instanceof Error ? error.message : String(error)}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && postings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      icon={<FactCheckIcon sx={{ fontSize: 40 }} />}
                      title="No QBO postings tracked"
                      description="Posting drift and attachment state will appear after QBO traces are recorded."
                    />
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !error && postings.map((posting) => (
                <TableRow key={posting.id}>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
                      {formatDate(posting.updatedAt)}
                    </Typography>
                    <Typography sx={quietTextSx}>
                      Checked {formatDate(posting.lastCheckedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                      {posting.qboTxnType} {posting.qboTxnId}
                    </Typography>
                    <Typography sx={quietTextSx}>
                      {posting.qboDocNumber === null ? '-' : posting.qboDocNumber}
                    </Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
                      {posting.sourceType} {posting.sourceId}
                    </Typography>
                    <Typography sx={quietTextSx}>
                      {posting.market} / {formatPeriod(posting.postingIntent)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <DriftChip status={posting.driftStatus} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <AttachmentChip status={posting.attachmentStatus} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <LineSummary lineCount={posting.lineCount} lines={posting.lineFingerprints} />
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                      {compactHash(posting.postingHash)}
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
