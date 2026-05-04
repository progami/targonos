'use client'

import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import type { CSSProperties } from 'react'

import type { AppDef } from '@/lib/apps'
import { getAppIcon } from '@/components/app-icons'
import { getPublicVersion, getPublicVersionHref } from '@/lib/public-build-metadata'

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

function getWorkspaceRowClassName(state: AppState) {
  const classNames = [styles.workspaceRow]

  if (state.isDisabled) {
    classNames.push(styles.workspaceRowDisabled)
  }

  if (state.tone === 'public') {
    classNames.push(styles.workspaceRowPublic)
  }

  if (state.tone === 'locked') {
    classNames.push(styles.workspaceRowLocked)
  }

  if (state.tone === 'muted') {
    classNames.push(styles.workspaceRowMuted)
  }

  return classNames.join(' ')
}

function getWorkspaceActionClassName(state: AppState) {
  const classNames = [styles.workspaceAction]

  if (state.tone === 'public') {
    classNames.push(styles.workspaceActionPublic)
  }

  if (state.tone === 'locked') {
    classNames.push(styles.workspaceActionLocked)
  }

  if (state.tone === 'muted') {
    classNames.push(styles.workspaceActionMuted)
  }

  return classNames.join(' ')
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
        actionText: 'Open public surface',
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
    const primaryCategory = normalizeCategory(app.category)
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
      readyCount,
      totalCount: sortedApps.length,
    }
  })

  const previewApps = accessSummaryApps.slice(0, 8)
  const hiddenPreviewCount = accessSummaryApps.length - previewApps.length
  const signedInEmail = session.user?.email?.trim()
  const profileInitial = signedInEmail ? signedInEmail.slice(0, 1).toUpperCase() : 'T'
  const accessModeLabel = isPlatformAdmin ? 'Platform admin access' : 'Role-scoped access'
  const version = getPublicVersion()
  const versionHref = getPublicVersionHref()

  return (
    <div className={styles.container}>
      <div className={styles.backdropGrid} aria-hidden="true" />
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
                  opacity="0.42"
                />
              </svg>
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandKicker}>TargonOS</span>
              <span className={styles.brandTitle}>Control plane</span>
            </div>
          </div>

          <div className={styles.identity}>
            <span className={styles.identityAvatar} aria-hidden="true">
              {profileInitial}
            </span>
            <span className={styles.identityCopy}>
              <span className={styles.identityLabel}>{accessModeLabel}</span>
              {signedInEmail ? <span className={styles.identityValue}>{signedInEmail}</span> : null}
            </span>
          </div>

          <div className={styles.actions}>
            <a
              href={versionHref}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.portalVersionBadge}
              data-portal-version-badge="true"
              aria-label={`TargonOS version v${version}`}
            >
              v{version}
            </a>
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

        <section className={styles.workspaceShell} aria-label="TargonOS workspaces">
          <aside className={styles.accessRail} aria-label="Assigned workspaces">
            <div className={styles.railHeader}>
              <div>
                <h2 className={styles.railTitle}>Your access map</h2>
              </div>
              {isPlatformAdmin ? <span className={styles.overviewFlag}>Platform admin</span> : null}
            </div>

            {hasAccessSummaryApps ? (
              <ul className={styles.accessList}>
                {previewApps.map((app, index) => (
                  <li
                    key={app.id}
                    className={styles.accessItem}
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <span className={styles.accessItemIcon}>{getAppIcon(app.id)}</span>
                    <span className={styles.accessItemName}>{app.name}</span>
                  </li>
                ))}
                {hiddenPreviewCount > 0 ? (
                  <li className={`${styles.accessItem} ${styles.accessItemMuted}`}>
                    <span className={styles.accessItemName}>+{hiddenPreviewCount} more</span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className={styles.summaryEmpty}>
                No workspace assignments were found for this account.
              </p>
            )}
          </aside>

          <section className={styles.lanesPanel} aria-label="Available applications">
            <div className={styles.lanes}>
              {categorySections.map((section, sectionIndex) => (
                <section key={section.category} className={styles.lane}>
                  <div className={styles.laneIntro}>
                    <div className={styles.laneNameRow}>
                      <h3 className={styles.laneName}>{section.category}</h3>
                      <span className={styles.laneCount}>
                        {section.readyCount}/{section.totalCount} ready
                      </span>
                    </div>
                  </div>

                  <div className={styles.workspaceList}>
                    {section.apps.map((app, appIndex) => {
                      const state = resolveState(app)
                      const linkProps = state.isDisabled
                        ? {}
                        : {
                            target: '_blank' as const,
                            rel: 'noreferrer noopener',
                          }
                      const animationDelay = (sectionIndex * 70) + (appIndex * 35)

                      return (
                        <a
                          key={app.id}
                          href={state.isDisabled ? undefined : app.launchUrl}
                          className={getWorkspaceRowClassName(state)}
                          aria-disabled={state.isDisabled}
                          tabIndex={state.isDisabled ? -1 : undefined}
                          style={{ '--row-delay': `${animationDelay}ms` } as CSSProperties}
                          {...linkProps}
                        >
                          <span className={styles.workspaceIcon}>{getAppIcon(app.id)}</span>

                          <span className={styles.workspaceMain}>
                            <span className={styles.workspaceName}>{app.name}</span>
                            <span className={styles.workspaceDescription}>{app.description}</span>
                            {state.isEntitled && app.launchError ? (
                              <span className={styles.launchError}>{app.launchError}</span>
                            ) : null}
                          </span>

                          <span className={styles.workspaceBadges}>
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
                          </span>

                          <span className={getWorkspaceActionClassName(state)}>
                            <span>{state.actionText}</span>
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
                          </span>
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
                    We could not find entitlements linked to your account. Reach out to an
                    administrator.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
