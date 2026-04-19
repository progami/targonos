# Argus WPR Parity Design

## Purpose

Rebuild Argus `/wpr` as a single-page dashboard that reaches exact feature parity with the generated WPR HTML dashboard while keeping the rendered result as visually close to the HTML as practical inside Argus.

This is not a light polish pass over the current WPR React screens. It is a structural replacement of the current route-split WPR experience with a single dashboard shell whose behavior matches the HTML reference model.

## Scope

In scope:

- Argus WPR frontend architecture
- Argus WPR payload typing and API contract
- Parity for all HTML dashboard tabs:
  - `SQP`
  - `SCP`
  - `BR`
  - `TST`
  - `Change Log`
  - `Compare`
  - `Sources`
- Shared dashboard state parity:
  - active tab
  - selected week
  - root and term selections
  - compare toggles
  - competitor selections
  - expanded rows
  - sorting
  - week-over-week mode
- Redirect behavior for old route-era WPR paths
- Verification tooling and parity checklist coverage needed to hold the port against the HTML reference

Out of scope:

- Replacing the Python builder as the source of truth
- Embedding the generated HTML directly into Argus as the final implementation
- Changing the underlying WPR business logic in the generator except where the React port reveals a missing payload contract
- Rebranding the dashboard into a new Argus-native look
- General Argus design cleanup outside what is necessary to match the WPR HTML dashboard

## Evidence

### The Generator Already Produces Two Outputs From One Payload

The WPR builder writes both the standalone HTML dashboard and the JSON bundle from the same generated payload:

- [apps/argus/scripts/wpr/build_intent_cluster_dashboard.py](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/scripts/wpr/build_intent_cluster_dashboard.py:10103)

The latest generated artifacts live in the local WPR workspace output directory:

- HTML: [WPR-Dashboard-latest.html](</Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/WPR/wpr-workspace/output/WPR-Dashboard-latest.html>)
- JSON: [wpr-data-latest.json](</Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/WPR/wpr-workspace/output/wpr-data-latest.json>)

This means parity is not a “different data source” problem. It is an application-structure and rendering problem.

### Argus Does Not Render The HTML Dashboard

Argus reads only `wpr-data-latest.json` in:

- [apps/argus/lib/wpr/reader.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/lib/wpr/reader.ts:34)

The client fetch layer uses JSON endpoints only:

- [apps/argus/hooks/use-wpr.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/hooks/use-wpr.ts:15)
- [apps/argus/app/api/wpr/weeks/route.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/api/wpr/weeks/route.ts:1)
- [apps/argus/app/api/wpr/weeks/[week]/route.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/api/wpr/weeks/[week]/route.ts:1)
- [apps/argus/app/api/wpr/sources/route.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/api/wpr/sources/route.ts:1)
- [apps/argus/app/api/wpr/changelog/route.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/api/wpr/changelog/route.ts:1)

Current Argus WPR is therefore a separate React implementation that consumes the bundle, not a rendering of the reference dashboard.

### The Current Argus WPR Structure Already Diverges From The HTML

The generated HTML top bar contains seven tabs:

- `SQP`
- `SCP`
- `BR`
- `TST`
- `Change Log`
- `Compare`
- `Sources`

Those appear in:

- [WPR-Dashboard-latest.html](</Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/WPR/wpr-workspace/output/WPR-Dashboard-latest.html:1406>)

Current Argus WPR exposes only five route-driven tabs:

- `SQP`
- `Compare`
- `Competitor`
- `Changelog`
- `Sources`

Those appear in:

- [apps/argus/components/wpr/wpr-layout.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/components/wpr/wpr-layout.tsx:17)

This proves Argus does not currently provide exact feature parity.

### The Current Payload Typing Silently Drops Reference-Dashboard Data

The builder includes `scp` and `businessReports` in the emitted payload:

- [apps/argus/scripts/wpr/build_intent_cluster_dashboard.py](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/scripts/wpr/build_intent_cluster_dashboard.py:10132)

But the TypeScript `WprPayload` contract does not model those fields:

- [apps/argus/lib/wpr/types.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/lib/wpr/types.ts:351)

