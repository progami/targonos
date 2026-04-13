# Portal-Only Auth Centralization Design

## Purpose

Define a permanent auth and access architecture for TargonOS where the portal is the single authority for workforce identity, app grants, tenant membership, and redirect topology, while child apps consume signed claims and external business integrations remain app-owned.

This design is intended to stop recurring cross-environment auth regressions such as:

- `os` redirecting into `dev-os`
- child apps building login or callback URLs from mixed local and hosted sources
- portal login succeeding while an app still denies access through its own local user gate
- build-time public URLs and runtime URLs disagreeing

## Evidence From The Current Codebase

The current failures are architectural, not just provider-specific:

- Production child apps still read `.env.local` by default through [ecosystem.config.js](/Users/jarraramjad/dev/targonos-main/ecosystem.config.js:27) and [ecosystem.config.js](/Users/jarraramjad/dev/targonos-main/ecosystem.config.js:79).
- Talos local env contains hosted `dev-os` values in [apps/talos/.env.local](/Users/jarraramjad/dev/targonos-main/apps/talos/.env.local:4).
- Talos build artifacts prove `NEXT_PUBLIC_APP_URL` is baked as `https://dev-os.targonglobal.com/talos` in [apps/talos/.next/required-server-files.json](/Users/jarraramjad/dev/targonos-main/apps/talos/.next/required-server-files.json:5).
- Shared auth currently resolves origins from multiple ambient sources in [packages/auth/src/index.ts](/Users/jarraramjad/dev/targonos-main/packages/auth/src/index.ts:605).
- Child-app access is already partially centralized through `requireAppEntry()` in [packages/auth/src/index.ts](/Users/jarraramjad/dev/targonos-main/packages/auth/src/index.ts:1161), but Talos still performs a second local access decision through tenant/user checks in [apps/talos/src/app/api/tenant/select/route.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/app/api/tenant/select/route.ts:97).
- Talos still enriches session context from tenant-local user tables in [apps/talos/src/lib/auth.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/lib/auth.ts:138).
- Plutus already demonstrates the desired boundary for an external provider: portal session gates access first, then QBO OAuth remains app-owned in [apps/plutus/app/api/qbo/connect/route.ts](/Users/jarraramjad/dev/targonos-main/apps/plutus/app/api/qbo/connect/route.ts:20) and [apps/plutus/app/api/qbo/callback/route.ts](/Users/jarraramjad/dev/targonos-main/apps/plutus/app/api/qbo/callback/route.ts:39).
- Talos and Hermes SP-API connectivity is already separate from workforce login in [apps/talos/src/lib/amazon/client.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/lib/amazon/client.ts:531) and [apps/hermes/src/server/sp-api/connection-config.ts](/Users/jarraramjad/dev/targonos-main/apps/hermes/src/server/sp-api/connection-config.ts:91).

## Decisions

The design is based on the following approved choices:

- Portal-only authority for workforce identity and app access
- Tenant membership is centralized in the portal as well
- Keep the current provider stack for now; do not replace Google + NextAuth as the first move
- App-local user tables remain domain data only and do not participate in access decisions
- Roll out as a two-phase cutover
- External-provider integrations such as QBO, Amazon SP-API, and Amazon Ads remain app-owned

## Goals

- One workforce login system across the suite
- One central source of truth for app grants and tenant membership
- One canonical redirect and callback topology per environment
- Child apps trust signed portal claims and stop making their own access decisions
- External-provider connectivity continues to work without becoming part of workforce auth
- Environment drift becomes a startup/build failure instead of a runtime surprise

## Non-Goals

- Replacing Google or NextAuth in this project
- Moving QBO, SP-API, or Amazon Ads OAuth into the portal
- Removing domain-specific user or employee data tables that are still needed for business workflows
- Solving every domain-data modeling inconsistency inside Talos, Atlas, Hermes, or Argus as part of auth centralization

## Approaches Considered

### 1. Hardening Patch Only

Patch the current redirect and cookie bugs app by app while keeping the existing layered access model.

Why not:

- It leaves the main failure mode intact: multiple authorities and mixed environment sources.
- It guarantees continued regressions whenever one app drifts from the others.

### 2. Central Authority Model

Portal owns workforce identity, app grants, tenant membership, and redirect topology. Child apps consume signed claims. External integrations remain app-owned.

Why this is the selected approach:

