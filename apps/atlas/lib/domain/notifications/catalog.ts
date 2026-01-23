export type NotificationCatalogInput = {
  type: string
  title: string
  link?: string | null
  relatedType?: string | null
  relatedId?: string | null
}

export type NotificationCatalogEntry = {
  category: string
  actionRequired: boolean
  deepLink: string | null
  dedupeKey: string | null
  emailSubject: string
  isReminder: boolean
}

const RELATED_TYPE_CATEGORY: Record<string, string> = {
  POLICY: 'Policy',
  REVIEW: 'Performance Review',
  QUARTERLY_CYCLE: 'Quarterly Review',
  DISCIPLINARY: 'Violation',
  LEAVE: 'Leave',
  TASK: 'Task',
  RESOURCE: 'Resource',
  EMPLOYEE: 'Org',
  CASE: 'Case',
}

const TYPE_RULES: Record<
  string,
  {
    category: string
    actionRequired: boolean
    isReminder?: boolean
  }
> = {
  // Policies
  POLICY_CREATED: { category: 'Policy', actionRequired: false },
  POLICY_UPDATED: { category: 'Policy', actionRequired: false },
  POLICY_ARCHIVED: { category: 'Policy', actionRequired: false },

  // Profile / org
  PROFILE_INCOMPLETE: { category: 'Profile', actionRequired: true, isReminder: true },
  HIERARCHY_CHANGED: { category: 'Org', actionRequired: false },

  // Performance reviews
  REVIEW_SUBMITTED: { category: 'Performance Review', actionRequired: false },
  REVIEW_PENDING_HR: { category: 'Performance Review', actionRequired: true, isReminder: true },
  REVIEW_PENDING_ADMIN: { category: 'Performance Review', actionRequired: true, isReminder: true },
  REVIEW_APPROVED: { category: 'Performance Review', actionRequired: true, isReminder: true },
  REVIEW_REJECTED: { category: 'Performance Review', actionRequired: true, isReminder: true },
  REVIEW_ACKNOWLEDGED: { category: 'Performance Review', actionRequired: false },

  // Disciplinary / cases
  DISCIPLINARY_CREATED: { category: 'Violation', actionRequired: false },
  DISCIPLINARY_UPDATED: { category: 'Violation', actionRequired: false },
  VIOLATION_PENDING_HR: { category: 'Violation', actionRequired: true, isReminder: true },
  VIOLATION_PENDING_ADMIN: { category: 'Violation', actionRequired: true, isReminder: true },
  VIOLATION_APPROVED: { category: 'Violation', actionRequired: true, isReminder: true },
  VIOLATION_REJECTED: { category: 'Violation', actionRequired: true, isReminder: true },
  VIOLATION_ACKNOWLEDGED: { category: 'Violation', actionRequired: false },

  // Appeals
  APPEAL_PENDING_HR: { category: 'Violation', actionRequired: true, isReminder: true },
  APPEAL_PENDING_ADMIN: { category: 'Violation', actionRequired: true, isReminder: true },
  APPEAL_DECIDED: { category: 'Violation', actionRequired: true },

  // Leave
  LEAVE_REQUESTED: { category: 'Leave', actionRequired: true, isReminder: true },
  LEAVE_APPROVED: { category: 'Leave', actionRequired: false },
  LEAVE_REJECTED: { category: 'Leave', actionRequired: false },
  LEAVE_CANCELLED: { category: 'Leave', actionRequired: false },

  // Resources
  RESOURCE_CREATED: { category: 'Resource', actionRequired: false },

  // Quarterly reviews
  QUARTERLY_REVIEW_CREATED: { category: 'Quarterly Review', actionRequired: true, isReminder: true },
  QUARTERLY_REVIEW_REMINDER: { category: 'Quarterly Review', actionRequired: true, isReminder: true },
  QUARTERLY_REVIEW_OVERDUE: { category: 'Quarterly Review', actionRequired: true, isReminder: true },
  QUARTERLY_REVIEW_ESCALATED: { category: 'Quarterly Review', actionRequired: true, isReminder: true },

  // System
  ANNOUNCEMENT: { category: 'Announcement', actionRequired: false },
  SYSTEM: { category: 'System', actionRequired: false },
}

function subjectFor(category: string, title: string, actionRequired: boolean): string {
  return actionRequired ? `Action required: ${category} — ${title}` : `Atlas: ${category} — ${title}`
}

function deriveCategory(input: NotificationCatalogInput): string {
  const typeRule = TYPE_RULES[input.type]
  if (typeRule) return typeRule.category

  if (input.relatedType && RELATED_TYPE_CATEGORY[input.relatedType]) {
    return RELATED_TYPE_CATEGORY[input.relatedType]!
  }

  const title = input.title.toLowerCase()
  if (title.includes('policy')) return 'Policy'
  if (title.includes('review')) return 'Performance Review'
  if (title.includes('quarter')) return 'Quarterly Review'
  if (title.includes('violation') || title.includes('disciplinary') || title.includes('appeal')) return 'Violation'
  if (title.includes('leave')) return 'Leave'
  if (title.includes('task')) return 'Task'
  if (title.includes('case')) return 'Case'

  return 'Notification'
}

function deriveActionRequired(input: NotificationCatalogInput): boolean {
  const typeRule = TYPE_RULES[input.type]
  if (typeRule) return typeRule.actionRequired

  const t = input.type
  if (t.includes('PENDING') || t.includes('OVERDUE') || t.includes('ESCALATED')) return true
  if (t.includes('ACK') || t.includes('APPROVAL')) return true

  const title = input.title.toLowerCase()
  return (
    title.includes('pending') ||
    title.includes('required') ||
    title.includes('overdue') ||
    title.includes('acknowledge') ||
    title.includes('approval') ||
    title.includes('reminder')
  )
}

function deriveIsReminder(input: NotificationCatalogInput): boolean {
  const typeRule = TYPE_RULES[input.type]
  if (typeRule?.isReminder) return true

  const title = input.title.toLowerCase()
  if (title.includes('reminder') || title.includes('overdue')) return true
  if (input.type.includes('REMINDER') || input.type.includes('OVERDUE') || input.type.includes('ESCALATED')) return true
  return false
}

function deriveDeepLink(input: NotificationCatalogInput): string | null {
  if (input.link) return input.link

  if (input.relatedType && input.relatedId) {
    if (input.relatedType === 'CASE') return '/hub'

    const map: Record<string, string> = {
      POLICY: '/policies',
      REVIEW: '/performance/reviews',
      DISCIPLINARY: '/performance/violations',
      LEAVE: '/leaves',
      TASK: '/tasks',
      RESOURCE: '/resources',
      EMPLOYEE: '/employees',
    }
    const base = map[input.relatedType]
    if (base) return `${base}/${input.relatedId}`
  }

  return null
}

function deriveDedupeKey(input: NotificationCatalogInput): string | null {
  if (input.relatedType && input.relatedId) return `${input.type}:${input.relatedType}:${input.relatedId}`
  if (input.type) return input.type
  return null
}

export function getNotificationCatalogEntry(input: NotificationCatalogInput): NotificationCatalogEntry {
  const category = deriveCategory(input)
  const actionRequired = deriveActionRequired(input)
  const deepLink = deriveDeepLink(input)
  const dedupeKey = deriveDedupeKey(input)
  const isReminder = deriveIsReminder(input)

  return {
    category,
    actionRequired,
    deepLink,
    dedupeKey,
    emailSubject: subjectFor(category, input.title, actionRequired),
    isReminder,
  }
}
