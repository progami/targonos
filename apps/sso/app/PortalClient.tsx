'use client'

import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import { useEffect, useState } from 'react'

import type { AppDef } from '@/lib/apps'
import { getAppIcon } from '@/components/app-icons'
import { getPublicBuildTime, getPublicVersion, getPublicVersionHref } from '@/lib/public-build-metadata'
import type { ServiceProbe, ServiceStatusPayload } from '@/lib/service-map'

import ServiceMap from './ServiceMap'
import styles from './portal.module.css'

type PortalRoleMap = Record<string, { departments?: string[]; depts?: string[] }>

export type PortalAppCard = AppDef & {
  launchError?: string
  launchUrl?: string
}

type AppStateTone = 'locked' | 'muted' | 'public' | 'standard'

type AppState = {
  actionText: string
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

type PortalClientProps = {
  accessApps?: PortalAppCard[]
  accessError?: string
  apps: PortalAppCard[]
  cookieDomain: string
  isPlatformAdmin?: boolean
  portalHost: string
  roles?: PortalRoleMap
  session: Session
}

const STATUS_REFRESH_MS = 60_000

// Live reachability for every workspace and host, refreshed while the tab is visible.
function useServiceStatus() {
  const [probes, setProbes] = useState<Map<string, ServiceProbe> | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      const response = await fetch('/api/v1/service-status', { cache: 'no-store' })
      if (!response.ok) {
        console.error(`[portal] service status request failed with HTTP ${response.status}`)
        if (active) setProbes(new Map())
        return
      }
      const payload = (await response.json()) as ServiceStatusPayload
      if (active) {
        setProbes(new Map(payload.services.map((probe) => [probe.id, probe])))
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), STATUS_REFRESH_MS)
    const onVisibilityChange = () => void load()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return probes
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
  cookieDomain,
  portalHost,
}: PortalClientProps) {
  const roleMap = roles ?? {}
  const hasApps = apps.length > 0
  const probes = useServiceStatus()

  const resolveState = (app: PortalAppCard): AppState => {
    const isPublicEntry = app.entryPolicy === 'public'
    const isEntitled = isPublicEntry || Boolean(isPlatformAdmin) || Boolean(roleMap[app.id])
    const isDisabled = !isEntitled || !app.launchUrl

    if (!isEntitled) {
      return {
        actionText: 'Access required',
        isDisabled,
        isEntitled,
        isPublicEntry,
        tone: 'locked',
      }
    }

    if (!app.launchUrl) {
      return {
        actionText: 'Launch unavailable',
        isDisabled,
        isEntitled,
        isPublicEntry,
        tone: 'muted',
      }
    }

    if (isPublicEntry) {
      return {
        actionText: 'Open public surface',
        isDisabled,
        isEntitled,
        isPublicEntry,
        tone: 'public',
      }
    }

    return {
      actionText: 'Open workspace',
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
              <span className={styles.srOnly}>{accessModeLabel}</span>
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
              title={`Updated ${buildTimeLabel}`}
            >
              <span>v{version}</span>
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
            <h1 id="portal-title" className={styles.launcherTitle}>Workspaces</h1>
            <span className={styles.launcherMeta}>
              {accessModeLabel} · {launcherApps.length} applications
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
                  {section.apps.map((app) => {
                    const state = resolveState(app)
                    const probe = probes?.get(app.id)
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
                        title={app.description}
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
                          <span className={styles.workspaceCategory}>
                            {normalizeCategory(app.category)}
                          </span>
                          {probe ? (
                            <span
                              className={`${styles.stateBadge} ${probe.state === 'up' ? styles.stateBadgeUp : styles.stateBadgeDown}`}
                              title={probe.httpStatus === null ? 'No response' : `HTTP ${probe.httpStatus} in ${probe.latencyMs} ms`}
                            >
                              {probe.state === 'up' ? 'Up' : 'Down'}
                            </span>
                          ) : null}
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

        <ServiceMap cookieDomain={cookieDomain} portalHost={portalHost} probes={probes} />
      </main>
    </div>
  )
}