- It matches the product model: one product suite, one operator identity, one launcher, one entitlement system.
- It preserves app autonomy where it actually matters: domain workflows and third-party account integrations.
- It removes the repeated class of bugs where login appears to work but child apps still deny access.

### 3. Full Auth Platform Replacement

Replace the current provider stack first and redesign around the new provider.

Why not now:

- The current outages are caused primarily by environment/build/runtime contamination and layered access logic.
- A provider swap without fixing those boundaries would recreate the same operational problems with different SDKs.

## Target Architecture

### 1. Portal As The Only Workforce Auth Authority

The portal owns:

- Google workforce login
- session issuance
- app grants
- tenant membership
- active tenant selection
- login/logout redirects
- callback validation
- app launch destinations

Child apps own:

- domain behavior
- domain data
- business workflows
- external-provider integrations needed by that app

Child apps do not own workforce login and do not decide whether a user is allowed into the app. They only verify the signed portal claims and continue.

### 2. Identity And Redirect Topology

OAuth for workforce login exists in one place only: the portal.

Rules:

- One Google OAuth client per environment
- One callback owner per environment
- Only the portal handles `/api/auth/callback/google`
- One canonical app registry defines `appId`, environment, origin, base path, lifecycle, and enabled state
- Child apps never generate absolute login targets from ad hoc mixes of env variables, headers, and runtime guesses
- Child apps hand off only:
  - `appId`
  - requested relative path and query
- The portal resolves the canonical absolute target from the registry
- The portal validates callback targets against the registry and never trusts arbitrary absolute callback URLs from apps

Outcome:

- `os` cannot redirect to `dev-os`
- `dev-os` cannot redirect to `os`
- callback construction is no longer duplicated in each child app

### 3. External Integrations Boundary

Workforce auth and external-provider connectivity are different layers and must remain separate.

Portal auth answers:

- who is the employee
- which apps can they enter
- which tenant is active

App integration layers answer:

- is this tenant connected to QBO
- is this Amazon seller account connected
- do valid SP-API or Ads tokens exist for this tenant/account

Examples already present in the codebase:

- Plutus gates QBO connect/callback with portal session checks in [apps/plutus/app/api/qbo/connect/route.ts](/Users/jarraramjad/dev/targonos-main/apps/plutus/app/api/qbo/connect/route.ts:20) and [apps/plutus/app/api/qbo/callback/route.ts](/Users/jarraramjad/dev/targonos-main/apps/plutus/app/api/qbo/callback/route.ts:39)
- Talos builds SP-API clients from app credentials and refresh tokens in [apps/talos/src/lib/amazon/client.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/lib/amazon/client.ts:531)
- Hermes loads SP-API connection config per account in [apps/hermes/src/server/sp-api/connection-config.ts](/Users/jarraramjad/dev/targonos-main/apps/hermes/src/server/sp-api/connection-config.ts:91)
- Amazon Ads setup in Argus is a separate provider authorization flow in [apps/argus/scripts/api/weekly-sources/setup-sp-ads-oauth.py](/Users/jarraramjad/dev/targonos-main/apps/argus/scripts/api/weekly-sources/setup-sp-ads-oauth.py:17)

Design rule:

- portal login never becomes QBO/SP-API/Amazon Ads login
- external-provider callbacks stay with the owning app or integration service
- those callbacks validate current portal claims and permissions, but they do not participate in workforce identity

### 4. Session And Claims Contract

Portal issues a single signed session consumed by every child app.

Required claims:

- `sub`
- `email`
- `name`
- `authz.version`
- `globalRoles`
- app grants by `appId`
- `tenantMemberships`
- `activeTenant`
- a contract version field for claim-shape migration

The current shared primitives already contain the beginning of this shape in [packages/auth/src/index.ts](/Users/jarraramjad/dev/targonos-main/packages/auth/src/index.ts:298) and [packages/auth/src/index.ts](/Users/jarraramjad/dev/targonos-main/packages/auth/src/index.ts:809). The target contract simplifies app behavior to:

1. verify the portal-signed session
2. verify the app grant
3. read `activeTenant`
4. derive app context from that claim
5. fail hard if the claim is missing, invalid, or stale

Child apps must no longer:

- use local DB lookups to decide entry authorization
- auto-provision local users during tenant selection
- maintain a second tenant-access gate behind portal login
- probe multiple fallback systems on the request path to guess whether a session is valid