That mismatch makes `SCP` and `BR` impossible to render honestly in the current React implementation.

### The Current Argus UI Is Route-Split, While The HTML Is One Shared Dashboard

Current Argus uses separate route pages:

- [apps/argus/app/(app)/wpr/page.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/(app)/wpr/page.tsx:48)
- [apps/argus/app/(app)/wpr/compare/page.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/(app)/wpr/compare/page.tsx:1)
- [apps/argus/app/(app)/wpr/competitor/page.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/(app)/wpr/competitor/page.tsx:1)
- [apps/argus/app/(app)/wpr/changelog/page.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/(app)/wpr/changelog/page.tsx:1)
- [apps/argus/app/(app)/wpr/sources/page.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/(app)/wpr/sources/page.tsx:1)

The HTML is one app with one top bar, one week selector, one `reportData` object, and in-page tab switching. The React port drift is therefore architectural, not incidental.

## Approved Decisions

The following decisions were confirmed during design:

- Parity target is exact feature parity with visuals pushed as close to the HTML as practical.
- The WPR port should not preserve the current route-split React structure.
- `/wpr` is the only required entrypoint for the new dashboard.
- The correct frontend model is a single-page dashboard shell with in-page tab switching and shared dashboard state.
- The generated HTML remains the reference implementation during the port.
- The JSON payload remains the backend source of truth for Argus.

## Goals

- Make Argus `/wpr` behave like the HTML dashboard, not like a different analytics page that happens to use the same data.
- Restore all missing HTML tabs and controls.
- Align the dashboard state model with the HTML so selection and tab behavior stop drifting.
- Make the React port visually close enough to the HTML that users experience them as the same dashboard.
- Remove the current type/API blind spots that hide payload fields the HTML already uses.
- Add explicit parity verification so the React port stays matched to the generator output.

## Non-Goals

- Replacing the generator with a TypeScript implementation
- Shipping a mixed system where some tabs are HTML and some tabs are React
- Preserving the current Argus WPR route layout for its own sake
- Inventing new WPR tabs, cards, or Argus-native information architecture
- Broad cleanup of unrelated Argus components

## Approaches Considered

### 1. Literal React Port Of The HTML App

Rebuild the dashboard as a single React shell in Argus and port each HTML tab into React while preserving the HTML’s state model and control surface.

Why this is the selected approach:

- It is the only maintainable path that can honestly satisfy “closer to 1” parity.
- It keeps Argus on native React components instead of embedding opaque HTML/JS.
- It aligns the frontend architecture with the reference dashboard instead of fighting it.

### 2. Retrofit The Existing Route-Split Argus WPR Screens

Keep the current pages and patch in missing tabs and controls.

Why not:

- The current integration boundary is already wrong.
- The HTML is one shared stateful dashboard while the current port is route-split.
- This would continue the drift instead of removing its cause.

### 3. Compatibility Layer Around The Standalone HTML

Mount the standalone HTML behavior inside Argus and gradually wrap it.

Why not:

- It is the fastest short-term parity path but the worst long-term ownership model.
- It keeps the implementation opaque and hard to test.
- It defeats the purpose of owning the dashboard inside Argus.

## Target Design

### 1. Route Model

The WPR experience becomes one dashboard page rooted at `/wpr`.

Rules:

- `/wpr` renders the full single-page WPR shell.
- The shell owns tab switching in client state rather than relying on separate route pages.
- Legacy route-era pages such as:
  - `/wpr/compare`
  - `/wpr/competitor`
  - `/wpr/changelog`
  - `/wpr/sources`
  must redirect to:
  - `/wpr?tab=compare`
  - `/wpr?tab=tst`
  - `/wpr?tab=changelog`
  - `/wpr?tab=sources`
- The `/wpr` shell must honor the initial `tab` query parameter on first render.
- The old route components are transitional only and must not remain first-class implementations after the port lands.

### 2. Dashboard Shell

Create a dedicated WPR dashboard shell that mirrors the HTML app model.

Responsibilities:

- render the top bar
- render all dashboard tabs in one shell
- manage the active tab
- manage selected week
- coordinate shared cross-tab state
- preserve selections while switching tabs when the HTML does
- centralize dashboard-level empty/error/loading states

