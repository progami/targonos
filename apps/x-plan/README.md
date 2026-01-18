# X-Plan

Next.js 16 application that mirrors the X-Plan workbook so ops, sales, and finance can collaborate without leaving the web. The UI reproduces the Excel tabs (product setup, operations planning, sales forecasting, financial planning, dashboard) and stores data in the shared `portal_db.xplan` schema.

## Getting Started

### 1. Prerequisites

- Node.js **≥ 20.9** (the monorepo tracks the active LTS release).
- pnpm **≥ 9** (`corepack enable` if pnpm is not globally installed).
- PostgreSQL 14+ (local Docker instructions below) or access to the shared `portal_db` instance.

### 2. Install workspace dependencies

From the monorepo root:

```bash
pnpm install
```

### 3. Configure environment variables

Duplicate the example file and populate the required settings:

```bash
cp apps/x-plan/.env.dev.ci apps/x-plan/.env.local
```

Set `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and any other secrets used by the auth gateway.

To enable strategy assignee selection (users pulled from the portal directory), also set `PORTAL_DB_URL` to the portal auth schema (for example: `postgresql://portal_auth:***@localhost:5432/portal_db?schema=auth`).

### 4. Provision a database (optional Docker helper)

X-Plan stores data inside the `xplan` schema of the `portal_db` database. For local development you can launch Postgres via Docker:

```bash
docker run --rm \
  --name x-plan-postgres \
  -e POSTGRES_DB=portal_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 6543:5432 \
  postgres:16
```

Then export a connection string that targets that schema before running Prisma or the dev server:

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:6543/portal_db?schema=xplan'
```

> Using the shared portal database instead of Docker? Point `DATABASE_URL` at that instance while keeping the schema name `xplan`.

### 5. Generate Prisma client & apply migrations

Always regenerate Prisma after pulling schema changes, then apply migrations so the new supplier payment metadata columns exist:

```bash
pnpm --filter @targon/x-plan prisma:generate
pnpm --filter @targon/x-plan prisma:migrate:deploy
```

### 6. Seed comprehensive demo data

X-Plan seeds required week rows as you create strategies, products, and purchase orders. There is no standalone demo seed script in this repo.

### 7. Run the dev server

```bash
pnpm --filter @targon/x-plan dev
```

The app serves at http://localhost:3008 and reuses the shared `@targon/auth` flow for sign-in.

## Test & Quality Gates

```bash
pnpm --filter @targon/x-plan test        # Vitest unit & UI smoke tests
pnpm --filter @targon/x-plan lint        # ESLint (Next.js config)
pnpm --filter @targon/x-plan type-check  # tsc in noEmit mode
```

## Key Features

- Handsontable-based grids for each workbook sheet with keyboard navigation, copy/paste, and inline editing.
- Sheet-specific APIs (`/api/v1/x-plan/*`) that persist changes to PostgreSQL and keep derived totals in sync.
- Automatic supplier invoice generation (manufacturing deposit/production/final, freight, tariff) so new purchase orders surface immediately in planning and cash views.
- Prisma schema scoped to the `xplan` schema inside the portal database.

## Using X-Plan

1. Navigate between workbook tabs with the bar at the top or with `Ctrl` + `PageUp/PageDown`. When focused outside a Handsontable grid you can jump directly between Sales Planning → P&L → Cash Flow (across years) using `Ctrl` + `←/→`.
2. Use the year pills in the toolbar to scope data to a single planning year. Sales, P&L, Cash Flow, and Ops Planning will all respect the selected year.
3. In Sales Planning, switch the metric focus or stock cadence from the header toggles; warnings persist regardless of metric view. The focus dropdown filters to a single SKU.
4. Ops Planning provides both grid and timeline views. Use the stage toggle in the PO grid header to flip between week durations and calendar dates without selecting the entire column.
5. After creating products and purchase orders, review the PO table, batch allocations, and financial sheets to validate the planning scenario.

All edits persist automatically via the debounced save handlers—watch for the toast notifications to confirm updates.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string targeting the `xplan` schema |
| `PORTAL_DB_URL` | Portal auth database connection string (needed for strategy assignee directory) |
| `NEXTAUTH_URL` | Public URL for the app (used by NextAuth) |
| `NEXTAUTH_SECRET` | Shared auth secret (should match the portal) |
| `PORTAL_AUTH_URL` | Base URL for the portal auth service (defaults to `http://localhost:3000` in dev) |
| `XPLAN_SUPER_ADMIN_EMAILS` | Optional comma/space list of super admin emails (defaults to `jarrar@targonglobal.com`) |

See `apps/x-plan/.env.dev.ci` for quick-start values.
