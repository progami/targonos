import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Box,
  Divider,
  GlobalStyles,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import {
  readCaseReportBundle,
  type CaseReportBundle,
  type CaseReportMarketSlug,
  type CaseReportRow,
  type CaseReportSection,
} from '@/lib/cases/reader';

export const dynamic = 'force-dynamic';

type CaseReportPageProps = {
  params: Promise<{
    market: string;
    reportDate: string;
  }>;
};

const MARKET_LINKS = [
  { slug: 'us', label: 'USA - Dust Sheets' },
  { slug: 'uk', label: 'UK - Dust Sheets' },
] as const;

function categoryTone(category: string) {
  if (category === 'Action due') {
    return {
      color: '#9f1d12',
      tint: 'rgba(191, 36, 27, 0.12)',
      line: 'rgba(191, 36, 27, 0.35)',
    };
  }

  if (category === 'Forum watch') {
    return {
      color: '#8f5d00',
      tint: 'rgba(191, 125, 0, 0.12)',
      line: 'rgba(191, 125, 0, 0.3)',
    };
  }

  if (category === 'New case') {
    return {
      color: '#005f73',
      tint: 'rgba(0, 118, 133, 0.12)',
      line: 'rgba(0, 118, 133, 0.28)',
    };
  }

  return {
    color: '#0b5c58',
    tint: 'rgba(0, 194, 185, 0.12)',
    line: 'rgba(0, 194, 185, 0.26)',
  };
}

function summarizeRows(sections: CaseReportSection[]) {
  const rows = sections.flatMap((section) => section.rows);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return {
    totalRows: rows.length,
    actionDue: counts.get('Action due') ?? 0,
    watching: counts.get('Watching') ?? 0,
    forumWatch: counts.get('Forum watch') ?? 0,
    newCase: counts.get('New case') ?? 0,
  };
}

function formatGeneratedAt(value: string | null): string {
  if (value === null) {
    return 'Shared drive state available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function DetailBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        borderLeft: '1px solid',
        borderColor: accent ? 'rgba(0, 194, 185, 0.34)' : 'divider',
        pl: 1.5,
      }}
    >
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: accent ? '#0b5c58' : 'text.secondary',
          fontSize: '0.66rem',
          letterSpacing: '0.14em',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.45,
          fontSize: '0.95rem',
          lineHeight: 1.7,
          color: 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function MetaItem({
  label,
  value,
  monospace,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: 'text.secondary',
          fontSize: '0.62rem',
          letterSpacing: '0.14em',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.25,
          fontSize: '0.9rem',
          fontFamily: monospace ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function CaseRow({
  row,
  index,
}: {
  row: CaseReportRow;
  index: number;
}) {
  const tone = categoryTone(row.category);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '210px minmax(0, 1fr)' },
        gap: { xs: 2, md: 3 },
        py: 2.75,
        borderTop: '1px solid',
        borderColor: alpha('#002c51', 0.08),
        animation: 'caseBriefRise 560ms cubic-bezier(0.18, 0.8, 0.22, 1) both',
        animationDelay: `${140 + index * 48}ms`,
      }}
    >
      <Stack
        spacing={1.25}
        sx={{
          pr: { md: 2 },
        }}
      >
        <Box
          sx={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            px: 1.3,
            py: 0.6,
            borderRadius: 999,
            bgcolor: tone.tint,
            color: tone.color,
            fontSize: '0.76rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {row.category}
        </Box>
        <MetaItem label="Case ID" value={row.caseId} monospace />
        <MetaItem label="Days ago" value={row.daysAgo} />
        <MetaItem label="Status" value={row.status} />
      </Stack>

      <Stack spacing={1.8} sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: { xs: '1.12rem', md: '1.42rem' },
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: '-0.045em',
            maxWidth: '20ch',
          }}
        >
          {row.issue}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          <DetailBlock label="Evidence" value={row.evidence} />
          <DetailBlock label="Assessment" value={row.assessment} />
          <DetailBlock label="Next step" value={row.nextStep} accent />
        </Box>
      </Stack>
    </Box>
  );
}

