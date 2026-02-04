'use client'

import { useEffect, useState } from 'react'
import { HRCalendarApi, type HRCalendarEvent } from '@/lib/api-client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/card'
import { CalendarIcon, SpinnerIcon } from '@/components/ui/Icons'

// Simplified for small team (15-20 people)
const EVENT_TYPE_LABELS: Record<string, string> = {
  PERFORMANCE_REVIEW: 'Performance Review',
  PROBATION_END: 'Probation End',
  PIP_REVIEW: 'PIP Review',
  DISCIPLINARY_HEARING: 'Disciplinary Hearing',
  INTERVIEW: 'Interview',
  TRAINING: 'Training',
  COMPANY_EVENT: 'Company Event',
  HOLIDAY: 'Holiday',
  OTHER: 'Other',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  PERFORMANCE_REVIEW: 'bg-accent/10 text-accent border-accent/20',
  PROBATION_END: 'bg-warning-100 text-warning-700 border-warning-200',
  PIP_REVIEW: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  DISCIPLINARY_HEARING: 'bg-danger-100 text-danger-700 border-danger-200',
  INTERVIEW: 'bg-brand-teal-500/10 text-brand-teal-700 border-brand-teal-500/20',
  TRAINING: 'bg-brand-navy-500/10 text-brand-navy-700 border-brand-navy-500/20',
  COMPANY_EVENT: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  HOLIDAY: 'bg-success-100 text-success-700 border-success-200',
  OTHER: 'bg-muted text-foreground border-border',
}

function getEventTypeLabel(eventType: string): string {
  const label = EVENT_TYPE_LABELS[eventType]
  return label ? label : eventType
}

function getEventTypeClass(eventType: string): string {
  const cls = EVENT_TYPE_COLORS[eventType]
  return cls ? cls : EVENT_TYPE_COLORS.OTHER
}

function formatDate(dateString: string, allDay?: boolean): string {
  const date = new Date(dateString)
  if (allDay) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateRange(start: string, end?: string | null, allDay?: boolean): string {
  const startStr = formatDate(start, allDay)
  if (!end) return startStr

  const startDate = new Date(start)
  const endDate = new Date(end)

  // Same day
  if (startDate.toDateString() === endDate.toDateString()) {
    if (allDay) return startStr
    return `${startStr} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }

  return `${startStr} - ${formatDate(end, allDay)}`
}

function groupEventsByMonth(events: HRCalendarEvent[]): Record<string, HRCalendarEvent[]> {
  const grouped: Record<string, HRCalendarEvent[]> = {}

  events.forEach(event => {
    const date = new Date(event.startDate)
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    if (!grouped[label]) {
      grouped[label] = []
    }
    grouped[label].push(event)
  })

  return grouped
}

export default function HRCalendarPage() {
  const [events, setEvents] = useState<HRCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadEvents() {
      try {
        setLoading(true)
        // Get events from 30 days ago to 90 days ahead
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - 30)
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + 90)

        const { items } = await HRCalendarApi.list({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          take: 100,
        })
        setEvents(items)
      } catch (e: unknown) {
        if (e instanceof Error && e.message) setError(e.message)
        else setError('Failed to load calendar events')
      } finally {
        setLoading(false)
      }
    }
    loadEvents()
  }, [])

  const groupedEvents = groupEventsByMonth(events)
  const upcomingEvents = events.filter(e => new Date(e.startDate) >= new Date())

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Calendar"
        description="Company events, reviews, interviews, and important dates"
        icon={<CalendarIcon className="h-6 w-6 text-white" />}
        showBack
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <SpinnerIcon className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : error ? (
        <Card padding="lg">
          <div className="text-center py-8">
            <p className="text-danger-600">{error}</p>
          </div>
        </Card>
      ) : events.length === 0 ? (
        <Card padding="lg">
          <div className="text-center py-12">
            <CalendarIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">No Events</h3>
            <p className="text-muted-foreground">There are no HR calendar events scheduled.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Upcoming Events Summary */}
          {upcomingEvents.length > 0 && (
            <Card padding="lg">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                Upcoming Events ({upcomingEvents.length})
              </h2>
              <div className="space-y-3">
                {upcomingEvents.slice(0, 5).map(event => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{event.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${getEventTypeClass(event.eventType)}`}>
                          {getEventTypeLabel(event.eventType)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDateRange(event.startDate, event.endDate, event.allDay)}
                      </p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* All Events by Month */}
          <Card padding="lg">
            <h2 className="text-sm font-semibold text-foreground mb-4">All Events</h2>
            <div className="space-y-6">
              {Object.entries(groupedEvents).map(([month, monthEvents]) => (
                <div key={month}>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    {month}
                  </h3>
                  <div className="space-y-2">
                    {monthEvents.map(event => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="w-12 text-center flex-shrink-0">
                          <div className="text-lg font-bold text-foreground">
                            {new Date(event.startDate).getDate()}
                          </div>
                          <div className="text-xs text-muted-foreground uppercase">
                            {new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{event.title}</span>
                            <span className={`text-xs px-2 py-0.5 rounded border ${getEventTypeClass(event.eventType)}`}>
                              {getEventTypeLabel(event.eventType)}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-sm text-muted-foreground truncate">{event.description}</p>
                          )}
                        </div>
                        {!event.allDay && (
                          <div className="text-xs text-muted-foreground flex-shrink-0">
                            {new Date(event.startDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
