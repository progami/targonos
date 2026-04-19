# Portal Landing Polish Design

## Goal

Polish the `apps/sso` landing experience so the portal feels like a deliberate control surface instead of a generic app grid. The signed-out and signed-in states should feel like the same product.

## Design Direction

- Tone: quiet command center
- Theme: dark, navy-led, restrained teal accents
- Outcome: faster scanning, clearer hierarchy, stronger first impression

## Signed-In Experience

- Add a real hero area that frames the portal as the user's launcher for workspaces and access.
- Surface compact operational summary data near the top: accessible apps, functional groups, public tools, platform-admin state.
- Keep category grouping, but make each group feel editorial and easier to scan.
- Sort accessible entries ahead of locked or unavailable entries inside each category.
- Upgrade cards from generic glow tiles to stronger product objects with clearer status, icon treatment, and launch affordance.

## Signed-Out Experience

- Rebuild the login page so it visually belongs to the portal instead of reading like a separate auth card.
- Use a split composition with a product-value panel and a focused sign-in panel.
- Keep the content practical: single sign-on, access-controlled apps, targonglobal.com restriction.

## Constraints

- Stay inside the TargonOS brand system: navy `#002C51`, teal `#00C2B9`, Inter, JetBrains Mono.
- Preserve existing authentication flow and app-launch behavior.
- Avoid ornamental dashboard tropes and avoid generic glass cards.

## Verification

- `pnpm --filter @targon/sso type-check`
- `pnpm --filter @targon/sso build` with explicit env injection for required local portal vars
