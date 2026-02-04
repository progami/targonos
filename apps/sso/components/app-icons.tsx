import type { ReactNode } from 'react'

/**
 * Custom symbolic icons for TargonOS applications.
 * Each icon is designed at 24x24 with stroke-based styling using currentColor.
 */

/** Talos: Hexagon with vertical slit - the watchful eye of the automaton */
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

/** X-Plan (S&OP): Bold X mark - cross-functional planning */
export const XPlanIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      d="M7 7L17 17"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M17 7L7 17"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
)

/** Plutus (Financials): Cornucopia - horn of abundance */
export const PlutusIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* Horn silhouette with hollow opening */}
    <path
      d="M6.6 14.9C6.6 10.3 10.3 6.6 15 6.6c2.6 0 4.6 1.6 4.6 4.1c0 4.5-4.6 8.7-10.5 8.7c-1.4 0-2.5-.4-3.3-1.2c-.6-.7-.9-1.5-.9-2.3Z"
      fill="currentColor"
      opacity="0.2"
    />
    <path
      d="M6.6 14.9C6.6 10.3 10.3 6.6 15 6.6c2.6 0 4.6 1.6 4.6 4.1c0 4.5-4.6 8.7-10.5 8.7c-1.4 0-2.5-.4-3.3-1.2c-.6-.7-.9-1.5-.9-2.3Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.4 14.6c0-2.2 1.8-4 4-4c1.6 0 2.9 1 2.9 2.6c0 2.5-2.6 4.8-6 4.8c-.5 0-1-.1-1.4-.3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.65"
    />
    {/* Abundance (coins) */}
    <circle cx="6.5" cy="8.3" r="1.4" fill="currentColor" opacity="0.9" />
    <circle cx="8.8" cy="6.6" r="1.1" fill="currentColor" opacity="0.75" />
    <circle cx="9.4" cy="9.2" r="0.9" fill="currentColor" opacity="0.65" />
  </svg>
)

/** Hermes (Messaging): Winged messenger shoe */
export const HermesIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* Wing */}
    <path
      d="M9.6 10.2c-2.6-1.1-4.2-3-4.8-5.6c2.6 0.2 4.9 1.2 6.6 2.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M10.2 8.9c-1.5-0.8-2.6-1.8-3.2-3.2c1.6 0.1 3.0 0.6 4.2 1.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.75"
    />

    {/* Shoe */}
    <path
      d="M7.6 16h8.1c2.4 0 4.3-1.6 4.3-3.9c0-1-0.4-1.9-1.1-2.6l-1.1-1.1c-.6-.6-1.4-.9-2.2-.9h-3.4c-1 0-1.9.4-2.6 1.1l-1.7 1.7c-.8.8-1.2 1.6-1.2 2.7V16Z"
      fill="currentColor"
      opacity="0.18"
    />
    <path
      d="M7.6 16h8.1c2.4 0 4.3-1.6 4.3-3.9c0-1-0.4-1.9-1.1-2.6l-1.1-1.1c-.6-.6-1.4-.9-2.2-.9h-3.4c-1 0-1.9.4-2.6 1.1l-1.7 1.7c-.8.8-1.2 1.6-1.2 2.7V16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.6 16h12.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.65"
    />
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
