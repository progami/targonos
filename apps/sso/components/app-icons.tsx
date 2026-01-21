import type { ReactNode } from 'react'

/**
 * Custom symbolic icons for TargonOS applications.
 * Each icon is designed at 24x24 with stroke-based styling using currentColor.
 */

/** Talos (WMS): Hexagon with vertical slit - the watchful eye of the automaton */
export const TalosIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* Hexagon with vertical slit cutout using evenodd fill-rule */}
    <path
      d="M 12 3 L 19.8 7.5 L 19.8 16.5 L 12 21 L 4.2 16.5 L 4.2 7.5 Z M 10.9 6.4 L 13.1 6.4 L 13.1 17.6 L 10.9 17.6 Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
)

/** Atlas (HRMS): Circle resting in chevron - titan holding the heavens */
export const AtlasIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* The sphere (organization/people being upheld) */}
    <circle
      cx="12"
      cy="8"
      r="5.5"
      fill="currentColor"
      opacity="0.2"
    />
    <circle
      cx="12"
      cy="8"
      r="5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    {/* The chevron/V support (HR infrastructure) */}
    <path
      d="M3 15L12 21L21 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** Kairos (Forecasting): Lightning bolt morphing to arrow - opportune moment + growth */
export const KairosIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* Combined lightning-arrow shape */}
    <path
      d="M13 2L4 13H11L10 22L20 10H13L13 2Z"
      fill="currentColor"
      opacity="0.15"
    />
    <path
      d="M13 2L4 13H11L10 22L20 10H13L13 2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Upward arrow accent at top */}
    <path
      d="M13 2L16 5M13 2L10 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** X-Plan (S&OP): Interlocking chain links as X - bridging Sales & Ops */
export const XPlanIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* First diagonal link (top-left to bottom-right) */}
    <path
      d="M6 4C4.5 4 3 5.5 3 7C3 8.5 4.5 10 6 10L10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M14 14L18 14C19.5 14 21 15.5 21 17C21 18.5 19.5 20 18 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    {/* The X crossing */}
    <path
      d="M8 8L16 16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    {/* Second diagonal link (top-right to bottom-left) */}
    <path
      d="M18 4C19.5 4 21 5.5 21 7C21 8.5 19.5 10 18 10L14 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M10 14L6 14C4.5 14 3 15.5 3 17C3 18.5 4.5 20 6 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M16 8L8 16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

/** Plutus (Financials): Pixelated cornucopia - wealth built from data */
export const PlutusIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* Horn shape built from pixel blocks */}
    {/* Wide mouth of cornucopia */}
    <rect x="2" y="4" width="4" height="4" fill="currentColor" opacity="0.7" rx="0.5" />
    <rect x="6" y="4" width="4" height="4" fill="currentColor" opacity="0.85" rx="0.5" />
    <rect x="10" y="4" width="4" height="4" fill="currentColor" opacity="0.7" rx="0.5" />
    {/* Second row */}
    <rect x="4" y="8" width="4" height="4" fill="currentColor" opacity="0.9" rx="0.5" />
    <rect x="8" y="8" width="4" height="4" fill="currentColor" opacity="0.75" rx="0.5" />
    <rect x="12" y="8" width="4" height="4" fill="currentColor" opacity="0.6" rx="0.5" />
    {/* Third row - tapering */}
    <rect x="8" y="12" width="4" height="4" fill="currentColor" opacity="0.85" rx="0.5" />
    <rect x="12" y="12" width="4" height="4" fill="currentColor" opacity="0.7" rx="0.5" />
    <rect x="16" y="12" width="4" height="4" fill="currentColor" opacity="0.5" rx="0.5" />
    {/* Tip of horn */}
    <rect x="14" y="16" width="4" height="4" fill="currentColor" opacity="0.8" rx="0.5" />
    <rect x="18" y="16" width="4" height="4" fill="currentColor" opacity="0.6" rx="0.5" />
    <rect x="18" y="20" width="4" height="3" fill="currentColor" opacity="0.5" rx="0.5" />
  </svg>
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
  kairos: KairosIcon,
  xplan: XPlanIcon,
  plutus: PlutusIcon,
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
