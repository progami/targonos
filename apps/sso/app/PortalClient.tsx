'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'

import type { AppDef } from '@/lib/apps'
import { getAppIcon } from '@/components/app-icons'

import styles from './portal.module.css'

type PortalRoleMap = Record<string, { depts?: string[] }>

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

const envAllowDevFlag = (process.env.NEXT_PUBLIC_ALLOW_DEV_APPS ?? process.env.ALLOW_DEV_APPS ?? '').trim().toLowerCase() === 'true'

type PortalClientProps = {
  session: Session
  apps: AppDef[]
  accessApps?: AppDef[]
  roles?: PortalRoleMap
  accessError?: string
}

export default function PortalClient({ session, apps, accessApps, roles, accessError }: PortalClientProps) {
  const roleMap = roles ?? {}
  const hasApps = apps.length > 0
  const accessSummaryApps = (accessApps ?? apps).filter((app) => app.lifecycle !== 'dev' || Boolean(roleMap[app.id]))
  const hasAccessSummaryApps = accessSummaryApps.length > 0
  const [allowDevApps] = useState(envAllowDevFlag)

  const normalizeCategory = (value?: string | null) => {
    const trimmed = value?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : OTHER_CATEGORY
  }

  const appsByCategory = apps.reduce<Record<string, AppDef[]>>((acc, app) => {
    const assigned = roleMap[app.id]?.depts
    const primaryCategory = normalizeCategory(assigned?.[0] ?? (app as any).category)
    acc[primaryCategory] = acc[primaryCategory]
      ? [...acc[primaryCategory], app]
      : [app]
    return acc
  }, {})

  const orderedCategories = CATEGORY_ORDER.filter((k) => appsByCategory[k]?.length)
    .concat(
      Object.keys(appsByCategory).filter(
        (key) => !CATEGORY_ORDER.includes(key) && appsByCategory[key]?.length
      )
    )

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
            <span className={styles.brandTitle}>TargonOS Portal</span>
          </div>
          <div className={styles.headerCenter}>Control Center</div>
          <div className={styles.actions}>
            <span>{session.user?.email}</span>
            <button
              type="button"
              className={styles.signOut}
              onClick={() => {
                const origin = typeof window !== 'undefined'
                  ? window.location.origin
                  : process.env.NEXT_PUBLIC_PORTAL_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
                const fallback = origin || '/'
                const callbackUrl = `${fallback.replace(/\/$/, '')}/login`
                void signOut({ callbackUrl })
              }}
            >
              Sign out
            </button>
            {/* Targon branding - RIGHT */}
            <svg viewBox="0 0 128 128" width="24" height="24" aria-label="Targon" style={{ flexShrink: 0 }}>
              <rect x="0" y="0" width="128" height="128" rx="21" fill="#00C2B9" />
            </svg>
          </div>
        </header>
      </div>

      <main className={styles.main}>
          {accessError && (
            <div className={styles.accessError} role="alert">
              {accessError}
            </div>
          )}

          <section className={styles.intro}>
            <span className={styles.introSpacer} aria-hidden="true" />
          </section>

          <section aria-label="Available applications" className={styles.categoriesSection}>
            {orderedCategories.map((category) => (
              <div key={category} className={styles.categoryBlock}>
                <div className={styles.categoryHeader}>
                  <span className={styles.categoryBadge}>{category}</span>
                  <span className={styles.categoryCount}>
                    {appsByCategory[category]?.length ?? 0} apps
                  </span>
                </div>
                <div className={styles.grid}>
	                  {appsByCategory[category]?.map((app) => {
	                    const isDevLifecycle = app.lifecycle === 'dev'
	                    const isDisabled = isDevLifecycle && !allowDevApps
	                    const cardClassName = isDisabled
	                      ? `${styles.card} ${styles.cardDisabled}`
	                      : styles.card
	                    const iconBoxClassName = styles.iconBox

                    const linkProps = isDisabled
                      ? {}
                      : {
                          target: '_blank' as const,
                          rel: 'noreferrer noopener',
                        }

                    return (
                      <a
                        key={app.id}
                        href={isDisabled ? undefined : app.url}
                        className={cardClassName}
                        aria-disabled={isDisabled}
                        tabIndex={isDisabled ? -1 : undefined}
                        {...linkProps}
	                      >
	                        <div className={styles.iconWrap}>
	                          <div className={iconBoxClassName}>{getAppIcon(app.id)}</div>
	                          <svg className={styles.arrow} viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
	                            <path
	                              d="M8 5h6.59L7.3 12.29A1 1 0 0 0 8.7 13.7L16 6.41V13a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1H8a1 1 0 0 0 0 2Z"
	                              fill="currentColor"
	                            />
                          </svg>
                        </div>
                        {isDevLifecycle && <span className={styles.lifecycleBadge}>In Development</span>}
                        <div className={styles.name}>{app.name}</div>
                        <p className={styles.description}>{app.description}</p>
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}

            {!hasApps && (
              <div className={styles.empty}>
                <h2 className={styles.emptyTitle}>No applications assigned</h2>
                <p>We could not find any entitlements linked to your account. Reach out to an administrator.</p>
              </div>
            )}
          </section>

          {hasAccessSummaryApps && (
            <section aria-label="Current access summary" className={styles.rolesSection}>
              <h2 className={styles.rolesHeading}>Access summary</h2>
              <ul className={styles.rolesList}>
                {accessSummaryApps.map((app) => (
                  <li key={app.id}>{app.name}</li>
                ))}
              </ul>
            </section>
          )}
      </main>
    </div>
  )
}