The shell should be the only place that understands tab activation and dashboard-global controls.

### 3. Shared State Model

The current WPR store must expand to match the HTML runtime model.

Required shared state:

- `activeTab`
- `selectedWeek`
- `selectedSqpClusterIds`
- `selectedSqpTermIds`
- `expandedSqpClusterIds`
- `selectedCompetitorRootIds`
- `selectedCompetitorTermIds`
- `expandedCompetitorRootIds`
- `compareOrganicMode`
- `weekOverWeekEnabled`
- tab-specific sorts and toggle state required by the HTML

Rules:

- state must survive tab switches within `/wpr`
- state resets must follow HTML behavior, not current React convenience behavior
- selected week remains global to the dashboard
- tab-local defaults should be initialized exactly once per dashboard session where the HTML does so

### 4. Payload Contract

Argus must model the full payload contract it already consumes from the generator.

Required changes:

- `WprPayload` must include all fields the HTML uses, including:
  - `scp`
  - `businessReports`
  - any other generator-emitted sections currently omitted from TypeScript types
- `WprWeekBundle` and related interfaces must stop under-modeling the JSON shape
- the type layer must fail loudly if the payload contract drifts rather than silently ignoring fields

The payload contract should be derived from the generator behavior, not from the current partial React usage.

### 5. Data Loading Model

Argus should mirror the HTML’s single `reportData` model instead of composing the dashboard from fragmented fetches.

Target behavior:

- add one full dashboard endpoint, `GET /api/wpr/payload`, that returns the complete `WprPayload`
- `/wpr` loads that payload once per selected week
- the client works from one coherent in-memory dashboard object
- tab components read from that shared object instead of each inventing their own loading behavior

Rules:

- the new dashboard shell uses only `GET /api/wpr/payload`
- the existing narrower endpoints can remain temporarily for migration, but they are not the primary contract for `/wpr`
- the payload endpoint is the parity contract and must stay aligned with the generator output

### 6. Tab Porting Strategy

Port the HTML tabs into dedicated React components under a single shell.

Recommended component structure:

- `components/wpr/wpr-dashboard-shell.tsx`
- `components/wpr/top-bar.tsx`
- `components/wpr/tabs/sqp-tab.tsx`
- `components/wpr/tabs/scp-tab.tsx`
- `components/wpr/tabs/br-tab.tsx`
- `components/wpr/tabs/tst-tab.tsx`
- `components/wpr/tabs/compare-tab.tsx`
- `components/wpr/tabs/changelog-tab.tsx`
- `components/wpr/tabs/sources-tab.tsx`

Port order:

1. `SQP`
2. `TST`
3. `Compare`
4. `Sources`
5. `Change Log`
6. `SCP`
7. `BR`

Reasoning:

- `SQP`, `TST`, and `Compare` are the state-heaviest analytical surfaces and define most of the dashboard model.
- `Sources` and `Change Log` are easier to verify and help validate cross-week behavior.
- `SCP` and `BR` rely on payload expansion and can land once the full contract is present.

### 7. Visual Direction

The React port should target visual proximity to the HTML reference, not the existing Argus WPR look.

Rules:

- retain the HTML dashboard’s tab-bar hierarchy, spacing rhythm, and dense dark panel language
- keep control placement aligned with the HTML
- prefer matching metric grouping and emphasis over preserving current Argus cards/charts
- preserve Argus technical conventions where required, but not at the cost of obvious visual divergence

This is intentionally different from a generic “make it fit the design system” pass. The dashboard must read as the HTML dashboard living inside Argus.

## Component And File Responsibilities

### Existing files to replace or reduce

- [apps/argus/app/(app)/wpr/page.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/app/(app)/wpr/page.tsx:1)
  - becomes a thin shell entrypoint
- [apps/argus/components/wpr/wpr-layout.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/components/wpr/wpr-layout.tsx:1)
  - stops being a route-tab bar and becomes part of the single-page dashboard shell or is replaced entirely
