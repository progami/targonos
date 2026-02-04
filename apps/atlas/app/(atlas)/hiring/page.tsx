'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { HiringCandidatesApi, HiringInterviewsApi, type HiringCandidate, type HiringInterview } from '@/lib/api-client'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { DataTable } from '@/components/ui/DataTable'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResultsCount } from '@/components/ui/table'
import { StatusBadge } from '@/components/ui/badge'
import { UserPlusIcon } from '@/components/ui/Icons'
import { usePageState } from '@/lib/store/page-state'

function formatDateTime(dateStr: string, timeZone: string) {
  const date = new Date(dateStr)
  return `${date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} (${timeZone})`
}

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  PHONE_SCREEN: 'Phone screen',
  TECHNICAL: 'Technical',
  CULTURE: 'Culture',
  FINAL: 'Final',
  OTHER: 'Other',
}

export default function HiringPage() {
  const router = useRouter()
  const { activeTab, setActiveTab } = usePageState('/hiring')
  const tab = activeTab === 'candidates' ? 'candidates' : 'interviews'

  const [interviews, setInterviews] = useState<HiringInterview[]>([])
  const [candidates, setCandidates] = useState<HiringCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const scheduleHref = '/hiring/schedule'

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [interviewsRes, candidatesRes] = await Promise.all([
        HiringInterviewsApi.list({ upcoming: true, take: 100 }),
        HiringCandidatesApi.list({ take: 100 }),
      ])
      setInterviews(interviewsRes.items)
      setCandidates(candidatesRes.items)
    } catch (e) {
      console.error('Failed to load hiring data', e)
      setError(e instanceof Error ? e.message : 'Failed to load hiring data')
      setInterviews([])
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const interviewColumns = useMemo<ColumnDef<HiringInterview>[]>(
    () => [
      {
        accessorKey: 'candidate',
        header: 'Candidate',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.candidate.fullName}</p>
            {row.original.candidate.role ? (
              <p className="text-xs text-muted-foreground mt-0.5">{row.original.candidate.role}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'startAt',
        header: 'When',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.startAt, row.original.timeZone)}
          </span>
        ),
      },
      {
        accessorKey: 'interviewers',
        header: 'Interviewers',
        cell: ({ row }) => {
          const names = row.original.interviewers
            .map((interviewer) => `${interviewer.employee.firstName} ${interviewer.employee.lastName}`.trim())
            .filter((name) => name.length > 0)
            .join(', ')
          const label = names.length > 0 ? names : '—'
          return <span className="text-muted-foreground">{label}</span>
        },
      },
      {
        accessorKey: 'interviewType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {INTERVIEW_TYPE_LABELS[row.original.interviewType] ?? row.original.interviewType}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'links',
        header: 'Links',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const meetingLink = row.original.meetingLink ?? null
          const calendarLink = row.original.googleHtmlLink ?? null
          const showCalendarOnly = meetingLink && calendarLink && meetingLink === calendarLink

          return (
            <div className="flex justify-end gap-2">
              {!showCalendarOnly && meetingLink ? (
                <a
                  href={meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Meet
                </a>
              ) : null}
              {calendarLink ? (
                <a
                  href={calendarLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Calendar
                </a>
              ) : null}
            </div>
          )
        },
      },
    ],
    []
  )

  const candidateColumns = useMemo<ColumnDef<HiringCandidate>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Candidate',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            {row.original.email ? (
              <p className="text-xs text-muted-foreground mt-0.5">{row.original.email}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.role ? row.original.role : '—'}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'nextInterview',
        header: 'Next interview',
        cell: ({ row }) => {
          const next = row.original.interviews?.[0]
          if (!next) return <span className="text-muted-foreground">—</span>
          return <span className="text-muted-foreground">{formatDateTime(next.startAt, next.timeZone)}</span>
        },
      },
    ],
    []
  )

  const handleCandidateRowClick = useCallback(
    (candidate: HiringCandidate) => {
      const qp = new URLSearchParams()
      qp.set('fullName', candidate.fullName)
      if (candidate.email) qp.set('email', candidate.email)
      if (candidate.role) qp.set('role', candidate.role)
      router.push(`${scheduleHref}?${qp.toString()}`)
    },
    [router]
  )

  return (
    <>
      <ListPageHeader
        title="Hiring"
        description="Lightweight ATS — candidates and interviews"
        icon={<UserPlusIcon className="h-6 w-6 text-white" />}
        action={<Button href={scheduleHref}>Schedule Interview</Button>}
      />

      <div className="space-y-6">
        {error ? (
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Card padding="md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Upcoming interviews live here. Click a candidate to prefill the scheduling form.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={load} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>
        </Card>

        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="interviews">Interviews</TabsTrigger>
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
          </TabsList>

          <TabsContent value="interviews" className="space-y-4">
            <ResultsCount count={interviews.length} singular="interview" plural="interviews" loading={loading} />
            <DataTable
              columns={interviewColumns}
              data={interviews}
              loading={loading}
              skeletonRows={6}
              addRow={{ label: 'Schedule Interview', onClick: () => router.push(scheduleHref) }}
              emptyState={
                <TableEmptyContent
                  icon={<UserPlusIcon className="h-10 w-10" />}
                  title="No interviews scheduled"
                  description="Schedule an interview to get started."
                  action={{ label: 'Schedule Interview', href: scheduleHref }}
                />
              }
            />
          </TabsContent>

          <TabsContent value="candidates" className="space-y-4">
            <ResultsCount count={candidates.length} singular="candidate" plural="candidates" loading={loading} />
            <DataTable
              columns={candidateColumns}
              data={candidates}
              loading={loading}
              skeletonRows={6}
              onRowClick={handleCandidateRowClick}
              addRow={{ label: 'Schedule Interview', onClick: () => router.push(scheduleHref) }}
              emptyState={
                <TableEmptyContent
                  icon={<UserPlusIcon className="h-10 w-10" />}
                  title="No candidates yet"
                  description="Schedule an interview to create your first candidate."
                  action={{ label: 'Schedule Interview', href: scheduleHref }}
                />
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

