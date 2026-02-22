# Security Best Practices Report

Date: 2026-02-22  
Repo: `/Users/jarraramjad/.codex/worktrees/8a23/sso`

## Executive summary

This monorepo is primarily **Next.js (TypeScript)** apps (React + NextAuth + Prisma) plus a **FastAPI (Python)** service (`services/kairos-ml`).

Top findings:

- **High:** The SSO redirect relay (`/auth/relay`) can be used as an **open redirect within `*.targonglobal.com`**, and the NextAuth redirect allowlist has a **suffix check bug** that can allow unintended hostnames (e.g., `evil-os.targonglobal.com`) when `ALLOW_CALLBACK_REDIRECT=true`.
- **Medium:** Multiple apps build `callbackUrl` using `x-forwarded-*` headers; if these headers are not stripped/overwritten by a trusted proxy, this becomes **host header poisoning** and can feed the redirect chain above.
- **Medium:** The FastAPI service has **no auth/allowlist in-app**, returns **internal exception strings** to callers, and has **no explicit request size limits** (DoS risk) if reachable beyond trusted networks.

## Scope & methodology

- Static review of repository source and config with targeted searches for common security sinks and auth/redirect flows.
- No dynamic runtime/header verification, no dependency vulnerability scan (`pnpm audit`/SCA), and no infrastructure/CDN/WAF/header configuration review (those controls may exist outside the repo).

## Findings

### High

#### 1) Open redirect surface in SSO relay (`/auth/relay`)

- **Rule ID:** NEXT-AUTH-REDIRECT-001
- **Severity:** High
- **Location:** `apps/sso/app/auth/relay/page.tsx:11-61`
- **Evidence:**
  - User-controlled target:
    - `apps/sso/app/auth/relay/page.tsx:11-12`
      - `const to = searchParams.get('to') || '/'`
  - Allowed target scope is any subdomain of the **base domain** (last two labels), not the SSO environment domain:
    - `apps/sso/app/auth/relay/page.tsx:48-50`
      - `const baseDomain = getBaseDomain(window.location.hostname)`
      - `hostname === baseDomain || hostname.endsWith(\`.\${baseDomain}\`)`
  - Redirect happens client-side:
    - `apps/sso/app/auth/relay/page.tsx:53-59`
      - `window.location.replace(url.toString())`
- **Impact:** Attackers can use `https://os.targonglobal.com/auth/relay?to=...` to redirect victims to an attacker-controlled (or takeover-able) hostname under the same registrable domain, which is a common phishing and auth-flow abuse primitive.
- **Fix (recommended):**
  - Restrict redirects to the **configured SSO cookie domain / environment domain** (e.g., `*.os.targonglobal.com` or `*.dev-os.targonglobal.com`), not the registrable base domain.
  - Use a strict hostname check: `host === cookieDomain || host.endsWith('.' + cookieDomain)` (dot-boundary), where `cookieDomain` is the environment domain without leading dot.
  - Consider making `/auth/relay` a **server component** so it can read a server-only env var and enforce the allowlist without relying on client-derived heuristics.
- **Mitigation (defense-in-depth):**
  - Add monitoring for unexpected `to=` targets and consider rate limiting.
  - If you must keep client-side, pass an allowlisted `envDomain` via `NEXT_PUBLIC_*` and validate against it.
- **False positive notes:** If this route is not deployed publicly (or is edge-restricted), the practical risk is lower; that restriction is not visible in repo code.

#### 2) Callback redirect allowlist uses an unsafe suffix match

- **Rule ID:** NEXT-AUTH-REDIRECT-002
- **Severity:** High
- **Location:** `apps/sso/lib/auth.ts:228-268`
- **Evidence:**
  - Callback redirects are enabled in environments that set `ALLOW_CALLBACK_REDIRECT=true` (documented for production-like UX):
    - `apps/sso/README.md:70-76`
  - Redirect callback allowlist uses `endsWith(cookieDomain)`:
    - `apps/sso/lib/auth.ts:261-266`
      - `const cookieDomain = resolvedCookieDomain.replace(/^\./, '')`
      - `if (cookieDomain && target.hostname.endsWith(cookieDomain)) { ... }`
- **Impact:** When callback redirects are enabled, hostnames that are **not subdomains** of the intended cookie domain can still pass (suffix confusion), enabling unintended post-login redirects (phishing vector). Example class: `evil-os.targonglobal.com` matches `os.targonglobal.com` by raw suffix.
- **Fix (recommended):**
  - Replace `endsWith(cookieDomain)` with a dot-boundary check:
    - `target.hostname === cookieDomain || target.hostname.endsWith('.' + cookieDomain)`
  - Ensure the allowlist matches the documented behavior (“only subdomains of `COOKIE_DOMAIN`”).
- **Mitigation (defense-in-depth):**
  - Prefer a small explicit allowlist of app origins (or app IDs → origins) over suffix rules.
  - Keep the `/auth/relay` validation aligned with the redirect callback rules to avoid inconsistent policy.
- **False positive notes:** If `ALLOW_CALLBACK_REDIRECT` is not enabled in production, this is lower impact (but `apps/sso/.env.dev.ci:14` shows it enabled in CI-like dev env).

### Medium