- [apps/argus/components/wpr/compare-dashboard.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/components/wpr/compare-dashboard.tsx:1)
- [apps/argus/components/wpr/competitor-dashboard.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/components/wpr/competitor-dashboard.tsx:1)
- [apps/argus/components/wpr/change-timeline.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/components/wpr/change-timeline.tsx:1)
- [apps/argus/components/wpr/source-heatmap.tsx](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/components/wpr/source-heatmap.tsx:1)

These components are not necessarily reusable as-is because they were built for the drifted route model, not for exact parity.

### Files that must expand

- [apps/argus/lib/wpr/types.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/lib/wpr/types.ts:1)
- [apps/argus/lib/wpr/reader.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/lib/wpr/reader.ts:1)
- [apps/argus/hooks/use-wpr.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/hooks/use-wpr.ts:1)
- [apps/argus/stores/wpr-store.ts](/Users/jarraramjad/dev/targonos-main/.worktrees/argus/local-testing/apps/argus/stores/wpr-store.ts)

### Files likely to be created

- single dashboard shell component
- tab-specific React ports
- parity-focused selectors/helpers for the payload
- parity tests for payload typing, selection behavior, and route redirects

## Migration Strategy

### Phase 1: Correct The Contract

- Expand the TypeScript payload model to match the generator output exactly.
- Add tests that fail when the payload omits fields the HTML expects.
- Add or adjust a single dashboard data-loading path that produces the same working model the HTML uses.

### Phase 2: Replace The Shell

- Collapse WPR into one `/wpr` shell.
- Introduce in-page tab state and the unified week selector.
- Add redirects from old subroutes into `/wpr`.

### Phase 3: Port The Tabs

- Port HTML behavior tab by tab in the approved order.
- After each tab, validate against the HTML before moving on.
- Remove superseded route-era components as each tab lands.

### Phase 4: Lock Parity

- Add explicit parity checklists/tests.
- Remove dead route-era WPR code once the shell and redirects are stable.

## Verification

Verification must be parity-driven, not “looks okay to me.”

### Required parity checklist per tab

For each tab, verify:

- tab exists
- tab label matches the HTML meaning
- same default state as the HTML
- same controls exist
- same week behavior exists
- same key metrics are visible
- same selection behavior exists
- same grouping/sorting behavior exists
- same empty state meaning exists

### Required frontend verification

- load `/wpr` with latest payload
- switch across all tabs without losing invalidly scoped shared state
- switch weeks and confirm tab contents update like the HTML
- verify redirects from old route-era paths land in `/wpr` with the correct tab

### Required data-contract verification

- assert the React payload contract covers `scp` and `businessReports`
- assert the reader fails loudly on missing required contract sections
- compare selected payload slices against the HTML reference for representative weeks

## Definition Of Done

The work is done only when all of the following are true:

- Argus `/wpr` is one single-page dashboard shell
- the dashboard exposes the same major tabs as the HTML:
  - `SQP`
  - `SCP`
  - `BR`
  - `TST`
  - `Change Log`
  - `Compare`
  - `Sources`
- the dashboard uses a shared state model that matches the HTML’s behavior
- the TypeScript payload contract matches the generator output used by the HTML
- the rendered result is visually close enough to the HTML that the two feel like the same dashboard
- old route-era WPR paths no longer serve separate implementations
- parity verification exists and passes against the reference dashboard behavior

## Risks

### 1. Under-modeled payload fields

If the port starts before the contract is corrected, `SCP` and `BR` will be guessed instead of implemented.

Mitigation:

- correct the contract first

### 2. Route-era code bias

If the current route-split components are treated as the default foundation, parity drift will continue.

Mitigation:

- treat the HTML as the reference, not the current Argus UI

### 3. Visual compromise through design-system pressure

If the port is forced into generic Argus component patterns, it will miss the HTML’s layout and information density.

Mitigation:

- allow WPR-specific composition and styling where needed to preserve parity

## Implementation Handoff

The implementation plan should assume:

- the worktree is the execution environment
- the builder output is the parity oracle
- TDD is required for behavior changes and payload-contract fixes
- implementation should land in self-contained tasks so each tab port can be validated independently
