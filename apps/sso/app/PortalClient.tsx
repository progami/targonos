'use client'

import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'

import type { AppDef } from '@/lib/apps'
import { getAppIcon } from '@/components/app-icons'

import styles from './portal.module.css'

type PortalRoleMap = Record<string, { departments?: string[]; depts?: string[] }>

export type PortalAppCard = AppDef & {
  launchError?: string
  launchUrl?: string
}

type AppStateTone = 'locked' | 'muted' | 'public' | 'standard'

type AppState = {
  actionText: string
  isDevLifecycle: boolean
  isDisabled: boolean
  isEntitled: boolean
  isPublicEntry: boolean
  tone: AppStateTone
}

type CategorySection = {
  apps: PortalAppCard[]
  category: string
  lead: string
  readyCount: number
  totalCount: number
}

const CATEGORY_ORDER = [
  'Ops',
  'Product',
  'Sales / Marketing',
  'Account / Listing',
  'HR / Admin',
  'Finance',
  'Legal',
]

const CATEGORY_COPY: Record<string, string> = {
  Ops: 'Execution surfaces for warehouse, inventory, and order movement.',
  Product: 'Planning, forecasting, and system workspaces for active decision making.',
  'Sales / Marketing': 'Commercial surfaces that support demand shaping and campaign work.',
  'Account / Listing': 'Marketplace control points for catalog, account, and listing operations.',
  'HR / Admin': 'People, payroll, and administrative workflows.',
  Finance: 'Cash, accounting, and financial control surfaces.',
  Legal: 'Restricted legal and compliance tools.',
  Other: 'Supporting tools grouped outside the core operating functions.',
}

const OTHER_CATEGORY = 'Other'

const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

type PortalClientProps = {
  accessApps?: PortalAppCard[]
  accessError?: string
  apps: PortalAppCard[]
  isPlatformAdmin?: boolean
  roles?: PortalRoleMap
  session: Session
}

function getGreetingIdentity(session: Session): string | undefined {
  const name = session.user?.name?.trim()
  if (name) {
    return name.split(/\s+/)[0]
  }

  return session.user?.email?.trim()
}

