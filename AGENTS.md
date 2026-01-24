# GPT Instructions

## Database

All apps share `portal_db` on localhost:5432 with separate schemas per app. Connection strings are in each app's `.env.local` file.

| App | Schema |
|-----|--------|
| talos | dev_wms_us, dev_wms_uk |
| atlas | dev_hrms |
| xplan | dev_xplan |
| kairos | chronos |
| sso | dev_auth |
| plutus | (no DB - uses QuickBooks API) |

Access via Prisma Studio: `pnpm prisma studio` from the app folder.

## Code Style

- No OR statements as fallbacks - let the code fail
- Do not add unnecessary error handling or fallbacks

## Testing

- Test via Chrome browser at `https://dev-targonos.targonglobal.com/<app>`
- Do not test on localhost
- **CRITICAL: Always test changes in Chrome BEFORE creating any PR** - Verify your changes work visually before committing
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

1. **Test in browser** - Verify changes work in Chrome before proceeding
2. **PR to dev** - Create a pull request targeting the `dev` branch
3. **Merge to dev** - Merge the PR yourself as soon as GitHub CI is green
4. **Auto-merge to main** - Immediately PR `dev` → `main` and merge as soon as CI is green
5. **Delete merged branches** - Delete all feature/fix branches you created after they are merged (both remote and local)

Default behavior: treat `dev` as a transit branch; always ship to `main` after merging to `dev` unless explicitly told otherwise.

### Handling Merge Conflicts

When `dev` and `main` diverge with conflicts:
1. Create a sync branch from `main`
2. Merge `dev` into it and resolve conflicts
3. PR the sync branch to `main`
4. After merge, sync `main` back into `dev` if needed

## Deployment & Caching

Do **not** suggest "hard refresh" as a troubleshooting step. Instead, use the in-app version badge (bottom-right) to confirm the deployed version and wait for the deploy pipeline if the version hasn't updated yet. If deployment is complete and the problem is still unsolved, investigate the root cause.
