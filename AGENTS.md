# GPT Instructions

## Database

All apps share `portal_db` on localhost:5432 with separate schemas per app. Connection strings are in each app's `.env.local` file.

| App | Schema |
|-----|--------|
| talos | dev_talos_us, dev_talos_uk |
| atlas | dev_hrms |
| xplan | dev_xplan |
| kairos | chronos |
| sso | dev_auth |
| plutus | (no DB - uses QuickBooks API) |

Talos also has main schemas: `main_talos_us`, `main_talos_uk`.

Access via Prisma Studio: `pnpm prisma studio` from the app folder.

## Code Style

- No OR statements as fallbacks - let the code fail
- Do not add unnecessary error handling or fallbacks

## Testing

- Run the repo checks relevant to your changes (e.g., lint/type-check/tests) before opening PRs.

## Git Workflow

### Branch Naming

Use app name as prefix: `atlas/`, `xplan/`, `talos/`, `kairos/`, `hrms/`, `sso/`, `plutus/`

Examples: `xplan/fix-toolbar-visibility`, `talos/add-amazon-import`, `atlas/improve-loading`

### PR Titles

PR titles must include:
- the app scope (e.g. `fix(talos): ...`)
- the agent tag: `[gpt]`

Example: `fix(talos): use presigned URL for PO document uploads [gpt]`

### PR Workflow

Once work is complete:

1. **PR to dev** - Create a pull request targeting the `dev` branch
2. **Wait for GitHub CI to pass** - Do not proceed until all checks are green
3. **Review PR feedback (dev PR)** - Always read and address PR reviews/comments from anyone before merging
4. **Merge to dev** - Merge the PR yourself without waiting for approval
5. **PR to main** - Create a pull request from `dev` to `main` (PR must come from `dev` branch or CI will fail)
6. **Wait for GitHub CI to pass** - Ensure all checks pass on the main PR
7. **Review PR feedback (main PR)** - Always read and address PR reviews/comments from anyone before merging
8. **Merge to main** - Merge the PR yourself without waiting for approval
9. **Delete merged branches** - Delete all feature/fix branches you created after they are merged (both remote and local)

Always wait for CI to pass before merging. Always read and address PR reviews/comments from anyone before merging (applies to both the dev PR and the dev → main PR). Merge PRs yourself without requiring approval. Always clean up your branches after merging.

### Handling Merge Conflicts

When `dev` and `main` diverge with conflicts:
1. Create a sync branch from `main`
2. Merge `dev` into it and resolve conflicts
3. PR the sync branch to `main`
4. After merge, sync `main` back into `dev` if needed

## Deployment & Caching

Do **not** suggest "hard refresh" as a troubleshooting step. Instead, use the in-app version badge (bottom-right) to confirm the deployed version and wait for the deploy pipeline if the version hasn't updated yet. If deployment is complete and the problem is still unsolved, investigate the root cause.
