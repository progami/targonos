'use client'

import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import type { CSSProperties } from 'react'

import type { AppDef } from '@/lib/apps'
import { getAppIcon } from '@/components/app-icons'
import { getPublicBuildTime, getPublicVersion, getPublicVersionHref } from '@/lib/public-build-metadata'

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

function formatBuildTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('NEXT_PUBLIC_BUILD_TIME is invalid.')
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date)
}

export default function PortalClient({
  session,
  apps,
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

  const normalizeCategory = (value?: string | null) => {
    const trimmed = value?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : OTHER_CATEGORY
  }

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

  const rankCategory = (value?: string | null) => {
    const normalized = normalizeCategory(value)
    const index = CATEGORY_ORDER.indexOf(normalized)
    return index === -1 ? CATEGORY_ORDER.length : index
  }

  const launcherApps = [...apps].sort((left, right) => {
    const rankDifference = rankApp(left) - rankApp(right)
    if (rankDifference !== 0) {
      return rankDifference
    }

    const categoryDifference = rankCategory(left.category) - rankCategory(right.category)
    if (categoryDifference !== 0) {
      return categoryDifference
    }

    return left.name.localeCompare(right.name)
  })
  const launcherSections = [
    {
      id: 'active',
      title: 'Active',
      apps: launcherApps.filter((app) => app.lifecycle === 'active'),
    },
    {
      id: 'under-development',
      title: 'Under development',
      apps: launcherApps.filter((app) => app.lifecycle === 'dev'),
    },
  ].filter((section) => section.apps.length > 0)

  const signedInEmail = session.user?.email?.trim()
  const profileInitial = signedInEmail ? signedInEmail.slice(0, 1).toUpperCase() : 'T'
  const accessModeLabel = isPlatformAdmin ? 'Platform admin access' : 'Role-scoped access'
  const version = getPublicVersion()
  const versionHref = getPublicVersionHref()
  const buildTimeLabel = formatBuildTime(getPublicBuildTime())

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
              className={styles.buildMeta}
              data-portal-version-badge="true"
              aria-label={`TargonOS version v${version}, last updated ${buildTimeLabel}`}
            >
              <span>v{version}</span>
              <span>Updated {buildTimeLabel}</span>
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

        <section className={styles.launcherShell} aria-labelledby="portal-title">
          <div className={styles.launcherTop}>
            <div className={styles.launcherHeading}>
              <span className={styles.sectionEyebrow}>{accessModeLabel}</span>
              <h1 id="portal-title" className={styles.launcherTitle}>Workspaces</h1>
            </div>
            <span className={styles.launcherMeta}>
              {launcherApps.length} applications
            </span>
          </div>

          <div className={styles.workspaceSections}>
            {launcherSections.map((section) => (
              <section
                key={section.id}
                className={styles.workspaceSection}
                aria-labelledby={`portal-section-${section.id}`}
              >
                <div className={styles.workspaceSectionHeader}>
                  <h2 id={`portal-section-${section.id}`} className={styles.workspaceSectionTitle}>
                    {section.title}
                  </h2>
                  <span className={styles.workspaceSectionMeta}>
                    {section.apps.length} applications
                  </span>
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

                    return (
                      <a
                        key={app.id}
                        href={state.isDisabled ? undefined : app.launchUrl}
                        className={getWorkspaceRowClassName(state)}
                        aria-disabled={state.isDisabled}
                        tabIndex={state.isDisabled ? -1 : undefined}
                        style={{ '--row-delay': `${appIndex * 35}ms` } as CSSProperties}
                        title={app.description}
                        {...linkProps}
                      >
                        <span className={styles.workspaceIcon}>{getAppIcon(app.id)}</span>

                        <span className={styles.workspaceMain}>
                          <span className={styles.workspaceCategory}>
                            {normalizeCategory(app.category)}
                          </span>
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
                              Under development
                            </span>
                          ) : null}
                        </span>

                        <span className={getWorkspaceActionClassName(state)} aria-hidden="true">
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
      </main>
    </div>
  )
}
