# Plutus Link My Books Scope Design

## Status

Approved design from the 2026-05-04 brainstorming session.

## Problem

Plutus currently exposes too many QBO-like surfaces. The `Transactions` page, generic bill/purchase handling, cashflow, and chart-of-accounts views make Plutus behave like a partial duplicate of QBO. That creates duplicated product logic, unclear ownership, and higher risk around accounting mutations.

Plutus should instead behave like a Link My Books style accounting translator:

- pull Amazon settlement source data;
- read approved QBO source inputs only where needed for COGS;
- build traceable settlement accounting;
- post only the intended QBO accounting outputs;
- surface exceptions and audit evidence.

QBO remains the ledger, AP system, bank feed, bank reconciliation workflow, and generic transaction browser.

## Product Boundary

Plutus owns these primary workflows:

- `Settlements`: Amazon settlement ingestion, normalization, preview, posting status, QBO posting IDs, source evidence, and audit log.
- `COGS Inputs`: read-only intake of QBO Bills/Purchases that affect SKU cost and unit mapping for COGS.
- `Exceptions`: a consolidated queue for blockers across settlement posting, COGS input mapping, unsupported Amazon events, source sync failures, and settlement-control clearing differences.
- `Mappings`: Amazon event, category, account, tax, SKU, and marketplace mappings.
- `Sources`: Amazon SP-API and QBO connection health.
- `Settings`: posting mode, user/admin controls, environment controls, and accounting guardrails.

Plutus does not own these as primary product workflows:

- generic QBO transaction browsing;
- generic QBO cashflow;
- generic QBO chart-of-accounts browsing;
- QBO Bill/Purchase creation;
- manual bank transaction creation or reconciliation outside the settlement-control workflow.

Existing APIs that are still needed by settlement or COGS code may remain temporarily, but the user-facing product should not present them as QBO replacement workflows.

## Accounting Flow

Each Amazon settlement produces a traceable posting set. The posting must retain detailed Amazon line traceability inside QBO and Plutus. It must not collapse the settlement into an opaque summary-only total, and it must not create one QBO transaction per Amazon event.

The settlement posting model is:

- one QBO settlement journal entry per settlement segment;
- detailed lines inside the journal entry for Amazon sales, fees, refunds, tax, reserves, reimbursements, and other supported settlement categories;
- the net payout leg posted to `Plutus Settlement Control`;
- no posting to real bank accounts such as Chase, Wise, AmEx, or other cash accounts.

COGS is a core Plutus job:

- Plutus reads approved QBO Bills/Purchases as source inputs for SKU cost, units, and inventory cost basis;
- Plutus asks for SKU/unit/cost mapping only when that COGS input is incomplete;
- Plutus posts COGS/inventory accounting from those approved source inputs;
- Plutus never creates QBO Bills/Purchases as part of the normal flow.

Bank movement stays in QBO:

- QBO bank feed creates the actual bank deposit for Chase/Wise/etc.;
- that bank-feed deposit is categorized against `Plutus Settlement Control`;
- `Plutus Settlement Control` nets to zero when the Amazon settlement and the real bank deposit agree.

This keeps final accounts correct:

- revenue, fees, refunds, tax, reserves, reimbursements, COGS, and inventory move to their final accounts through Plutus accounting entries;
- only the cash/payout leg waits in `Plutus Settlement Control`;
- the real bank account is written by QBO bank feed, not by Plutus settlement sync.

## UI Design

The primary Plutus landing route should be `Settlements`.

The main navigation should be reduced to:

- `Settlements`
- `COGS Inputs`
- `Exceptions`
- `Mappings`
- `Sources`
- `Settings`

The primary navigation should remove:

- `Transactions`
- `Cashflow`
- generic `Chart of Accounts`
- generic QBO Bills/Purchases entry points

`Settlements` list requirements:

- use one consistent display format for settlement IDs across US and UK;
- show the raw Amazon settlement ID as secondary text when useful;
- show period, marketplace, payout amount, posting state, control-clearing state, and exception state;
- omit normal-user `Sync from Amazon` and `Auto-process` buttons when an automatic worker owns source sync;
- expose row actions only for review, preview, explicitly allowed post actions, QBO links, and Plutus audit links.

Settlement detail requirements:

- show payout, period, marketplace, posting mode, QBO IDs, and settlement-control impact;
- use tabs: `Accounting`, `COGS`, `Exceptions`, `Source Evidence`, and `Posting Log`;
- remove the previous `Analysis` concept unless its contents are reassigned into one of the real tabs above.

