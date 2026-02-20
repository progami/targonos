# DB Hardening

These scripts enforce schema ownership and external-role DDL restrictions in `portal_db`.

## Portal-wide scripts

- `scripts/db/apply-portal-hardening.sh`
- `scripts/db/check-portal-ownership.sh`
- `scripts/db/portal-hardening.sql`
- `scripts/db/audit-portal-ownership.sql`

Run:

```bash
pnpm db:portal:harden
pnpm db:portal:audit-ownership
```

Portal hardening covers auth/atlas/xplan/kairos/plutus/talos/hermes/argus schemas (when present), normalizes ownership to app roles, and enforces no `CREATE` for `portal_dev_external` on those schemas and `public`.

## Talos-only scripts

- `scripts/db/apply-talos-hardening.sh`
- `scripts/db/check-talos-ownership.sh`
- `scripts/db/talos-hardening.sql`
- `scripts/db/audit-talos-ownership.sql`

## Roles

- Owner role: `portal_talos` (override with `TALOS_OWNER_ROLE`)
- External role: `portal_dev_external` (override with `TALOS_EXTERNAL_ROLE`)

## Apply hardening

```bash
pnpm db:talos:harden
```

The script:

1. Reassigns Talos object owners to `portal_talos` for shared schemas.
2. Revokes `CREATE` on DB/schemas from `portal_dev_external`.
3. Grants DML permissions (`USAGE`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`) for shared schemas.
4. Updates default privileges for future objects.
5. Fails if `portal_dev_external` is `SUPERUSER` or still has `CREATE` via inherited grants.
6. Runs ownership audit and fails if drift remains.

## Audit only

```bash
pnpm db:talos:audit-ownership
```

Use this for recurring checks (cron or scheduled task). It exits non-zero on drift.

## Connection URL resolution

Scripts resolve DB URL in this order:

1. `TALOS_ADMIN_DATABASE_URL`
2. `DATABASE_URL_US`
3. `DATABASE_URL_UK`
4. `DATABASE_URL`

If not set, scripts attempt to load Talos env files in order:

1. `apps/talos/.env.local`
2. `apps/talos/.env.dev`
3. `apps/talos/.env.production`
4. `apps/talos/.env`