export default function PortalClient({
  session,
  apps,
  accessApps,
  roles,
  isPlatformAdmin,
  accessError,
}: PortalClientProps) {
  const roleMap = roles ?? {}
  const hasApps = apps.length > 0

  const resolveState = (app: PortalAppCard): AppState => {
    const isDevLifecycle = app.lifecycle === 'dev'
    const isPublicEntry = app.entryPolicy === 'public'
    const isEntitled = isPublicEntry || Boolean(isPlatformAdmin) || Boolean(roleMap[app.id])
    const isDisabled = !isEntitled || !app.launchUrl

    if (!isEntitled) {
      return {
        actionText: 'Access required',
        isDevLifecycle,
        isDisabled,
        isEntitled,
        isPublicEntry,
        tone: 'locked',
      }
    }

    if (!app.launchUrl) {
      return {
        actionText: 'Launch unavailable',
        isDevLifecycle,
        isDisabled,
        isEntitled,
        isPublicEntry,
        tone: 'muted',
      }
    }

    if (isPublicEntry) {
      return {
        actionText: 'Open public tool',
        isDevLifecycle,
        isDisabled,
        isEntitled,
        isPublicEntry,
        tone: 'public',
      }
    }

    return {
      actionText: 'Open workspace',
      isDevLifecycle,
      isDisabled,
      isEntitled,
      isPublicEntry,
      tone: 'standard',
    }
  }

  const accessSummaryApps = (accessApps ?? apps).filter((app) => (
    app.lifecycle !== 'dev' || Boolean(roleMap[app.id]) || Boolean(isPlatformAdmin)
  ))
  const hasAccessSummaryApps = accessSummaryApps.length > 0

  const normalizeCategory = (value?: string | null) => {
    const trimmed = value?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : OTHER_CATEGORY
  }

  const appsByCategory = apps.reduce<Record<string, PortalAppCard[]>>((acc, app) => {
    const assigned = roleMap[app.id]?.depts ?? roleMap[app.id]?.departments
    const primaryCategory = normalizeCategory(assigned?.[0] ?? app.category)
    acc[primaryCategory] = acc[primaryCategory]
      ? [...acc[primaryCategory], app]
      : [app]
    return acc
  }, {})

  const orderedCategories = CATEGORY_ORDER.filter((value) => appsByCategory[value]?.length)
    .concat(
      Object.keys(appsByCategory).filter(
        (value) => !CATEGORY_ORDER.includes(value) && appsByCategory[value]?.length
      )
    )

  const rankApp = (app: PortalAppCard) => {
    const state = resolveState(app)
    if (state.isEntitled && !state.isDisabled) {
      return 0
    }
    if (state.isEntitled) {
      return 1
    }
    return 2
  }

  const categorySections: CategorySection[] = orderedCategories.map((category) => {
    const sortedApps = [...(appsByCategory[category] ?? [])].sort((left, right) => {
      const rankDifference = rankApp(left) - rankApp(right)
      if (rankDifference !== 0) {
        return rankDifference
      }

      return left.name.localeCompare(right.name)
    })

    const readyCount = sortedApps.filter((app) => {
      const state = resolveState(app)
      return state.isEntitled && !state.isDisabled
    }).length

    return {
      apps: sortedApps,
      category,
      lead: CATEGORY_COPY[category] ?? CATEGORY_COPY[OTHER_CATEGORY],
      readyCount,
      totalCount: sortedApps.length,
    }
  })

  const readyNowCount = accessSummaryApps.filter((app) => Boolean(app.launchUrl)).length
  const publicToolCount = apps.filter((app) => app.entryPolicy === 'public').length
  const functionalGroupCount = categorySections.length
  const previewApps = accessSummaryApps.slice(0, 8)
  const hiddenPreviewCount = accessSummaryApps.length - previewApps.length
  const greetingIdentity = getGreetingIdentity(session)
  const heroTitle = greetingIdentity ? `Welcome back, ${greetingIdentity}` : 'Welcome back'
  const signedInEmail = session.user?.email?.trim()
  const accessModeLabel = isPlatformAdmin ? 'Platform admin access' : 'Role-scoped access'

  return (
    <div className={styles.container}>
      <div className={styles.headerBar}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <path
                  d="M12 2 2 7l10 5 10-5-10-5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
                <path
                  d="M2 17l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.4"
                />
              </svg>
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandKicker}>TargonOS</span>
              <span className={styles.brandTitle}>Portal launcher</span>
            </div>
          </div>

          <div className={styles.identity}>
            <span className={styles.identityLabel}>{accessModeLabel}</span>
            {signedInEmail ? <span className={styles.identityValue}>{signedInEmail}</span> : null}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.signOut}
              onClick={() => {
                const callbackUrl = `${window.location.origin.replace(/\/$/, '')}/login`
                void signOut({ callbackUrl })
              }}
            >
              Sign out
            </button>
            <img
              className={styles.targonWordmark}
              src={`${assetBasePath}/brand/logo-inverted.svg`}
              alt="Targon"
            />
          </div>
        </header>
      </div>

      <main className={styles.main}>
        {accessError ? (
          <div className={styles.accessError} role="alert">
            {accessError}
          </div>
        ) : null}

        <section className={styles.heroGrid}>
          <div className={styles.heroPanel}>
            <div className={styles.heroEyebrowRow}>
              <span className={styles.heroEyebrow}>Launcher control surface</span>
              {isPlatformAdmin ? <span className={styles.heroChip}>Platform admin</span> : null}
            </div>

            <h1 className={styles.heroTitle}>{heroTitle}</h1>
            <p className={styles.heroCopy}>
              Launch the workspaces you are cleared to use from one signed-in entry point.
              Public tools stay visible, restricted apps stay explicit, and every destination
              opens in a new tab.
            </p>

            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Ready now</span>
                <strong className={styles.metricValue}>{readyNowCount}</strong>
                <span className={styles.metricHint}>launch targets currently available</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Functions</span>
                <strong className={styles.metricValue}>{functionalGroupCount}</strong>
                <span className={styles.metricHint}>launcher groups on this page</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Public tools</span>
                <strong className={styles.metricValue}>{publicToolCount}</strong>
                <span className={styles.metricHint}>visible without role assignment</span>
              </div>
            </div>
          </div>

          <aside className={styles.summaryPanel} aria-label="Current access summary">
            <div className={styles.summaryHeader}>
              <div>
                <p className={styles.summaryEyebrow}>Current access</p>
                <h2 className={styles.summaryTitle}>Assigned workspaces</h2>
              </div>
              <span className={styles.summaryCount}>{accessSummaryApps.length}</span>
            </div>

            {hasAccessSummaryApps ? (
              <>
                <ul className={styles.accessList}>
                  {previewApps.map((app) => (
                    <li key={app.id} className={styles.accessItem}>
                      <span className={styles.accessItemIcon}>{getAppIcon(app.id)}</span>
                      <div className={styles.accessItemBody}>
                        <span className={styles.accessItemName}>{app.name}</span>
                        <span className={styles.accessItemState}>
                          {app.launchUrl ? 'Ready to open' : 'Missing launch target'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {hiddenPreviewCount > 0 ? (
                  <p className={styles.summaryFootnote}>
                    Plus {hiddenPreviewCount} more assigned workspace
                    {hiddenPreviewCount === 1 ? '' : 's'}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={styles.summaryEmpty}>
                No workspace assignments were found for this account.
              </p>
            )}
          </aside>
        </section>

        <section aria-label="Available applications" className={styles.categoriesSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>Workspace groups</p>
            <h2 className={styles.sectionTitle}>Scan by function, then launch</h2>
            <p className={styles.sectionCopy}>
              Apps are grouped by operating area so the launcher stays fast to parse even as the
              suite grows.
            </p>
          </div>

          {categorySections.map((section) => (
            <section key={section.category} className={styles.categoryBlock}>
              <div className={styles.categoryIntro}>
                <div className={styles.categoryLine}>
                  <span className={styles.categoryBadge}>{section.category}</span>
                  <span className={styles.categoryCount}>
                    {section.readyCount}/{section.totalCount} ready
                  </span>
                </div>
                <p className={styles.categoryLead}>{section.lead}</p>
              </div>

              <div className={styles.grid}>
                {section.apps.map((app) => {
                  const state = resolveState(app)
                  const cardClassName = state.isDisabled
                    ? `${styles.card} ${styles.cardDisabled}`
                    : styles.card
                  const linkProps = state.isDisabled
                    ? {}
                    : {
                        target: '_blank' as const,
                        rel: 'noreferrer noopener',
                      }

                  return (
                    <a
                      key={app.id}
                      href={state.isDisabled ? undefined : app.launchUrl}
                      className={cardClassName}
                      aria-disabled={state.isDisabled}
                      tabIndex={state.isDisabled ? -1 : undefined}
                      {...linkProps}
                    >
                      <div className={styles.cardTop}>
                        <div className={styles.iconBox}>{getAppIcon(app.id)}</div>
                        <div className={styles.cardBadges}>
                          {state.isPublicEntry ? (
                            <span className={`${styles.stateBadge} ${styles.stateBadgePublic}`}>
                              Public
                            </span>
                          ) : null}
                          {!state.isEntitled ? (
                            <span className={`${styles.stateBadge} ${styles.stateBadgeLocked}`}>
                              Restricted
                            </span>
                          ) : null}
                          {state.isEntitled && !app.launchUrl ? (
                            <span className={`${styles.stateBadge} ${styles.stateBadgeMuted}`}>
                              Unavailable
                            </span>
                          ) : null}
                          {state.isDevLifecycle ? (
                            <span className={`${styles.stateBadge} ${styles.stateBadgeDev}`}>
                              Dev
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.cardBody}>
                        <h3 className={styles.name}>{app.name}</h3>
                        <p className={styles.description}>{app.description}</p>
                        {state.isEntitled && app.launchError ? (
                          <p className={styles.launchError}>{app.launchError}</p>
                        ) : null}
                      </div>

                      <div
                        className={
                          state.tone === 'locked'
                            ? `${styles.cardFooter} ${styles.cardFooterLocked}`
                            : state.tone === 'muted'
                              ? `${styles.cardFooter} ${styles.cardFooterMuted}`
                              : state.tone === 'public'
                                ? `${styles.cardFooter} ${styles.cardFooterPublic}`
                                : styles.cardFooter
                        }
                      >
                        <span className={styles.cardAction}>{state.actionText}</span>
                        <svg
                          className={styles.arrow}
                          viewBox="0 0 20 20"
                          width="18"
                          height="18"
                          aria-hidden="true"
                        >
                          <path
                            d="M8 5h6.59L7.3 12.29A1 1 0 0 0 8.7 13.7L16 6.41V13a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1H8a1 1 0 0 0 0 2Z"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                    </a>
                  )
                })}
              </div>
            </section>
          ))}

          {!hasApps ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>No applications assigned</h2>
              <p>
                We could not find any entitlements linked to your account. Reach out to an
                administrator.
              </p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