#### 3) Trusting `x-forwarded-host` / `x-forwarded-proto` when constructing callback URLs

- **Rule ID:** NEXT-HEADERS-TRUST-001
- **Severity:** Medium (High if these headers are attacker-controlled at the app)
- **Locations (examples):**
  - `apps/plutus/middleware.ts:11-23`
  - `apps/talos/src/middleware.ts:100-123`
  - `packages/auth/src/index.ts:429-438` (origin inference)
- **Evidence:**
  - `apps/plutus/middleware.ts:12-23` builds `callbackUrl` from forwarded headers:
    - `const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')`
    - `return \`\${protocol}://\${host}\${pathname}\${request.nextUrl.search}\``
- **Impact:** If a deployment path does not strictly set/overwrite `x-forwarded-*` (or `Host`) at a trusted edge, an attacker can craft requests that generate poisoned `callbackUrl` values, which then flow into SSO redirect logic.
- **Fix (recommended):**
  - Build callback URLs from a **canonical configured origin** (e.g., `NEXT_PUBLIC_APP_URL`/`BASE_URL`) + `request.nextUrl.pathname/search`, rather than request headers.
  - If forwarded headers must be used, validate the derived host against an allowlist (exact hosts for each env).
- **Mitigation (defense-in-depth):**
  - Ensure edge/proxy strips inbound `x-forwarded-*` from the public internet and sets them itself.
  - Consider adding `TrustedHost`-style validation at the edge/app layer.
- **False positive notes:** Many platforms (Vercel, managed ingress) set these headers safely; that configuration is not visible here.

#### 4) FastAPI service: information disclosure + DoS risk if reachable

- **Rule ID:** FASTAPI-DEPLOY-INFO-001
- **Severity:** Medium
- **Locations:**
  - `services/kairos-ml/app/main.py:547-635`
  - `services/kairos-ml/Dockerfile:1-12`
- **Evidence:**
  - Internal exception string is returned to callers:
    - `services/kairos-ml/app/main.py:632-635`
      - `raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")`
  - No explicit auth/allowlist in-app; service is intended as a compute backend:
    - `services/kairos-ml/README.md:1-14`
  - No explicit request size limits (arrays + horizon):
    - `services/kairos-ml/app/main.py:568-606` validates shape but not maximum sizes.
- **Impact:** If the service becomes reachable beyond trusted networks, attackers can (a) glean internal error details and (b) send oversized/heavy requests to exhaust CPU/memory.
- **Fix (recommended):**
  - Return a generic 500 message; keep details only in logs.
  - Add explicit max constraints to request models (e.g., max series length, max horizon, max batch items).
  - Disable/protect interactive docs (`/docs`, `/openapi.json`) in production if publicly reachable.
  - Add auth between Kairos and this service (or enforce network allowlists at the edge).
- **Mitigation (defense-in-depth):**
  - Enforce payload size limits, timeouts, and rate limits at the reverse proxy/ingress.
  - Use separate worker pools/queues for heavy models.
- **False positive notes:** If the service is strictly private (cluster-internal) with strong ingress controls, exposure is reduced; those controls are not in this repo.

### Low

#### 5) Client-side HTML sinks (`document.write` / `innerHTML`) exist; verify inputs stay trusted

- **Rule ID:** REACT-XSS-SINK-001
- **Severity:** Low (can become High if untrusted content reaches the sink)
- **Locations (examples):**
  - `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx:2940-2945`
  - `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx:2976-2981`
  - `apps/talos/public/clear-cache.html:52-99`
- **Evidence:**
  - `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx:2944-2945`
    - `popup.document.write(html)`
  - Server endpoint attempts to escape many fields when generating HTML:
    - `apps/talos/src/app/api/purchase-orders/[id]/pdf/route.ts:82-90` (`escapeHtml`)
- **Impact:** If a server endpoint ever returns attacker-influenced HTML/JS, it will execute in a privileged same-origin context.
- **Fix (recommended):**
  - Prefer generating PDFs/binary downloads rather than rendering raw HTML in a popup.
  - If HTML rendering is required, ensure server output escapes all dynamic fields and does not include scripts; consider a strict CSP on these endpoints/pages.
- **False positive notes:** Current PO PDF generator uses `escapeHtml` extensively, reducing risk; verify all dynamic fields are consistently escaped.

## Good practices noticed

- Next.js apps generally use `next start` for production scripts (no evidence of `next dev` as a production entrypoint).
- NextAuth secret is validated (`packages/auth/src/index.ts:101-105` requires `NEXTAUTH_SECRET` with minimum length).
- QBO OAuth flow uses a state cookie for CSRF (`apps/plutus/app/api/qbo/connect/route.ts:21-32`, `apps/plutus/app/api/qbo/callback/route.ts:55-63`).

## Recommended next steps (prioritized)

1) Tighten SSO redirect allowlists (`apps/sso/app/auth/relay/page.tsx`, `apps/sso/lib/auth.ts`) and add regression tests for tricky hostnames.
2) Replace forwarded-header-derived `callbackUrl` construction with canonical env-based origins (or enforce strict allowlists).
3) Harden `services/kairos-ml` for production exposure: auth/ingress restrictions, request size limits, and less-informative 500 responses.

