# Security Best Practices Report

Date: 2026-03-03  
Repo: `/Users/jarraramjad/dev/targonos-main`

## Executive summary

This monorepo is primarily **Next.js (TypeScript)** apps (React + Prisma) plus a **FastAPI (Python)** service (`services/kairos-ml`).

Top findings (and status on this branch):

- **Critical (fixed):** Argus had no auth boundary for pages + API routes. Added middleware requiring portal session/app entry.
- **Critical (fixed):** Argus ingest accepted client-controlled filesystem paths (`htmlPath`, `assetsDir`). Replaced with multipart zip upload + temp staging + ingest-from-HTML.
- **High (fixed):** Talos `/auth/login` allowed open redirects via unvalidated `callbackUrl` for authenticated users. Now only same-origin URLs are accepted and normalized to internal paths.
- **Medium (fixed):** Argus ingest remote fetch could be abused for SSRF if untrusted HTML is ingested. Added a remote asset allowlist + HTTPS-only in production.
- **Medium (fixed):** Kairos ML interactive docs/OpenAPI are now disabled by default and can be enabled via `KAIROS_ML_ENABLE_DOCS`.

## Scope & methodology

- Static review of repository source and config with targeted searches for common security sinks and auth/redirect flows.
- No dynamic runtime/header verification, no dependency vulnerability scan (`pnpm audit`/SCA), and no infrastructure/CDN/WAF/header configuration review (those controls may exist outside the repo).

## Findings

### Critical

#### 1) Argus: missing authentication/authorization boundary for pages + API routes

- **Rule ID:** NEXT-AUTHZ-BOUNDARY-001
- **Severity:** Critical
- **Location:** `apps/argus/middleware.ts:42-118` (auth boundary) and all Argus routes/pages
- **Evidence:**
  - App entry is enforced via `requireAppEntry`:
    - `apps/argus/middleware.ts:82-116`
- **Impact:** Without an app-level auth boundary, unauthenticated users could read/modify listing data and trigger side effects.
- **Fix (implemented):**
  - Added `apps/argus/middleware.ts` to require a portal session and redirect unauthenticated users to portal login with a callback URL.
  - API routes return 401/403 JSON instead of HTML redirects.
- **False positive notes:** If an external edge already blocks Argus, risk is reduced — that is not visible in app code, so the app now enforces the boundary directly.

#### 2) Argus: ingest endpoint accepted client-controlled filesystem paths

- **Rule ID:** NEXT-FILES-TRAVERSAL-001
- **Severity:** Critical
- **Location:**
  - `apps/argus/app/api/listings/[id]/ingest/route.ts:18-111`
  - `apps/argus/lib/ingest.ts:22-203`
- **Evidence:**
  - Ingest now requires multipart zip upload and stages extraction in a temp directory:
    - `apps/argus/app/api/listings/[id]/ingest/route.ts:18-111`
  - Ingest supports ingest-from-HTML without needing a raw HTML filesystem path in the DB:
    - `apps/argus/lib/ingest.ts:32-203`
- **Impact:** Allowing callers to choose file paths can lead to arbitrary file reads (local file inclusion) and DB/media contamination.
- **Fix (implemented):**
  - Removed JSON `htmlPath`/`assetsDir` ingestion; require multipart zip upload.
  - Prevents zip-slip by stripping leading slashes, skipping `.`/`..`, and ensuring extracted files stay within the staging directory.

### High

#### 3) Talos `/auth/login`: open redirect via `callbackUrl` when already authenticated

- **Rule ID:** NEXT-REDIRECT-OPEN-001
- **Severity:** High
- **Location:** `apps/talos/src/app/auth/login/page.tsx:12-63`
- **Evidence:**
  - `callbackUrl` is normalized to a same-origin internal path (and collapses `//...`):
    - `apps/talos/src/app/auth/login/page.tsx:14-44`
  - Authenticated redirect uses only the sanitized path:
    - `apps/talos/src/app/auth/login/page.tsx:46-49`
  - Portal login always receives a callback derived from app base + sanitized path:
    - `apps/talos/src/app/auth/login/page.tsx:60-63`
- **Impact:** Attackers could redirect already-authenticated users to an external site for phishing.
- **Fix (implemented):**
  - Absolute URLs are only accepted when `origin` matches `NEXT_PUBLIC_APP_URL` origin; otherwise the flow falls back to `/dashboard`.
  - Redirect targets are normalized to a single-leading-slash path before calling `redirect()`.

### Medium

#### 4) Argus ingest: remote fetch could be abused for SSRF if untrusted HTML is ingested

- **Rule ID:** NEXT-SSRF-OUTBOUND-001
- **Severity:** Medium
- **Location:** `apps/argus/lib/ingest.ts:314-398`
- **Evidence:**
  - Remote asset URLs are allowlisted and HTTPS-only in production:
    - `apps/argus/lib/ingest.ts:352-398`
- **Impact:** Attackers can attempt to force the server to fetch internal network resources during ingest.
- **Fix (implemented):**
  - Added `parseAllowedRemoteAssetUrl` to allow only known image domains and disallow non-standard ports; localhost is blocked in production.

#### 5) Kairos ML: OpenAPI/docs exposed by default

- **Rule ID:** FASTAPI-OPENAPI-001
- **Severity:** Medium
- **Location:** `services/kairos-ml/app/main.py:33-45`
- **Evidence:**
  - `/docs`, `/redoc`, and `/openapi.json` are disabled unless `KAIROS_ML_ENABLE_DOCS` is set:
    - `services/kairos-ml/app/main.py:33-45`
- **Impact:** Docs exposure increases attacker visibility into internal endpoints and payload shapes if the service becomes reachable.
- **Fix (implemented):**
  - Gate docs/OpenAPI behind `KAIROS_ML_ENABLE_DOCS`.

## Recommended next steps (prioritized)

1) Consider stricter authorization for Argus state-changing endpoints (ingest/reset/fetch), beyond app-level authentication.
2) Review forwarded header trust (`x-forwarded-*`) across apps and ensure the edge strips/sets these headers.
