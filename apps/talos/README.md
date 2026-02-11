# @targon/talos

Talos powers inventory, billing, and operations for Targon.

## Local Development

- Install workspace dependencies from the monorepo root: `pnpm install`
- Run Talos: `pnpm --filter @targon/talos dev` (default port `3001`)
- Keep Prisma schema in sync: `pnpm --filter @targon/talos db:push`
- Regenerate Prisma client: `pnpm --filter @targon/talos db:generate`

## Build and Run

- Build: `pnpm --filter @targon/talos build`
- Start production server: `pnpm --filter @targon/talos start`

## Environment

Talos is configured through environment variables loaded from host `.env` files.

Required:
- `NEXT_PUBLIC_APP_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` (or `PORTAL_AUTH_SECRET`)
- `PORTAL_AUTH_URL`
- `NEXT_PUBLIC_PORTAL_AUTH_URL`
- `COOKIE_DOMAIN` (`localhost` locally, `.targonglobal.com` in shared envs)
- `DATABASE_URL`
- `PRISMA_SCHEMA`

Optional AWS/Storage:
- `S3_BUCKET_NAME`
- `S3_BUCKET_REGION`

Optional Redis:
- `REDIS_URL`

Optional Amazon SP-API:
- `AMAZON_SP_API_REGION` (`eu`, `na`, `fe`)
- `AMAZON_MARKETPLACE_ID`
- `AMAZON_SP_APP_CLIENT_ID`
- `AMAZON_SP_APP_CLIENT_SECRET`
- `AMAZON_REFRESH_TOKEN`

Talos multi-tenant refresh token overrides:
- `AMAZON_REFRESH_TOKEN_US`
- `AMAZON_REFRESH_TOKEN_UK`
- `AMAZON_SP_API_REGION_US`
- `AMAZON_MARKETPLACE_ID_US`
- `AMAZON_SP_API_REGION_UK`
- `AMAZON_MARKETPLACE_ID_UK`

## Dependencies

`apps/talos/package.json` is the source of truth for dependency versions.

## Logging

Runtime request logging is configured in `server.js` with Winston daily rotation in production.