Talos examples to eliminate from the auth path:

- tenant-local user enrichment in [apps/talos/src/lib/auth.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/lib/auth.ts:138)
- tenant access enforcement in [apps/talos/src/app/api/tenant/select/route.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/app/api/tenant/select/route.ts:97)

Local user tables can continue to exist, but only as domain data. They are not an authority for login or access.

### 5. Runtime And Deployment Contract

This design fails if environment resolution remains ambiguous.

Required production rules:

- Production never reads `.env.local`
- Build-time public env is immutable per environment
- `dev` and `main` never share `.next` outputs or other deploy artifacts
- Runtime supplies secrets and process settings only
- Runtime does not reinterpret public origin topology after build
- Child apps receive canonical app URL and base path from the registry/build contract

Rule of responsibility:

- build decides public topology
- runtime supplies secrets
- portal decides workforce auth
- apps decide domain behavior only

Any mismatch between:

- target environment
- portal origin
- app origin/base path
- built `NEXT_PUBLIC_*` values
- runtime values

must fail build or startup hard.

No localhost fallback in production. No ambient inference in production. No silent repair path.

## Two-Phase Cutover

### Phase 1: Centralize Authority Without Breaking The Suite

- keep the current portal session mechanism
- move app grants and tenant membership into portal-issued claims
- make child apps consume claims only for entry authorization
- keep local app tables as domain data only
- add compatibility adapters where an app still expects old shapes
- preserve child-app external integrations as-is

Allowed temporary compatibility in Phase 1 only:

- thin child-app login pages are allowed only as redirects to portal login
- app-local session helpers are allowed only if they map portal claims into app-local request context and do not make access decisions
- local domain-data lookups are allowed only after entry and never as entry authorization

### Phase 2: Remove The Old Model

- delete app-local authz and tenant-access gates
- delete production env patterns that allow `.env.local`
- delete duplicated child-app callback/origin builders
- delete child-app ownership of workforce login except migration redirects
- fail deploy if built public URLs do not match the target environment

Exit criteria for Phase 2:

- no child app can deny entry for a portal-authorized user except through explicit app-grant policy from portal claims
- no child app mutates access state during tenant selection
- no production process can start with local env contamination

## Verification And Release Gates

This architecture needs enforced verification, not spot checks.

### Browser Smoke

Required for both `os` and `dev-os`:

- real Google login
- actual screenshot of the visible authenticated portal
- direct deep-link navigation into every app
- actual screenshot of each visible app screen
- no launcher-only verification

Critical route examples:

- Talos purchase orders
- Atlas employees
- xPlan workbook
- Plutus settlements
- Hermes orders or insights
- Argus WPR or monitoring
- Website promoted routes

### Environment And Build Verification

Release gate must compare:

- expected environment name
- portal origin
- app origin/base path
- built `NEXT_PUBLIC_*` values
- runtime values

If any mismatch exists, deployment fails.

### Version Verification

Each app already exposes version/build data in the UI or build env. Release verification must assert the visible version badge or equivalent build marker on the tested screen so browser checks confirm the deployed build rather than stale client state.

### Success Condition

The architecture is considered successful when:

- one employee logs in once through the portal
- every child app accepts the same signed portal session
- tenant selection is globally consistent
- external integrations still work because they remain app-owned
- no environment can redirect into another environment

## Testing Strategy For Implementation

Implementation planning should produce:

- shared auth contract tests for claim shape and app grant handling
- environment topology tests for registry/build/runtime consistency
- portal login deep-link browser smoke for `os` and `dev-os`
- app-specific smoke for critical direct URLs
- negative tests proving:
  - app grant denied
  - tenant membership missing
  - environment mismatch at startup
  - invalid callback target rejected

## Risks

- Existing app flows may still rely on local user tables for more than domain data. Those dependencies need to be identified and moved off the entry path without breaking workflows.
- Some apps may currently assume tenant selection mutates local access state. That assumption must be removed deliberately.
- Environment cleanup will surface hidden deployment debt quickly. That is desirable, but it will initially feel stricter because the suite has been relying on ambiguous configuration.

## Implementation Principle

Do not chase auth bugs app by app anymore.

Fix the authority model, the claim contract, and the deployment contract once. Then make every app conform to that contract and fail loudly when it does not.