`COGS Inputs` requirements:

- show only QBO source documents that affect COGS mapping;
- present source document identity, vendor, date, SKU/unit/cost mapping state, and blocking reason;
- link to QBO for source evidence;
- do not provide QBO document creation flows.

`Exceptions` requirements:

- consolidate missing account/tax/SKU mappings, unsupported Amazon events, failed posting attempts, stale source sync, settlement-control mismatches, and COGS blockers;
- link each exception to the exact settlement, source document, mapping, or QBO posting that needs action;
- keep resolved exceptions out of the main work queue while preserving audit history.

## Technical Shape

Implementation should be phased to reduce product scope without destabilizing the accounting engine.

### Phase 1: Product Shell Strip-Down

- Remove or hide primary nav entries for `Transactions`, `Cashflow`, and generic `Chart of Accounts`.
- Remove normal-user access to QBO Bill/Purchase creation from Plutus.
- Keep backend APIs temporarily when settlement or COGS code still depends on them.
- Rename and reshape the existing bill/purchase mapping surface into `COGS Inputs`.
- Keep settlement pages as the primary user flow.

### Phase 2: Focused COGS and Exception APIs

- Replace generic transaction endpoint usage with focused COGS-input APIs.
- Split the current large transaction/page logic into narrow modules only where code is still needed.
- Delete unused generic QBO browser code after COGS inputs no longer depend on it.
- Move any proven debug-only QBO inspection behind an internal route, not the primary Plutus app.

### Phase 3: Posting Contracts and Guardrails

- Require explicit posting mode for all QBO mutation paths.
- Keep automatic source sync read-only unless a worker or route is explicitly running in an allowed posting mode.
- For positive Amazon payouts, require `Plutus Settlement Control` for the payout leg.
- Reject settlement postings that attempt to write positive payout legs directly to real bank accounts.
- Audit every QBO mutation path with source settlement, actor or worker identity, mode, QBO IDs, and result.

## Error Handling

Plutus should fail closed when accounting ownership is ambiguous:

- missing posting mode rejects the operation;
- missing or ambiguous `Plutus Settlement Control` rejects settlement posting;
- missing account/tax/SKU/COGS mapping sends the item to `Exceptions`;
- unsupported Amazon event types block posting until mapped or intentionally handled;
- QBO Bills/Purchases without required source evidence remain read-only blockers, not creation prompts;
- bank/control mismatches stay as clearing exceptions until source evidence supports the resolution.

The UI should show exact blockers and links to the source object. It should not silently infer mappings, create fallback transactions, or hide posting failures behind generic success states.

## Testing

Required focused test coverage:

- nav/product-scope tests proving generic QBO surfaces are not exposed as primary Plutus workflows;
- route tests proving omitted posting mode fails closed;
- settlement builder tests proving positive payout legs use `Plutus Settlement Control`, not real bank accounts;
- worker/route tests proving automatic sync cannot mutate QBO unless mode explicitly allows it;
- COGS input tests proving QBO Bills/Purchases are read-only source inputs;
- exception tests proving missing mappings and unsupported events block posting with actionable reasons;
- browser smoke test on local Plutus for the reduced nav, settlement list, settlement detail, COGS input queue, and exceptions queue.

## Non-Goals

- Rebuilding QBO transaction browsing inside Plutus.
- Rebuilding QBO cashflow inside Plutus.
- Rebuilding QBO chart-of-accounts management inside Plutus.
- Creating QBO Bills/Purchases from Plutus in the normal COGS flow.
- Posting Amazon settlement payouts directly to real bank accounts.
- Collapsing settlements into opaque summary-only entries that lose line-level traceability.

## Acceptance Criteria

The implementation satisfies this design when:

- the visible Plutus product is centered on settlements, COGS inputs, exceptions, mappings, sources, and settings;
- generic QBO transaction/cashflow/account-browser workflows are gone from the primary app;
- QBO Bills/Purchases are consumed read-only for COGS;
- settlement postings retain detailed Amazon line traceability;
- positive payout legs post to `Plutus Settlement Control`;
- real bank movement is handled by QBO bank feed;
- posting and sync mutation paths fail closed without explicit mode;
- local tests and type checks pass for Plutus;
- browser verification proves the reduced UI is usable and the removed surfaces are not exposed in normal navigation.
