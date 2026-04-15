# Plutus Settlements Redesign Design

## Purpose

Redesign the Plutus settlements workflow to be as close as practical to the working Link My Books review flow, while keeping Plutus data and actions intact.

The outcome should be:

- faster to scan
- easier to audit
- lighter visually
- free of decorative summary cards and low-value KPI blocks

The user direction for this design is explicit:

- copy Link My Books / A2X patterns where they are already working
- optimize for audit clarity
- keep text minimal
- use no cards unless there is no cleaner structure

## Evidence

### Current Plutus Surfaces

The current implementation already has the right data, but the presentation is fragmented:

- settlements list: [apps/plutus/app/settlements/page.tsx](../../../apps/plutus/app/settlements/page.tsx)
- parent settlement detail: [apps/plutus/app/settlements/[region]/[settlementId]/page.tsx](../../../apps/plutus/app/settlements/[region]/[settlementId]/page.tsx)
- legacy settlement redirect: [apps/plutus/app/settlements/journal-entry/[id]/page.tsx](../../../apps/plutus/app/settlements/journal-entry/[id]/page.tsx)

Problems in the current detail page:

- a source-settlement summary card
- a row of KPI cards
- a separate audit mapping card
- a separate preview card
- a separate month-end postings card
- a separate history card

This forces the user to read one settlement in pieces instead of as one accounting document.

Problems in the current list page:

- filters are boxed heavily
- the table is visually treated as another large card
- split state and processing state use more UI than the data needs

### Product Research

Reviewed live Link My Books settlement index and settlement detail, plus current support screenshots and docs:

- Link My Books live settlements dashboard: `https://app.linkmybooks.com/settlements/dashboard`
- Link My Books settlement detail help article: `https://help.linkmybooks.com/en/articles/2558528-how-to-review-settlement-details-before-sending`
- A2X support references for statements and mapping flows: `https://support.a2xaccounting.com/`

Observed shared pattern across Link My Books and A2X:

- list-first overview
- restrained filter row
- inline status and actions
- detail screen reads like a ledger
- split postings are reviewed sequentially
- totals stay attached to line items

## Decisions

- The settlements index remains a table, not a dashboard.
- A split settlement remains one row in the index.
- Opening a settlement goes directly to a review workspace.
- The review workspace is ledger-first, not summary-card-first.
- Preview and processed states share the same visual structure.
- History is reduced to a compact event list.
- Analysis is secondary and should not dominate the settlement review surface.

## Goals

- Make the list scannable in one pass.
- Let the user understand one settlement without bouncing across sections.
- Put posting lines and totals in one reading flow.
- Remove decorative numbers that do not improve review quality.
- Reuse the existing settlement data model and APIs.

## Non-Goals

- Changing settlement processing logic
- Changing React Query data contracts
- Redesigning all of Plutus in this spec
- Inventing a new workflow that departs from Link My Books without a strong reason

## Approaches Considered

### 1. Keep Current Structure And Reduce Styling

Retain the existing cards and sections, but tone down borders, spacing, and badges.

Why not:

- It leaves the core problem intact: the workflow is still broken into too many containers.
- It still makes the user reconstruct a settlement from several blocks.

### 2. Ledger Workspace

Keep the settlements index flat. Convert the opened settlement into a single review workspace made of sequential posting sections.

Why this is the selected approach:

- It matches the live Link My Books review flow.
- It satisfies the user requirement for minimal text and no cards.
- It reduces UI noise without losing accounting detail.

### 3. Split-Pane Master Detail

Show the index on the left and the opened settlement on the right.

Why not:

- It helps browsing, but hurts audit review.
- Month-end postings and journal lines need width and vertical flow.

## Target UX

### 1. Settlements Index

The index should have only three structural parts:

1. page header
2. compact toolbar
3. settlements table

#### Header

- Title: `Settlements`
- One short subtitle only if needed
- Primary actions stay to the right

#### Toolbar

One inline row only:

- search
- marketplace
- status
- period
- filter action

Rules:

- no filter card
- no second row unless the viewport forces wrap
- no extra explanatory copy

#### Table

Columns:

- settlement
- period
- total
- status
- action

Row rules:

- settlement id is the primary text
- marketplace is secondary text
- split explanation is one muted subline, not a loud chip
- action remains inline at row end
- status is concise and readable at a glance

The row should answer:

- what settlement is this
- what period does it cover
- what is the amount
- what state is it in
- what can I do next

### 2. Settlement Review Workspace

Opening a settlement should answer:

- what will be posted
- which invoices are matched
- whether anything blocks processing

The page should have only these sections:

1. compact header
2. one split explanation line when relevant
3. posting sections in chronological order
4. compact history list

#### Header

Show:

- settlement id
- marketplace
- covered period
- overall state
- page-level action buttons

Do not show:

- KPI tiles
- “total settlements: 1”
- “month-end postings: 2”
- separate summary cards for obvious metadata

#### Split explanation

For split settlements, render one sentence directly under the header.

Example shape:

`Split across month-end. Review both postings below.`

Nothing more is needed unless there is a warning.

### 3. Posting Sections

Each child posting is rendered as one flat ledger section.

Section header:

- covered period
- doc number
- matched invoice
- current state
- posting total

Section body:

- accounting lines table

Table columns:

- description
- account
- amount

Section footer:

- total

Rules:

- lines and total stay together
- do not break one posting into multiple cards
- do not put preview information in a different visual language than processed information

### 4. Preview, Blocking, And Processing States

Preview and processed views should use the same section structure.

If preview data exists:

- render the same posting sections
- include warnings or blockers inline above the affected posting section

If invoice resolution is blocked:

- show the blocking message directly above that posting section
- disable processing at page level

Do not create:

- a preview card
- a warning summary card
- a separate audit mapping card when the same information can live in the section header

### 5. History

History moves to the bottom as a compact event list.

Each row should contain only:

- timestamp
- event text

Rules:

- no vertical accent stripe
- no timeline ornament
- no large card wrapper

### 6. Analysis

Analysis is not the primary job of this page.

Therefore:

- keep analysis secondary
- keep it below the accounting review or behind a tab
- do not let it visually dominate the review workspace

If analysis does not materially help posting decisions, it should be simplified rather than expanded.

## Visual Language

The redesign should stay within Targon brand constraints, but borrow Link My Books structure aggressively.

Required:

- minimal text
- flat hierarchy
- dense but readable tables
- quiet status treatment
- strong alignment
- no nested cards

Avoid:

- decorative KPI tiles
- oversized containers
- duplicated labels
- side-stripe accents
- ornamental summaries
- extra chips for already-obvious state

## Implementation Boundaries

This is a presentation rewrite over the existing data model.

Reuse:

- existing settlements list API
- existing parent settlement detail API
- existing preview/process/rollback flows
- existing child posting and history arrays

Expected code focus:

- [apps/plutus/app/settlements/page.tsx](../../../apps/plutus/app/settlements/page.tsx)
- [apps/plutus/app/settlements/[region]/[settlementId]/page.tsx](../../../apps/plutus/app/settlements/[region]/[settlementId]/page.tsx)
- supporting shared settlement UI extracted only if it reduces duplication cleanly

Do not change backend settlement behavior as part of this redesign.

## Testing

Keep the existing settlement logic tests.

Add or update UI coverage for:

- split settlements render as one parent row in the index
- split settlements render as sequential posting sections in detail
- preview uses the same layout as processed sections
- unresolved invoice matches block processing inline
- history renders as a compact event list

## Rollout Sequence

1. simplify settlements index
2. replace settlement detail with ledger workspace
3. fold preview and warnings into the same section structure
4. reduce history and analysis to secondary roles

## Final Design Rule

If a UI element exists only to summarize information the user can already see in the settlement rows or posting sections, remove it.
