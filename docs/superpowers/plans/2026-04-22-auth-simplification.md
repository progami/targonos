# Portal Auth Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the current multi-layer portal auth stack into one real identity provider (`apps/sso`) and one shared consumer-session verifier for every other app, while fixing CI gaps that let auth regressions ship unnoticed.

**Architecture:** Keep Google OAuth and session issuance in `apps/sso` only. Move Talos, X-Plan, and Kairos off local NextAuth wrappers and onto the same direct portal-session decoding model Atlas already uses, with shared redirect helpers in `packages/auth`. Isolate worktree-dev auth from portal smoke tests and add CI coverage for app-level auth contracts.

**Tech Stack:** Next.js 16, Auth.js / NextAuth v5 beta, shared `@targon/auth` package, Playwright, Prisma, PostgreSQL.

---

### Task 1: Freeze The Consumer Auth Contract In `@targon/auth`

**Files:**
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/src/middleware-login.ts`
- Modify: `packages/auth/src/index.test.ts`
- Modify: `packages/auth/src/middleware-login.test.ts`

- [ ] **Step 1: Add one shared consumer-session reader API**
Define a single exported helper that consumer apps can call from route handlers and server components without spinning up local NextAuth:
```ts
export type PortalConsumerSession = {
  payload: PortalJwtPayload
  authz: PortalAuthz
  activeTenant: string | null
}

