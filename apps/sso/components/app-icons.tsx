import type { ReactNode } from 'react'

/**
 * Custom symbolic icons for TargonOS applications.
 * Each icon is designed at 24x24 with stroke-based styling using currentColor.
 */

const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** Talos: Hexagon with vertical slit - the watchful eye of the automaton */
export const TalosIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      d="M12 2.8 20.2 7.5v9L12 21.2 3.8 16.5v-9L12 2.8Z"
      fill="var(--icon-gold)"
    />
    <path
      d="M12 5.2 18 8.6v6.8l-6 3.4-6-3.4V8.6l6-3.4Z"
      fill="var(--icon-navy)"
    />
    <rect
      x="10.85"
      y="7.3"
      width="2.3"
      height="9.4"
      fill="var(--icon-teal)"
      rx="1.15"
    />
  </svg>
)

/** Atlas: approved Greek-inspired generated mark */
export const AtlasIcon = (
  <img src={`${assetBasePath}/app-logos/atlas.png`} alt="" aria-hidden="true" />
)

/** Kairos: clock window and hourglass */
export const KairosIcon = (
  <svg viewBox="0 0 24 24" width="52" height="52" style={{ width: '52px', height: '52px' }} aria-hidden="true">
    <path
      d="M4.8 12a7.2 7.2 0 0 1 2.1-5.1M12 4.8a7.2 7.2 0 0 1 5.1 2.1M19.2 12a7.2 7.2 0 0 1-2.1 5.1M12 19.2a7.2 7.2 0 0 1-5.1-2.1"
      fill="none"
      stroke="var(--icon-navy)"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <path d="M8.7 7.1h6.6M8.7 16.9h6.6" stroke="var(--icon-navy)" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M9.7 8c0 2.4 1.6 3 2.3 4-.7 1-2.3 1.6-2.3 4M14.3 8c0 2.4-1.6 3-2.3 4 .7 1 2.3 1.6 2.3 4"
      fill="none"
      stroke="var(--icon-teal)"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 12.5 10.4 15h3.2L12 12.5Z" fill="var(--icon-teal)" />
    <path d="M12 2.7v1.4M21.3 12h-1.4M12 21.3v-1.4M2.7 12h1.4" stroke="var(--icon-gold)" strokeWidth="1.35" strokeLinecap="round" />
    <circle cx="17.7" cy="6.3" r="1.15" fill="var(--icon-gold)" />
  </svg>
)

/** Hermes: winged messenger helm */
export const HermesIcon = (
  <svg viewBox="0 0 24 24" width="54" height="54" style={{ width: '54px', height: '54px' }} aria-hidden="true">
    <path
      d="M4.4 5.1c3.6.4 6.5 2 8.6 4.8-3.4-.5-6.2-2.1-8.6-4.8Z"
      fill="var(--icon-navy)"
    />
    <path
      d="M5.5 8.4c2.7.35 4.9 1.45 6.5 3.3-2.6-.25-4.8-1.35-6.5-3.3Z"
      fill="var(--icon-navy)"
      opacity="0.9"
    />
    <path
      d="M7.1 11.3c1.9.25 3.4.95 4.5 2.1-1.8-.15-3.3-.85-4.5-2.1Z"
      fill="var(--icon-navy)"
      opacity="0.72"
    />
    <path
      d="M11.5 12.9c.3-2.7 2.35-4.45 5.05-4.45 2.35 0 4.2 1.35 4.8 3.45l-2.2.3c.4.55.6 1.1.6 1.7 0 1.9-1.7 3.4-4.2 3.4h-1.45l-1.35 2.35-2.45-1.3 1.2-2.2c-1.1-.8-1.5-1.85-1.25-3.25h1.25Z"
      fill="var(--icon-navy)"
    />
    <path
      d="M15.9 10.4c1.45 0 2.55.8 2.9 2.05"
      fill="none"
      stroke="var(--icon-gold)"
      strokeWidth="1.05"
      strokeLinecap="round"
    />
    <circle cx="13.15" cy="15.25" r="2.15" fill="var(--icon-teal)" />
    <circle cx="13.15" cy="15.25" r="1.05" fill="var(--surface)" />
    <path
      d="M12.6 17.35c.75.95 1.8 1.45 3.15 1.55"
      fill="none"
      stroke="var(--icon-gold)"
      strokeWidth="1.15"
      strokeLinecap="round"
    />
  </svg>
)

/** Argus: approved Greek shield monitoring mark */
export const ArgusIcon = (
  <img src={`${assetBasePath}/app-logos/argus.png`} alt="" aria-hidden="true" />
)

/** Website: Globe icon for marketing site */
export const WebsiteIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
    <path
      d="M3 12h18"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.7"
    />
    <path
      d="M12 3a18 18 0 0 1 4.5 9 18 18 0 0 1-4.5 9 18 18 0 0 1-4.5-9A18 18 0 0 1 12 3z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.7"
      fill="none"
    />
  </svg>
)

/** Map of app IDs to their icons */
export const APP_ICONS: Record<string, ReactNode> = {
  talos: TalosIcon,
  atlas: AtlasIcon,
  argus: ArgusIcon,
  kairos: KairosIcon,
  hermes: HermesIcon,
  website: WebsiteIcon,
}

/** Fallback icon for unknown apps */
export const FallbackIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.15" />
    <path d="M9 9h6v6H9z" fill="currentColor" opacity="0.75" />
  </svg>
)

/** Get icon for an app by ID */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAppIcon = (appId: string): any => APP_ICONS[appId] ?? FallbackIcon
