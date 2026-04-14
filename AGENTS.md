# Claude Code Instructions

**ACTUALLY READ EVERY FILE THAT IS RELATED TO A QUERY BEFORE ANSWERING IT - NEVER ASSUME**

## Database

All apps share `portal_db` on localhost:5432 with separate schemas per app. Connection strings are in each app's `.env.local` file.

| App | Schema |
|-----|--------|
| talos | dev_talos_us, dev_talos_uk |
| atlas | dev_atlas |
| xplan | dev_xplan |
| kairos | chronos |
| sso | auth |
| plutus | (no DB - uses QuickBooks API) |

Talos also has main schemas: `main_talos_us`, `main_talos_uk`.
Atlas also has main schema: `atlas`.

Access via Prisma Studio: `pnpm prisma studio` from the app folder.

## Code Style

- No OR statements as fallbacks - let the code fail
- Do not add unnecessary error handling or fallbacks
- **Be blocking** — prefer hard failures over fallbacks/optional behavior unless explicitly requested

## Testing

- Run the repo checks relevant to your changes (e.g., lint/type-check/tests) before opening PRs.

## Git Workflow

### Branch Naming

Use app name as prefix: `atlas/`, `xplan/`, `talos/`, `kairos/`, `sso/`, `plutus/`

Examples: `xplan/fix-toolbar-visibility`, `talos/add-amazon-import`, `atlas/improve-loading`

### PR Titles

PR titles must include:
- the app scope (e.g. `fix(talos): ...`)

Example: `fix(talos): use presigned URL for PO document uploads`

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

## Design Context

### Users

Internal operations teams working on desktop. Staff managing day-to-day business operations across warehousing (Talos), planning (xPlan), documents (Atlas), finance (Plutus), scheduling (Kairos), and communications (Hermes). These are power users who spend hours in the tool daily and need to move fast through data-dense workflows.

### Brand Personality

**Professional, reliable, clean.** The interface should feel like a trusted tool that gets out of the way. No personality theater — the brand earns trust through consistency, clarity, and quiet competence.

**Emotional goals:** Confidence & control, speed & efficiency, clarity & calm, trust & professionalism. Users should feel they have mastery over complex data and that the tool respects their time.

### Aesthetic Direction

**Visual tone:** Clean and professional. Data-forward without being sterile. Generous with whitespace but dense where the workflow demands it.

**Brand colors:** Navy `#002C51` (primary) + Teal `#00C2B9` (accent/secondary). Full semantic scales defined in `@targon/theme`.

**Typography:** Inter (sans) + JetBrains Mono (mono). No decorative fonts.

**Theme:** Light and dark modes via CSS variables + `next-themes`. Dark mode inverts the color hierarchy — teal becomes primary, navy becomes secondary.

**Anti-references:**
- Not playful/startup-y — no rounded illustrations, bright gradients, or casual vibes
- Not generic Bootstrap/template — should not look like a default admin dashboard kit
- Not over-designed/flashy — function over aesthetics, no decoration for decoration's sake

### Design Principles

1. **Clarity over cleverness** — Every element should earn its place. If a user has to think about the UI instead of their task, the design has failed.
2. **Density with hierarchy** — Operations teams need data density, but strong visual hierarchy (typography, spacing, color) prevents overwhelm.
3. **Consistency across apps** — All apps share `@targon/theme` and should feel like one product suite. Same colors, same type scale, same interaction patterns.
4. **Speed is a feature** — Minimal animation, fast interactions, keyboard-friendly. The interface should feel instant and responsive.
5. **Quiet confidence** — The design should feel solid and trustworthy without drawing attention to itself. No flashy effects, no unnecessary motion.
