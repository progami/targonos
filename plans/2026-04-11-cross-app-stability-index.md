# 2026-04-11 Cross-App Stability Index

## Goal
Summarize the full 2026-04-11 stability sweep across the active app suite and rank the fixes that matter most. This index covers `36` per-app specs plus the runtime discovery baseline in [cross-app-ci-smoke-spec](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md).

## Coverage
- Apps covered: `sso`, `talos`, `atlas`, `xplan`, `kairos`, `plutus`, `hermes`, `argus`, `website`
- Domains covered per app: `auth`, `navigation`, `ui-visibility`, `business-logic`
- Baseline runtime evidence: [cross-app-ci-smoke-spec](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md)

## Executive Summary
- Every active app has confirmed stability defects.
- The biggest shared defect is topology drift: local ports, base paths, portal launcher URLs, and app env origins do not agree. That instability shows up in auth handoff, navigation, and smoke coverage across nearly the whole suite.
- The second biggest shared defect is permissive fallback behavior. Multiple apps silently fall back to production URLs, wrong hosts, wrong strategies, wrong marketplaces, empty states, or partial-success writes instead of hard-failing.
- Current CI proves builds, not runtime. The browser discovery spec already shows real first-screen failures escaping green CI in `sso`, `talos`, `xplan`, `kairos`, and `website`.

## Immediate Fix Order
1. `sso`
   Portal callback/origin/launcher correctness is upstream of every role-gated app. Fixing SSO and the shared local topology removes the largest cross-app source of false auth and bad redirects.
2. `talos`
   Talos currently fails the first meaningful local workflow after region selection, with `401` tenant/session calls and a captured React runtime error in the smoke pass.
3. `website`
   Public-promoted routes are chunk-failing and crashing on click. This is a direct production-quality issue with no auth complexity hiding it.
4. `xplan`
   xPlan visibly boots into a degraded shell while auth-backed APIs fail. That is a high-risk “looks loaded but is not actually usable” state.
5. `kairos`
   Kairos is blocked at entry in current local smoke and its main data views mask failures as empty/not-found states.
6. `hermes`
   Hermes boots, but its auth env drift, broad bypass behavior, and broken review/campaign/experiment workflow logic make it unsafe.
7. `atlas`
   Atlas boots, but several read routes mutate state and generic write routes bypass the intended workflow transitions.
8. `plutus`
   Plutus boots, but setup/cashflow logic can preserve stale state or produce materially wrong finance output.
9. `argus`
   Argus boots, but it still has public-boundary drift, broken legacy redirect contracts, and hardcoded workstation-local data paths.

## Shared Root Causes
- `Topology drift across env, package scripts, and launcher maps`
  Affects `sso`, `talos`, `atlas`, `xplan`, `kairos`, `plutus`, `hermes`, `argus`, `website`.
  Common pattern: package port, `.env.local`, `dev.local.apps.json`, and `apps/sso/lib/apps.ts` disagree.
- `Env-first origin and callback construction`
  Affects `sso`, `talos`, `atlas`, `xplan`, `kairos`, `plutus`, `hermes`, `argus`, `website`.
  Common pattern: auth/login/callback/portal links prefer checked-in env values over the actual request origin.
- `Unsafe recovery and fallback routing`
  Affects `atlas`, `xplan`, `kairos`, `plutus`, `hermes`, `argus`, `website`, `sso`.
  Common pattern: `no-access` and recovery links fall back to `/` or a hosted portal/auth URL, and misconfiguration is tolerated instead of rejected.
- `UI surfaces masking real failure as empty or not-found state`
  Affects `talos`, `xplan`, `kairos`, `website`, `argus`, `plutus`, `sso`.
  Common pattern: broken auth/data paths still render a shell, empty state, or misleading “not found” screen.
- `Workflow state split across multiple authorities`
  Affects `talos`, `atlas`, `xplan`, `plutus`, `hermes`, `website`, `argus`.
  Common pattern: more than one source of truth for status, identity, mapping, or workflow ownership.
- `Browser coverage missing the actual failure paths`
  Affects the whole suite.
  Common pattern: tests prove static render or skip auth entirely, while runtime launch/auth/chunk failures remain undetected.

## Domain Summary
- `Auth`
  The auth problem is mostly not “auth code is absent.” It is “auth decisions are built on inconsistent origin/config data.” `sso`, `xplan`, `kairos`, `plutus`, `hermes`, `argus`, `atlas`, and `talos` all show some combination of callback drift, duplicated auth logic, bypass drift, or entitlement mismatch.
- `Navigation`
  Base-path and canonical-route ownership are fragmented. Multiple apps maintain route contracts in several places and silently normalize or redirect instead of failing when the requested path is wrong.