function CaseSection({
  section,
  rowOffset,
}: {
  section: CaseReportSection;
  rowOffset: number;
}) {
  return (
    <Box sx={{ mb: 4.5 }}>
      <Box
        sx={{
          position: 'sticky',
          top: { xs: 74, md: 92 },
          zIndex: 2,
          py: 1.1,
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: alpha('#002c51', 0.12),
          bgcolor: 'background.paper',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography
            variant="overline"
            sx={{
              color: 'text.secondary',
              fontSize: '0.68rem',
              letterSpacing: '0.18em',
            }}
          >
            {section.entity}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.86rem' }}>
            {section.rows.length} item{section.rows.length === 1 ? '' : 's'}
          </Typography>
        </Stack>
      </Box>

      {section.rows.map((row, index) => (
        <CaseRow key={`${section.entity}-${row.caseId}-${index}`} row={row} index={rowOffset + index} />
      ))}
    </Box>
  );
}

function ReportPage({ bundle }: { bundle: CaseReportBundle }) {
  const summary = summarizeRows(bundle.sections);

  return (
    <>
      <GlobalStyles
        styles={{
          '@keyframes caseBriefRise': {
            '0%': { opacity: 0, transform: 'translate3d(0, 18px, 0)' },
            '100%': { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          },
        }}
      />

      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '1px solid',
          borderColor: alpha('#002c51', 0.12),
          pb: 4,
          mb: 4,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(circle at top right, rgba(0, 194, 185, 0.16), transparent 28%), linear-gradient(180deg, rgba(0, 44, 81, 0.05), rgba(0, 44, 81, 0))',
          }}
        />

        <Stack spacing={3} sx={{ position: 'relative' }}>
          <Stack
            direction={{ xs: 'column', xl: 'row' }}
            justifyContent="space-between"
            spacing={3}
            sx={{
              animation: 'caseBriefRise 620ms cubic-bezier(0.18, 0.8, 0.22, 1) both',
            }}
          >
            <Box sx={{ maxWidth: 760 }}>
              <Typography
                variant="overline"
                sx={{
                  display: 'block',
                  color: 'text.secondary',
                  fontSize: '0.72rem',
                  letterSpacing: '0.16em',
                }}
              >
                {bundle.marketLabel}
              </Typography>
              <Typography
                sx={{
                  mt: 1.1,
                  fontSize: { xs: '2.3rem', md: '3.5rem' },
                  lineHeight: 0.96,
                  letterSpacing: '-0.07em',
                  fontWeight: 700,
                  fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
                }}
              >
                {bundle.reportDate}
              </Typography>
              <Typography
                sx={{
                  mt: 1.6,
                  maxWidth: '60ch',
                  color: 'text.secondary',
                  fontSize: '1rem',
                  lineHeight: 1.75,
                }}
              >
                Daily Seller Central case brief rendered from the shared-drive markdown report and
                machine state. Open the brief from Chat, scan the active issues fast, then drop into
                the tracked case files only when the narrative says it is worth doing.
              </Typography>
            </Box>

            <Stack spacing={1.1} sx={{ minWidth: { xl: 260 } }}>
              {MARKET_LINKS.map((market) => {
                const active = market.slug === bundle.marketSlug;
                return (
                  <Link
                    key={market.slug}
                    href={`/cases/${market.slug}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Box
                      sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1.5,
                      py: 1.15,
                      borderRadius: 999,
                      textDecoration: 'none',
                      border: '1px solid',
                      borderColor: active ? 'rgba(0, 194, 185, 0.34)' : 'divider',
                      bgcolor: active ? 'rgba(0, 194, 185, 0.08)' : 'transparent',
                      color: active ? 'text.primary' : 'text.secondary',
                      transition: 'background-color 160ms ease, border-color 160ms ease',
                      '&:hover': {
                        bgcolor: active ? 'rgba(0, 194, 185, 0.12)' : 'action.hover',
                      },
                      }}
                    >
                      <Typography sx={{ fontWeight: 600 }}>{market.label}</Typography>
                      <ArrowOutwardIcon sx={{ fontSize: 18 }} />
                    </Box>
                  </Link>
                );
              })}
            </Stack>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
              gap: 2,
              pt: 1,
              animation: 'caseBriefRise 620ms cubic-bezier(0.18, 0.8, 0.22, 1) both',
              animationDelay: '120ms',
            }}
          >
            <Metric label="Tracked issues" value={String(summary.totalRows)} />
            <Metric label="Action due" value={String(summary.actionDue)} accent />
            <Metric label="Watching" value={String(summary.watching)} />
            <Metric label="Forum watch" value={String(summary.forumWatch)} />
            <Metric label="State synced" value={formatGeneratedAt(bundle.generatedAt)} detail />
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              animation: 'caseBriefRise 620ms cubic-bezier(0.18, 0.8, 0.22, 1) both',
              animationDelay: '180ms',
            }}
          >
            {bundle.availableReportDates.slice(0, 10).map((reportDate) => {
              const active = reportDate === bundle.reportDate;
              return (
                <Link
                  key={reportDate}
                  href={`/cases/${bundle.marketSlug}/${reportDate}`}
                  style={{ textDecoration: 'none' }}
                >
                  <Box
                    sx={{
                    px: 1.25,
                    py: 0.72,
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: active ? 'rgba(0, 44, 81, 0.26)' : 'divider',
                    bgcolor: active ? 'rgba(0, 44, 81, 0.06)' : 'background.paper',
                    textDecoration: 'none',
                    color: active ? 'text.primary' : 'text.secondary',
                    fontSize: '0.84rem',
                    }}
                  >
                    {reportDate}
                  </Box>
                </Link>
              );
            })}
          </Box>
        </Stack>
      </Box>

      {bundle.sections.map((section, index) => {
        const rowOffset = bundle.sections
          .slice(0, index)
          .reduce((total, currentSection) => total + currentSection.rows.length, 0);
        return <CaseSection key={section.entity} section={section} rowOffset={rowOffset} />;
      })}

      <Divider sx={{ mt: 1, mb: 2 }} />

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.2}
        justifyContent="space-between"
        sx={{ color: 'text.secondary' }}
      >
        <Typography sx={{ fontSize: '0.88rem' }}>
          Markdown backend stays in Shared Drives. Argus is only the authenticated reading surface.
        </Typography>
        <Typography sx={{ fontSize: '0.88rem' }}>
          {bundle.trackedCaseIds.length} tracked case ID{bundle.trackedCaseIds.length === 1 ? '' : 's'} in state.
        </Typography>
      </Stack>
    </>
  );
}

function Metric({
  label,
  value,
  accent,
  detail,
}: {
  label: string;
  value: string;
  accent?: boolean;
  detail?: boolean;
}) {
  return (
    <Box
      sx={{
        pt: 1.1,
        borderTop: '1px solid',
        borderColor: accent ? 'rgba(0, 194, 185, 0.34)' : alpha('#002c51', 0.12),
      }}
    >
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: 'text.secondary',
          fontSize: '0.64rem',
          letterSpacing: '0.14em',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.55,
          fontSize: detail ? '0.95rem' : { xs: '1.55rem', md: '1.85rem' },
          lineHeight: 1.06,
          letterSpacing: detail ? '-0.02em' : '-0.06em',
          fontWeight: detail ? 600 : 700,
          color: accent ? '#0b5c58' : 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default async function DatedCaseReportPage({ params }: CaseReportPageProps) {
  const { market, reportDate } = await params;

  let bundle: CaseReportBundle;
  try {
    bundle = await readCaseReportBundle(market as CaseReportMarketSlug, reportDate);
  } catch {
    notFound();
  }

  return <ReportPage bundle={bundle} />;
}
