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

/** Kairos (Forecasting): time window and moment mark */
export const KairosIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--icon-navy)" strokeWidth="1.6" />
    <path d="M8 5.5h8M8 18.5h8" stroke="var(--icon-gold)" strokeWidth="1.7" strokeLinecap="round" />
    <path
      d="M8.7 6.5c0 3.2 2.2 4.1 3.3 5.5-1.1 1.4-3.3 2.3-3.3 5.5M15.3 6.5c0 3.2-2.2 4.1-3.3 5.5 1.1 1.4 3.3 2.3 3.3 5.5"
      fill="none"
      stroke="var(--icon-teal)"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="17.7" cy="6.3" r="1.45" fill="var(--icon-gold)" />
  </svg>
)

/** X-Plan (S&OP): Bold X mark - cross-functional planning */
export const XPlanIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      d="M7 7L17 17"
      stroke="var(--icon-navy)"
      strokeWidth="2.8"
      strokeLinecap="round"
    />
    <path
      d="M17 7L7 17"
      stroke="var(--icon-navy)"
      strokeWidth="2.8"
      strokeLinecap="round"
    />
    <path
      d="M12 4.4v15.2M4.4 12h15.2"
      stroke="var(--icon-teal)"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.8"
    />
    <circle cx="12" cy="12" r="2" fill="var(--icon-teal)" />
    <circle cx="18.7" cy="5.3" r="1.35" fill="var(--icon-gold)" />
  </svg>
)

/** Plutus (Financials): Cornucopia - horn of abundance */
export const PlutusIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      d="M7 15.2c0-5 4-9 9-9c2.8 0 4.9 1.8 4.9 4.6c0 5.2-5.2 9.8-12 9.8c-1.9 0-3.4-.6-4.4-1.7c-.7-.8-1-1.7-1-2.7Z"
      fill="currentColor"
      opacity="0.16"
    />
    <path
      d="M7 15.2c0-5 4-9 9-9c2.8 0 4.9 1.8 4.9 4.6c0 5.2-5.2 9.8-12 9.8c-1.9 0-3.4-.6-4.4-1.7c-.7-.8-1-1.7-1-2.7Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11 14.9c0-2.4 2-4.3 4.4-4.3c1.8 0 3.2 1.1 3.2 2.9c0 2.7-2.7 5.2-6.6 5.2c-.6 0-1.1-.1-1.6-.3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.65"
    />
    <path
      d="M14.3 9.2c.6-.5 1.3-.9 2-.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.5"
    />
    <circle cx="6.7" cy="8.0" r="1.35" fill="currentColor" opacity="0.95" />
    <circle cx="8.9" cy="6.3" r="1.05" fill="currentColor" opacity="0.8" />
    <circle cx="9.5" cy="8.9" r="0.85" fill="currentColor" opacity="0.7" />
  </svg>
)

/** Hermes (Messaging): Winged messenger shoe */
export const HermesIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {/* Wing */}
    <path
      d="M9.6 10.4c-2.6-1.1-4.3-3-4.9-5.7c2.7 0.2 5.1 1.2 6.9 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <path
      d="M10.4 9.0c-1.6-0.8-2.7-1.9-3.3-3.3c1.7 0.1 3.1 0.6 4.4 1.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      opacity="0.75"
    />
    <path
      d="M10.9 7.7c-1.2-.6-2-1.4-2.5-2.3c1.2.1 2.3.4 3.4 1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      opacity="0.55"
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
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.6 16h12.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      opacity="0.65"
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