export async function readPortalConsumerSession(options: {
  request: Request | { headers: Headers }
  appId: string
  cookieNames?: string[]
  secret?: string
  debug?: boolean
}): Promise<PortalConsumerSession | null>
```

- [ ] **Step 2: Keep redirect building in the shared package**
Extend the shared redirect helper surface so every app builds login redirects the same way:
```ts
export function buildAppLoginRedirect(input: {
  portalOrigin: string
  appOrigin: string
  appBasePath: string
  pathname: string
  search: string
  hash?: string
}): URL
```
Do not leave Talos-specific callback URL logic scattered in page files.

- [ ] **Step 3: Add contract tests for local, hosted, and base-path cases**
Cover:
```ts
test('readPortalConsumerSession returns claims and normalized authz', async () => {})
test('readPortalConsumerSession returns null on decrypt failure', async () => {})
test('buildAppLoginRedirect preserves hosted base paths', () => {})
test('buildAppLoginRedirect preserves loopback origins when explicitly passed', () => {})
```

- [ ] **Step 4: Run the shared auth test suite**
Run:
```bash
pnpm --filter @targon/auth test
pnpm --filter @targon/auth type-check
```
Expected: all tests pass.

### Task 2: Remove Local NextAuth Wrappers From Consumer Apps

**Files:**
- Modify: `apps/xplan/lib/auth.ts`
- Modify: `apps/kairos/lib/auth.ts`
- Modify: `apps/talos/src/lib/auth.ts`
- Modify: `apps/xplan/app/api/auth/[...nextauth]/route.ts`
- Modify: `apps/kairos/app/api/auth/[...nextauth]/route.ts`
- Modify: `apps/talos/src/app/api/auth/[...nextauth]/route.ts`
- Test: `apps/xplan/tests/**`
- Test: `apps/kairos/lib/**/*.test.ts`
- Test: `apps/talos/src/**/*.test.ts`

- [ ] **Step 1: Replace X-Plan and Kairos `auth()` with direct session decoding**
Delete the empty-provider NextAuth bootstrap in `apps/xplan/lib/auth.ts` and `apps/kairos/lib/auth.ts`. Replace it with a thin wrapper around `readPortalConsumerSession(...)`.

- [ ] **Step 2: Convert Talos `auth()` to the same model**
Keep Talos’s user enrichment and tenant resolution, but move the starting point from `nextAuth.auth()` to the shared consumer-session reader. Preserve:
```ts
applyPortalClaimsToSession(...)
enrichTalosSessionUser(...)
tryGetCurrentTenantCode(...)
```
Remove local NextAuth handler/signIn/signOut exports if nothing still uses them.

- [ ] **Step 3: Remove dead local auth routes**
For X-Plan and Kairos, delete the `[...nextauth]` route handlers entirely if no client code depends on `/api/auth/*`.
For Talos, remove the route once the page/API surface no longer needs it.

- [ ] **Step 4: Add per-app auth tests**
Add focused tests for:
```ts
test('xplan auth returns null when portal cookie is missing', async () => {})
test('kairos auth returns claims from the shared portal cookie', async () => {})
test('talos auth enriches portal claims with tenant user data', async () => {})
```

- [ ] **Step 5: Run app verification**
Run:
```bash
pnpm --filter @targon/xplan type-check
pnpm --filter @targon/kairos type-check
pnpm --filter @targon/talos type-check
pnpm --filter @targon/xplan test
pnpm --filter @targon/kairos test
pnpm --filter @targon/talos test
```

### Task 3: Eliminate Callback URL Drift In Talos

**Files:**
- Modify: `apps/talos/src/lib/portal.ts`
- Modify: `apps/talos/src/app/**/*.tsx`
- Modify: `apps/talos/src/components/**/*.tsx`
- Test: `apps/talos/src/lib/portal.test.ts`

- [ ] **Step 1: Replace every manual callback builder with one helper**
Find all remaining patterns like:
```ts
`${window.location.origin}${withBasePath('/some/path')}`
```
and:
```ts
`${portalAuth}/login?callbackUrl=${encodeURIComponent(...)}`
```
Replace them with `buildAppCallbackUrl(...)` or the shared middleware redirect helper.

- [ ] **Step 2: Cover the remaining Talos login entry points**
At minimum, update:
```text
apps/talos/src/app/operations/*
apps/talos/src/app/config/*
apps/talos/src/components/purchase-orders/purchase-order-flow.tsx
apps/talos/src/components/layout/main-nav.tsx
```

- [ ] **Step 3: Expand Talos redirect tests**
Add assertions for representative routes:
```ts
test('buildAppCallbackUrl prefixes /talos for dashboard', () => {})
test('buildAppCallbackUrl prefixes /talos for market routes', () => {})
test('buildAppCallbackUrl prefixes /talos for operations routes', () => {})
```

- [ ] **Step 4: Run Talos checks**
Run:
```bash
pnpm --filter @targon/talos exec tsx src/lib/portal.test.ts
pnpm --filter @targon/talos type-check
```

### Task 4: Isolate Worktree Dev Auth From Portal Smoke And CI-Like Runs

**Files:**
- Modify: `scripts/setup-codex-env.mjs`
- Modify: `packages/auth/src/index.ts`
- Modify: `apps/sso/playwright.config.ts`
- Modify: `apps/sso/tests/e2e.spec.ts`
- Modify: `apps/sso/tests/fixtures/dev-login.ts`
- Test: `packages/auth/src/index.test.ts`

- [ ] **Step 1: Stop injecting worktree-dev auth into SSO by default**
`scripts/setup-codex-env.mjs` should not set:
```text
TARGON_WORKTREE_DEV_AUTH
TARGON_WORKTREE_DEV_USER_*
TARGON_WORKTREE_DEV_AUTHZ_JSON
```
for `apps/sso` unless an explicit opt-in is passed.

- [ ] **Step 2: Make the bypass impossible during Playwright smoke**
In `apps/sso/playwright.config.ts`, explicitly clear the bypass env before starting the local portal:
```ts
env: {
  ...process.env,
  TARGON_WORKTREE_DEV_AUTH: '',
  TARGON_WORKTREE_DEV_USER_ID: '',
  TARGON_WORKTREE_DEV_USER_EMAIL: '',
  TARGON_WORKTREE_DEV_USER_NAME: '',
  TARGON_WORKTREE_DEV_AUTHZ_JSON: '',
}
```

- [ ] **Step 3: Add regression tests for bypass precedence**
Cover:
```ts
test('cookie-backed session wins when worktree bypass is disabled', async () => {})
test('portal smoke env does not render the worktree dev identity', async () => {})
```

- [ ] **Step 4: Rerun the portal smoke**
Run:
```bash
pnpm --filter @targon/sso test:auth-smoke
```
Expected: the authenticated launcher smoke passes with the seeded Playwright identity.

### Task 5: Fix CI Coverage Holes

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/atlas/package.json`
- Modify: `apps/sso/package.json`
- Modify: root `package.json` if needed

- [ ] **Step 1: Make Atlas default tests include unit coverage**
Change `apps/atlas/package.json` so CI does not skip auth-related unit tests:
```json
"test": "pnpm test:unit && pnpm test:integration && cd tests && playwright test"
```
If runtime cost is too high, add a dedicated CI step for `pnpm --filter @targon/atlas test:unit`.

- [ ] **Step 2: Add an explicit cross-app auth verification step**
In `.github/workflows/ci.yml`, add a non-filtered auth job that always runs:
```yaml
- name: Run cross-app auth unit coverage
  run: |
    pnpm --filter @targon/auth test
    pnpm --filter @targon/sso test:auth-contracts
    pnpm --filter @targon/atlas test:unit
```

- [ ] **Step 3: Keep SSO smoke, but make it deterministic**
Ensure the `test:auth-smoke` job uses CI env only and does not inherit worktree-dev auth state.

- [ ] **Step 4: Verify the CI command set locally**
Run:
```bash
pnpm run test:auth-topology
pnpm --filter @targon/auth test
pnpm --filter @targon/sso test:auth-contracts
pnpm --filter @targon/atlas test:unit
```

### Task 6: Supabase Spike Only After The Simplification Lands

**Files:**
- Create: `docs/superpowers/plans/2026-04-22-supabase-auth-spike.md`
- Create: isolated spike code under a disposable branch/worktree

- [ ] **Step 1: Timebox a spike**
Do not migrate production auth first. Build a spike that proves:
```text
Google sign-in
SSR cookie handling for Next.js
cross-app redirect behavior
custom claims for app grants and tenant memberships
local dev story
```

- [ ] **Step 2: Keep the current entitlement model out of the spike scope**
Do not rewrite `UserApp`, `GroupAppMapping`, or `tenantMemberships` during the initial identity-provider spike.

- [ ] **Step 3: Exit with a go/no-go memo**
The spike output should answer:
```text
Does Supabase actually remove code from consumer apps?
Can it carry our authz + tenant claims cleanly?
Does it simplify multi-app cookie/session behavior more than the refactor above?
```

### Exit Criteria

- [ ] Only `apps/sso` issues real sessions.
- [ ] Consumer apps read portal sessions through one shared `@targon/auth` contract.
- [ ] Talos has no manual callback URL builders left.
- [ ] Worktree-dev auth no longer contaminates SSO smoke runs.
- [ ] Atlas auth-related unit tests run in CI.
- [ ] `pnpm --filter @targon/sso test:auth-smoke` passes locally in a clean repo state.
- [ ] A Supabase decision is made from a spike, not from frustration.

### Recommendation

- [ ] Implement Tasks 1-5 first.
- [ ] Only start Task 6 after Tasks 1-5 are green.