- `UI visibility`
  The common failure mode is partial render without usable workflow access. `talos`, `xplan`, `kairos`, and `website` are the clearest cases; `hermes` and `plutus` also have shell and visibility gaps.
- `Business logic`
  The suite has confirmed state-integrity issues, not just UX issues. Read routes mutate state in `atlas`, permissive writes mislead callers in `xplan` and `plutus`, identity/state is split in `talos` and `website`, and Hermes campaign/experiment/template workflow is incomplete but already exposed.

## Critical Runtime Evidence
- `sso`
  Local Google sign-in used production callback/origin values and landed on hosted SSO configuration error instead of returning to local SSO.
- `talos`
  Region selection on `/talos` triggered `401` on tenant/session bootstrap endpoints and then a captured React runtime failure.
- `xplan`
  Workbook shell rendered while `/api/v1/xplan/assignees` returned `401`, producing visible degraded state instead of a hard auth failure.
- `kairos`
  Local smoke reached `/kairos/no-access` rather than a usable forecasting workspace.
- `website`
  Promoted `/cs/us/*` route chunks returned `400`, and clicking `Packs` produced a `ChunkLoadError`.

## App Priority Map
- `sso`
  Highest-risk findings: wrong-origin auth callback flow, launcher resolution that silently falls back to production, dead `/xplan` relay, and portal tile visibility that does not match launchability.
- `talos`
  Highest-risk findings: unauthenticated tenant bootstrap, dashboard dead-end after auth failure, stale `/market` routing, shipment-planning disconnect, and GRN/PI split-brain workflow state.
- `atlas`
  Highest-risk findings: read routes that mutate policy/review state, generic PATCH routes bypassing workflow transitions, broken no-access recovery, and leave/upload/offboarding contract defects.
- `xplan`
  Highest-risk findings: page/API auth split, strategy-access degradation via process-global fallback, workbook status calculated globally rather than per strategy, and root/deep-link contract drift.
- `kairos`
  Highest-risk findings: production-pinned local auth origins, unusable local entry due to access gating, create-and-run forecast partial success, and empty/not-found screens masking failed data loads.
- `plutus`
  Highest-risk findings: auth and QBO identity split, callback status loss at root redirect, setup state drift around `productExpenses` and `accountsCreated`, and stale-token cashflow refresh behavior.
- `hermes`
  Highest-risk findings: production-pinned standalone auth, overly broad dev bypass, US request-review hard-disabled, global campaign/experiment scope, and stub template workflow.
- `argus`
  Highest-risk findings: public-entry auth policy drift, broken legacy tracking redirect contract, WPR infinite-loading failure path, `UNKNOWN` owner filter drift, and workstation-local data roots.
- `website`
  Highest-risk findings: promoted route chunk failures, US-only shared shell hiding UK flow, region selector skipping canonical region homepages, and wrong UK retail destinations.

## Execution Order
- `Phase 1: Shared topology and auth`
  Fix `sso` plus the single-source-of-truth problem for local ports, app origins, portal origins, and base paths. Then remove silent production fallbacks from launcher and child-app auth/callback construction.
- `Phase 2: First-screen runtime hardening`
  Fix `talos`, `website`, `xplan`, and `kairos` so the first meaningful route either renders correctly or hard-fails with an explicit recovery state.
- `Phase 3: Workflow integrity`
  Fix state-machine and source-of-truth defects in `atlas`, `talos`, `xplan`, `plutus`, and `hermes`.
- `Phase 4: Coverage`
  Implement the repo-level browser smoke suite described in [cross-app-ci-smoke-spec](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md) and make it hard-fail on the current classes of issues.

## Spec Links
- `sso`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-business-logic-spec.md)
- `talos`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-talos-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-talos-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-talos-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-talos-business-logic-spec.md)
- `atlas`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-atlas-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-atlas-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-atlas-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-atlas-business-logic-spec.md)
- `xplan`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-business-logic-spec.md)
- `kairos`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-business-logic-spec.md)
- `plutus`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-plutus-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-plutus-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-plutus-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-plutus-business-logic-spec.md)
- `hermes`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-hermes-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-hermes-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-hermes-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-hermes-business-logic-spec.md)
- `argus`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-argus-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-argus-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-argus-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-argus-business-logic-spec.md)
- `website`: [auth](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-website-auth-spec.md), [navigation](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-website-navigation-spec.md), [ui](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-website-ui-visibility-spec.md), [business](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-website-business-logic-spec.md)

## Decision Rule For Fixes
- Do not add more fallback behavior.
- Normalize each app to one canonical origin, one canonical base path, one canonical auth decision path, and one canonical workflow source of truth.
- Where config is missing or wrong, fail loudly and early instead of silently redirecting to production, rendering empty state, or partially committing workflow state.
