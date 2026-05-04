# Shared Env

Shared env files hold cross-app server-side Amazon SP-API refs only. App runtime
config, database URLs, public browser keys, app URLs, and app-owned vendor secrets
stay in `apps/<app>/.env.*`.

Mode selection is exact:

- `local`: `env/shared.local.env` + `apps/<app>/.env.local`
- `dev`: `env/shared.dev.env` + `apps/<app>/.env.dev`
- `production`: `env/shared.production.env` + `apps/<app>/.env.production`
- `ci`: `env/shared.dev.ci.env` + `apps/<app>/.env.dev.ci`

The loader hard-fails when either selected file is missing, when shared/app keys
overlap, when a `bw://item/field` ref cannot resolve, or when shared env contains
anything outside the Amazon SP-API shared-key allowlist.
