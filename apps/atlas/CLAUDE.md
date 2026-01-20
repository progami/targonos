# Atlas App - Claude Instructions

## Port Configuration

Use the correct port based on your branch/environment:

| Branch/Environment | Port | Command |
|-------------------|------|---------|
| main | 3006 | `PORT=3006 pnpm -F @targon/atlas dev` |
| dev | 3106 | `PORT=3106 pnpm -F @targon/atlas dev` |
| worktree | 3206 | `PORT=3206 pnpm -F @targon/atlas dev` |

If you are in a git worktree, always use port 3206 to avoid conflicts with dev (3106) or main (3006).

## Scope

You are only allowed to work on the `apps/atlas` folder. Do not modify files outside this directory.

## Git Workflow

1. Create feature branches from `dev`
2. PRs target `dev` branch
3. Always read and address PR reviews/comments from anyone before merging
4. After CI passes and PR is merged to `dev`, merge `dev` to `main`

## Code Style

- no OR statements as fallbacks - let the code fail
- Use TypeScript strict mode
- Follow existing patterns in the codebase

## Troubleshooting

- Do NOT suggest "cached version" or "clear cache" as a troubleshooting step - investigate the actual issue instead
