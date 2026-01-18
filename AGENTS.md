# Claude Code Instructions

## Code Style

- No OR statements as fallbacks - let the code fail
- Do not add unnecessary error handling or fallbacks

## Testing

- Prefer verifying changes on the deployed app at `https://targonos.targonglobal.com/<app>` (e.g., `https://targonos.targonglobal.com/xplan`) when feasible.
- Run the repo checks relevant to your changes (e.g., lint/type-check/tests) before opening PRs.

## Git Workflow

### Branch Naming

Use app name as prefix: `atlas/`, `xplan/`, `talos/`, `kairos/`, `hrms/`, `sso/`, `plutus/`

Examples: `xplan/fix-toolbar-visibility`, `talos/add-amazon-import`, `atlas/improve-loading`

### PR Workflow

Once work is complete:

1. **Test changes** - Verify behavior via deployed app and/or repo checks
2. **PR to dev** - Create a pull request targeting the `dev` branch
3. **Wait for GitHub CI to pass** - Do not proceed until all checks are green
4. **Review PR feedback** - Always read and address PR reviews/comments from anyone before merging
5. **Merge to dev** - Merge the PR yourself without waiting for approval
6. **PR to main** - Create a pull request from `dev` to `main` (PR must come from `dev` branch or CI will fail)
7. **Wait for GitHub CI to pass** - Ensure all checks pass on the main PR
8. **Review PR feedback** - Always read and address PR reviews/comments from anyone before merging
9. **Merge to main** - Merge the PR yourself without waiting for approval
10. **Delete merged branches** - Delete all feature/fix branches you created after they are merged (both remote and local)

Always wait for CI to pass before merging. Always read and address PR reviews/comments from anyone before merging. Merge PRs yourself without requiring approval. Always clean up your branches after merging.

### Handling Merge Conflicts

When `dev` and `main` diverge with conflicts:
1. Create a sync branch from `main`
2. Merge `dev` into it and resolve conflicts
3. PR the sync branch to `main`
4. After merge, sync `main` back into `dev` if needed

## Deployment & Caching

Do **not** suggest "hard refresh" or "cached version" as a troubleshooting step. Instead, use the in-app version badge (bottom-right) to confirm the deployed version and wait for the deploy pipeline if the version hasn't updated yet. If something isn't working, investigate the actual issue - don't blame caching.
