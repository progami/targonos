# TargonOS

TargonOS is a pnpm + Turborepo monorepo for Targon Global's internal apps and website.

## Apps

| App | Workspace | Base path |
| --- | --- | --- |
| Portal / SSO | `@targon/sso` | `/` |
| Talos | `@targon/talos` | `/talos` |
| Website | `@targon/website` | `/` |
| Atlas | `@targon/atlas` | `/atlas` |
| xPlan | `@targon/xplan` | `/xplan` |
| Kairos | `@targon/kairos` | `/kairos` |
| Plutus | `@targon/plutus` | `/plutus` |
| Hermes | `@targon/hermes` | `/hermes` |
| Argus | `@targon/argus` | `/argus` |

## Local development

You need:

- Node 20+
- `pnpm`
- Redis for Talos
- dev DB access on `localhost:6432`
- app `.env.local` files

Install once:

```bash
corepack enable
pnpm install
```

Run only what you need:

```bash
pnpm --filter @targon/sso dev
pnpm --filter @targon/talos dev
pnpm --filter @targon/website dev
pnpm --filter @targon/atlas dev
pnpm --filter @targon/xplan dev
pnpm --filter @targon/kairos dev
pnpm --filter @targon/plutus dev
pnpm --filter @targon/hermes dev
pnpm --filter @targon/argus dev
```

Local apps read `PORT` from their env file. If `PORT` is missing, the app script falls back to its legacy default.

Local development uses dev data, not main data. Most apps use `portal_db_dev` on `localhost:6432`. Talos uses `dev_talos_us` and `dev_talos_uk`.

## Codex worktrees

Use the Codex environment `worktree app (dev-os sso)` when creating a worktree.

Worktree setup automatically:

- assigns a unique `41xxx` port block
- writes `.codex/generated/dev.worktree.apps.json`
- materializes worktree-local env files
- runs install and Prisma generation
- seeds the worktree dev user
- starts Portal / SSO and all apps in the background

After setup, the worktree is already running. Worktree URLs come from `.codex/generated/dev.worktree.apps.json`.

## Git flow

- do not push directly to `dev` or `main`
- create a feature branch for the work
- open a PR from the feature branch into `dev`
- wait for CI on the `dev` PR
- merge into `dev`
- open a release PR from `dev` into `main`
- wait for CI on the `main` PR
- merge into `main`

The repo enforces PRs for protected branches, and PRs into `main` must come from `dev`.

## Common commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm codex:env
```

## Troubleshooting

- If `localhost:6432` is down, fix the dev DB tunnel/access first.
- If Talos fails on CSRF or session setup, check Redis.
- If Prisma fails, generate the client for the affected workspace.
- Worktree logs are in `.codex/generated/runtime/`.
